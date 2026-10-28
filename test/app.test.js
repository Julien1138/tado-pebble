var test = require('node:test');
var assert = require('node:assert/strict');
var P = require('../src/pkjs/protocol');
var createApp = require('../src/pkjs/app');
var createMessenger = require('../src/pkjs/messaging');
var createCache = require('../src/pkjs/cache');
var createHome = require('../src/pkjs/home');
var createLink = require('../src/pkjs/link');
var createClient = require('../src/pkjs/tado');
var views = require('../src/pkjs/views');
var f = require('./fakes');

var ZONES = [
  { id: 5, name: 'Bureau', type: 'HEATING' },
  { id: 9, name: 'Eau chaude', type: 'HOT_WATER' },
  { id: 1, name: 'Salon', type: 'HEATING' }
];
function zoneState(temp, set) {
  return {
    setting: { type: 'HEATING', power: 'ON', temperature: { celsius: set, fahrenheit: set * 1.8 + 32 } },
    activityDataPoints: { heatingPower: { percentage: 0 } },
    sensorDataPoints: { insideTemperature: { celsius: temp, fahrenheit: temp * 1.8 + 32 } },
    overlay: null, openWindow: null, link: { state: 'ONLINE' }
  };
}
var ZONE_STATES = { zoneStates: { 1: zoneState(19.4, 21), 5: zoneState(17.85, 16), 9: zoneState(50, 50) } };
var OPEN = [
  { status: 200, body: { homes: [{ id: 7 }] } },
  { status: 200, body: { temperatureUnit: 'CELSIUS' } },
  { status: 200, body: ZONES },
  { status: 200, body: ZONE_STATES },
  { status: 200, body: { presence: 'HOME', presenceLocked: false } }
];

function setup(steps, linked) {
  var clock = f.manualClock();
  var http = f.scriptedHttp(steps);
  var store = linked === false ? f.memoryStorage() : f.tokenStore(clock);
  var link = createLink({ http: http, storage: store, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  var client = createClient({ http: http, link: link });
  var cache = createCache({ storage: store, now: clock.now });
  var sent = [];
  var opened = [];
  var messenger = createMessenger({ pebble: { sendAppMessage: function(m, ok) { sent.push(m); setImmediate(ok); } } });
  var app = createApp({ messenger: messenger, link: link, home: createHome({ client: client, cache: cache }),
                        views: views, cache: cache, openUrl: function(u) { opened.push(u); } });
  return { app: app, sent: sent, opened: opened, http: http, clock: clock, store: store };
}

function get(seq, extra) {
  var m = { MsgType: P.MSG_GET, Seq: seq, Object: P.OBJ_ROOMS };
  Object.keys(extra || {}).forEach(function(k) { m[k] = extra[k]; });
  return m;
}

test('ouverture : STATUS, tête, puis une ligne par pièce chauffée dans l\'ordre de Tado', async function() {
  var t = setup(OPEN.slice());
  t.app.onMessage(get(1));
  await f.settle();
  await f.settle();
  assert.deepEqual(t.sent.map(function(m) { return m.MsgType; }), [P.MSG_STATUS, P.MSG_ROOMS_HEAD, P.MSG_ROOM, P.MSG_ROOM]);
  assert.equal(t.sent[0].Seq, 1);
  assert.equal(t.sent[0].Link, P.LINK_ACTIVE);
  assert.equal(t.sent[0].PresenceState, P.PRESENCE_HOME);
  assert.equal(t.sent[1].Count, 2);
  assert.equal(t.sent[2].Name, 'Bureau');
  assert.equal(t.sent[2].Temp, 179);
  assert.equal(t.sent[3].Name, 'Salon');
  assert.equal(t.sent[3].Index, 1);
  assert.equal(t.http.calls.length, 5);
});

test('deuxième ouverture dans les 5 minutes : aucune requête ; actualiser : zoneStates et state relus', async function() {
  var t = setup(OPEN.slice().concat([{ status: 200, body: ZONE_STATES }, { status: 200, body: { presence: 'HOME', presenceLocked: false } }]));
  t.app.onMessage(get(1));
  await f.settle(); await f.settle();
  t.clock.tick(60000);
  t.app.onMessage(get(2));
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, 5);
  var status = t.sent.filter(function(m) { return m.MsgType === P.MSG_STATUS; })[1];
  assert.equal(status.Seq, 2);
  assert.equal(status.Age, 60);
  t.app.onMessage(get(3, { Refresh: 1 }));
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, 7);
});

test('non lié : STATUS non lié, sans requête', async function() {
  var t = setup([], false);
  t.app.onMessage(get(1));
  await f.settle();
  assert.equal(t.sent[0].Link, P.LINK_NONE);
  assert.equal(t.http.calls.length, 0);
});

test('liaison perdue : STATUS perdue', async function() {
  var t = setup([{ status: 401 }, { status: 400, body: { error: 'invalid_grant' } }]);
  t.app.onMessage(get(1));
  await f.settle(); await f.settle();
  assert.equal(t.sent[0].Link, P.LINK_LOST);
});

test('Tado injoignable sans copie : STATUS hors connexion', async function() {
  var t = setup([{ error: { kind: 'network' } }, { error: { kind: 'network' } }]);
  t.app.onMessage(get(1));
  await f.settle(); await f.settle();
  assert.equal(t.sent[0].Indicators, P.IND_OFFLINE);
  assert.equal(t.sent.length, 1);
});

test('Tado injoignable avec copie : la copie est servie, hors connexion et son âge', async function() {
  var steps = OPEN.slice().concat([{ error: { kind: 'network' } }, { error: { kind: 'network' } },
    { error: { kind: 'network' } }, { error: { kind: 'network' } }]);
  var t = setup(steps);
  t.app.onMessage(get(1));
  await f.settle(); await f.settle();
  t.clock.tick(10 * 60000);
  t.sent.length = 0;
  t.app.onMessage(get(2));
  await f.settle(); await f.settle(); await f.settle();
  assert.equal(t.sent[0].Indicators, P.IND_OFFLINE);
  assert.equal(t.sent[0].Age, 600);
  assert.equal(t.sent.filter(function(m) { return m.MsgType === P.MSG_ROOM; }).length, 2);
});

test('liaison : code envoyé à la montre, page ouverte, puis STATUS actif', async function() {
  var steps = [
    { status: 200, body: { device_code: 'DC', user_code: 'ABC123', verification_uri_complete: 'https://x/y', expires_in: 300, interval: 5 } },
    { status: 200, body: { access_token: 'A', refresh_token: 'R', expires_in: 600 } }
  ];
  var t = setup(steps, false);
  t.app.onMessage({ MsgType: P.MSG_DO, Seq: 4, Command: P.CMD_LINK });
  await f.settle();
  assert.equal(t.sent[0].MsgType, P.MSG_LINK_CODE);
  assert.equal(t.sent[0].LinkCode, 'ABC123');
  assert.equal(t.sent[0].LinkSeconds, 300);
  assert.deepEqual(t.opened, ['https://x/y']);
  t.clock.tick(5000);
  await f.settle(); await f.settle();
  var kinds = t.sent.map(function(m) { return m.MsgType; });
  assert.deepEqual(kinds, [P.MSG_LINK_CODE, P.MSG_STATUS, P.MSG_LINK_CODE]);
  assert.equal(t.sent[1].Link, P.LINK_ACTIVE);
  assert.equal(t.sent[2].LinkState, P.CODE_VALID);
});

test('liaison refusée ou expirée : état du code', async function() {
  var steps = [
    { status: 200, body: { device_code: 'DC', user_code: 'ABC123', verification_uri_complete: 'https://x/y', expires_in: 300, interval: 5 } },
    { status: 400, body: { error: 'access_denied' } }
  ];
  var t = setup(steps, false);
  t.app.onMessage({ MsgType: P.MSG_DO, Seq: 4, Command: P.CMD_LINK });
  await f.settle();
  t.clock.tick(5000);
  await f.settle(); await f.settle();
  assert.equal(t.sent[1].LinkState, P.CODE_DENIED);
});

test('délier : jetons et cache effacés, STATUS non lié', async function() {
  var t = setup(OPEN.slice());
  t.app.onMessage(get(1));
  await f.settle(); await f.settle();
  t.sent.length = 0;
  t.app.onMessage({ MsgType: P.MSG_DO, Seq: 2, Command: P.CMD_UNLINK });
  await f.settle();
  assert.equal(t.sent[0].Link, P.LINK_NONE);
  assert.equal(Object.keys(t.store.data).length, 0);
});

test('messagerie : une nouvelle demande abandonne la file de la précédente', async function() {
  var sent = [];
  var pending = [];
  var m = createMessenger({ pebble: { sendAppMessage: function(msg, ok) { sent.push(msg.n); pending.push(ok); } } });
  m.replace([{ n: 1 }, { n: 2 }, { n: 3 }]);
  m.replace([{ n: 10 }]);
  pending.shift()();
  assert.deepEqual(sent, [1, 10]);
});

test('messagerie : un envoi refusé est retenté une fois, puis la file est abandonnée', function() {
  var sent = [];
  var fails = [];
  var m = createMessenger({ pebble: { sendAppMessage: function(msg, ok, fail) { sent.push(msg.n); fails.push(fail); } } });
  m.replace([{ n: 1 }, { n: 2 }]);
  fails.shift()();
  fails.shift()();
  assert.deepEqual(sent, [1, 1]);
  m.replace([{ n: 3 }]);
  assert.deepEqual(sent, [1, 1, 3]);
});

test('liaison : l\'adresse de validation reste disponible tant que la liaison est en cours', async function() {
  var steps = [
    { status: 200, body: { device_code: 'DC', user_code: 'ABC123', verification_uri_complete: 'https://x/y', expires_in: 300, interval: 5 } },
    { status: 200, body: { access_token: 'A', refresh_token: 'R', expires_in: 600 } }
  ];
  var t = setup(steps, false);
  assert.equal(t.app.pendingLinkUrl(), null);
  t.app.onMessage({ MsgType: P.MSG_DO, Seq: 4, Command: P.CMD_LINK });
  await f.settle();
  assert.equal(t.app.pendingLinkUrl(), 'https://x/y');
  t.clock.tick(5000);
  await f.settle(); await f.settle();
  assert.equal(t.app.pendingLinkUrl(), null);
});
