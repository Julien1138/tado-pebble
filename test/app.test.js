var test = require('node:test');
var assert = require('node:assert/strict');
var P = require('../src/pkjs/protocol');
var createApp = require('../src/pkjs/app');
var createMessenger = require('../src/pkjs/messaging');
var createCache = require('../src/pkjs/cache');
var createHome = require('../src/pkjs/home');
var createLink = require('../src/pkjs/link');
var createClient = require('../src/pkjs/tado');
var createControl = require('../src/pkjs/control');
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
                        views: views, cache: cache, openUrl: function(u) { opened.push(u); },
                        control: createControl({ client: client, cache: cache, storage: store }) });
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

test('détail : répond depuis les données déjà lues, sans nouvelle requête', async function() {
  var t = setup(OPEN.slice());
  t.app.onMessage(get(1));
  await f.settle(); await f.settle();
  var calls = t.http.calls.length;
  t.sent.length = 0;
  t.app.onMessage({ MsgType: P.MSG_GET, Seq: 2, Object: P.OBJ_DETAIL, Index: 1 });
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, calls);
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].MsgType, P.MSG_DETAIL);
  assert.equal(t.sent[0].Seq, 2);
  assert.equal(t.sent[0].Index, 1);
  assert.equal(t.sent[0].Mode, P.MODE_SCHEDULE);
  assert.equal(t.sent[0].Humidity, P.NONE);
});

function command(extra) {
  var m = { MsgType: P.MSG_DO, Seq: 9, Command: P.CMD_FORCE, Index: 1, Temp: 215, Duration: P.DUR_60 };
  Object.keys(extra || {}).forEach(function(k) { m[k] = extra[k]; });
  return m;
}

async function opened(extraSteps) {
  var t = setup(OPEN.slice().concat(extraSteps));
  t.app.onMessage(get(1));
  await f.settle(); await f.settle();
  t.sent.length = 0;
  return t;
}

test('commande réussie : écriture, relecture sans cache, accusé puis vue relue', async function() {
  var t = await opened([{ status: 200, body: {} }, { status: 200, body: ZONE_STATES },
                        { status: 200, body: { presence: 'HOME', presenceLocked: false } }]);
  var calls = t.http.calls.length;
  t.app.onMessage(command());
  await f.settle(); await f.settle(); await f.settle();
  var tail = t.http.calls.slice(calls).map(function(c) { return c.method + ' ' + c.url.replace('https://my.tado.com/api/v2', ''); });
  assert.deepEqual(tail, ['PUT /homes/7/zones/1/overlay', 'GET /homes/7/zoneStates', 'GET /homes/7/state']);
  var kinds = t.sent.map(function(m) { return m.MsgType; });
  assert.deepEqual(kinds, [P.MSG_ACK, P.MSG_STATUS, P.MSG_ROOMS_HEAD, P.MSG_ROOM, P.MSG_ROOM]);
  assert.equal(t.sent[0].Result, P.RES_OK);
  assert.equal(t.sent[0].Seq, 9);
});

test('commande refusée par Tado : accusé « refusé », rien d\'autre, aucune relecture', async function() {
  var t = await opened([{ status: 422, body: { errors: [] } }]);
  var calls = t.http.calls.length;
  t.app.onMessage(command());
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, calls + 1);
  assert.deepEqual(t.sent.map(function(m) { return [m.MsgType, m.Result]; }), [[P.MSG_ACK, P.RES_REFUSED]]);
});

test('commande sans connexion : accusé « hors connexion », jamais retentée', async function() {
  var t = await opened([{ error: { kind: 'network' } }]);
  var calls = t.http.calls.length;
  t.app.onMessage(command({ Command: P.CMD_SCHEDULE }));
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, calls + 1);
  assert.equal(t.sent[0].Result, P.RES_OFFLINE);
});

test('commande : liaison perdue, accusé en échec puis état de liaison', async function() {
  var t = await opened([{ status: 401 }, { status: 400, body: { error: 'invalid_grant' } }]);
  t.app.onMessage(command({ Command: P.CMD_OFF }));
  await f.settle(); await f.settle(); await f.settle();
  assert.deepEqual(t.sent.map(function(m) { return m.MsgType; }), [P.MSG_ACK, P.MSG_STATUS]);
  assert.equal(t.sent[0].Result, P.RES_FAILED);
  assert.equal(t.sent[1].Link, P.LINK_LOST);
});

test('commande sur une pièce inconnue : refusée sans requête d\'écriture', async function() {
  var t = await opened([]);
  var calls = t.http.calls.length;
  t.app.onMessage(command({ Index: 7 }));
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, calls);
  assert.equal(t.sent[0].Result, P.RES_REFUSED);
});

test('plage de consigne : une requête, puis le détail annonce le dernier forçage', async function() {
  var caps = { type: 'HEATING', temperatures: { celsius: { min: 5, max: 25, step: 0.1 }, fahrenheit: { min: 41, max: 77, step: 0.1 } } };
  var t = await opened([{ status: 200, body: caps }, { status: 200, body: {} }, { status: 200, body: ZONE_STATES },
                        { status: 200, body: { presence: 'HOME', presenceLocked: false } }]);
  t.app.onMessage({ MsgType: P.MSG_GET, Seq: 3, Object: P.OBJ_CAPS, Index: 1 });
  await f.settle(); await f.settle();
  assert.deepEqual([t.sent[0].MsgType, t.sent[0].Index, t.sent[0].CapMin, t.sent[0].CapMax, t.sent[0].CapStep],
                   [P.MSG_CAPS, 1, 50, 250, 5]);
  t.app.onMessage(command());
  await f.settle(); await f.settle(); await f.settle();
  t.sent.length = 0;
  t.app.onMessage({ MsgType: P.MSG_GET, Seq: 5, Object: P.OBJ_DETAIL, Index: 1 });
  await f.settle(); await f.settle();
  assert.equal(t.sent[0].LastTemp, 215);
  assert.equal(t.sent[0].LastDur, P.DUR_60);
});

test('détail demandé avec rechargement : pièces relues chez Tado, renvoyées puis détail', async function() {
  var t = await opened([{ status: 200, body: ZONE_STATES }, { status: 200, body: { presence: 'HOME', presenceLocked: false } }]);
  var calls = t.http.calls.length;
  t.app.onMessage({ MsgType: P.MSG_GET, Seq: 6, Object: P.OBJ_DETAIL, Index: 1, Refresh: 1 });
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, calls + 2, 'zoneStates et state relus');
  assert.deepEqual(t.sent.map(function(m) { return m.MsgType; }),
                   [P.MSG_STATUS, P.MSG_ROOMS_HEAD, P.MSG_ROOM, P.MSG_ROOM, P.MSG_DETAIL]);
  assert.ok(t.sent.every(function(m) { return m.Seq === 6; }), 'une seule séquence pour tout');
});

test('plage de consigne demandée avec rechargement : pièces relues puis plage', async function() {
  var caps = { type: 'HEATING', temperatures: { celsius: { min: 5, max: 25 }, fahrenheit: { min: 41, max: 77 } } };
  var t = await opened([{ status: 200, body: ZONE_STATES }, { status: 200, body: { presence: 'HOME', presenceLocked: false } },
                        { status: 200, body: caps }]);
  t.app.onMessage({ MsgType: P.MSG_GET, Seq: 7, Object: P.OBJ_CAPS, Index: 0, Refresh: 1 });
  await f.settle(); await f.settle(); await f.settle();
  assert.deepEqual(t.sent.map(function(m) { return m.MsgType; }),
                   [P.MSG_STATUS, P.MSG_ROOMS_HEAD, P.MSG_ROOM, P.MSG_ROOM, P.MSG_CAPS]);
});

test('détail avec rechargement, Tado injoignable : copie conservée, indicateur hors connexion', async function() {
  var t = await opened([{ error: { kind: 'network' } }, { error: { kind: 'network' } },
                        { error: { kind: 'network' } }, { error: { kind: 'network' } }]);
  t.clock.tick(10 * 60000);
  t.app.onMessage({ MsgType: P.MSG_GET, Seq: 8, Object: P.OBJ_DETAIL, Index: 0, Refresh: 1 });
  await f.settle(); await f.settle(); await f.settle();
  assert.equal(t.sent[0].MsgType, P.MSG_STATUS);
  assert.equal(t.sent[0].Indicators, P.IND_OFFLINE);
  assert.equal(t.sent[t.sent.length - 1].MsgType, P.MSG_DETAIL, 'le détail vient du cache périmé');
});

var DEVICES = [
  { id: 1, name: 'A', settings: { geoTrackingEnabled: true }, location: null },
  { id: 2, name: 'B', settings: { geoTrackingEnabled: true }, location: { atHome: false } },
  { id: 3, name: 'C', settings: { geoTrackingEnabled: true }, location: { atHome: true } },
  { id: 4, name: 'D', settings: { geoTrackingEnabled: false }, location: { atHome: true } }
];

function presenceCommand(mode) {
  return { MsgType: P.MSG_DO, Seq: 11, Command: P.CMD_PRESENCE, PresenceMode: mode };
}

test('présence : mode Auto, état Présent, un appareil suivi sur deux est à la maison', async function() {
  var t = await opened([{ status: 200, body: DEVICES }]);
  var calls = t.http.calls.length;
  t.app.onMessage({ MsgType: P.MSG_GET, Seq: 10, Object: P.OBJ_PRESENCE });
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, calls + 1, 'seuls les appareils sont lus : l\'état est en cache');
  var m = t.sent[0];
  assert.deepEqual([m.MsgType, m.PresenceMode, m.PresenceState, m.DevicesHome, m.DevicesTracked, m.AutoUnavailable],
                   [P.MSG_PRESENCE, P.PRESENCE_AUTO, P.PRESENCE_HOME, 1, 2, 0]);
});

test('présence imposée Absent : écriture, relecture, accusé puis mode et état résultants', async function() {
  var t = await opened([{ status: 200, body: DEVICES }, { status: 204 }, { status: 200, body: ZONE_STATES },
                        { status: 200, body: { presence: 'AWAY', presenceLocked: true } }]);
  var calls = t.http.calls.length;
  t.app.onMessage(presenceCommand(P.PRESENCE_AWAY));
  await f.settle(); await f.settle(); await f.settle();
  var tail = t.http.calls.slice(calls).map(function(c) { return c.method + ' ' + c.url.replace('https://my.tado.com/api/v2', ''); });
  assert.deepEqual(tail, ['GET /homes/7/mobileDevices', 'PUT /homes/7/presenceLock', 'GET /homes/7/zoneStates', 'GET /homes/7/state']);
  assert.deepEqual(JSON.parse(t.http.calls[calls + 1].body), { homePresence: 'AWAY' });
  assert.deepEqual(t.sent.map(function(m) { return m.MsgType; }),
                   [P.MSG_ACK, P.MSG_PRESENCE, P.MSG_STATUS, P.MSG_ROOMS_HEAD, P.MSG_ROOM, P.MSG_ROOM]);
  assert.equal(t.sent[0].Result, P.RES_OK);
  assert.equal(t.sent[1].PresenceMode, P.PRESENCE_AWAY);
  assert.equal(t.sent[1].PresenceState, P.PRESENCE_AWAY);
  assert.equal(t.sent[2].PresenceState, P.PRESENCE_AWAY, 'le titre de la liste suit');
});

test('retour à Auto : DELETE de la présence imposée', async function() {
  var t = await opened([{ status: 200, body: DEVICES }, { status: 204 }, { status: 200, body: ZONE_STATES },
                        { status: 200, body: { presence: 'HOME', presenceLocked: false } }]);
  var calls = t.http.calls.length;
  t.app.onMessage(presenceCommand(P.PRESENCE_AUTO));
  await f.settle(); await f.settle(); await f.settle();
  assert.equal(t.http.calls[calls + 1].method, 'DELETE');
  assert.equal(t.sent[1].PresenceMode, P.PRESENCE_AUTO);
});

test('Auto refusé (403) : accusé « Auto indisponible », mémorisé, Auto n\'est plus offert', async function() {
  var t = await opened([{ status: 200, body: DEVICES }, { status: 403, body: {} }]);
  t.app.onMessage(presenceCommand(P.PRESENCE_AUTO));
  await f.settle(); await f.settle();
  assert.equal(t.sent[0].Result, P.RES_AUTO_UNAVAILABLE);
  assert.equal(t.sent[1].AutoUnavailable, 1);
  assert.equal(t.store.data['tado.autoUnavailable'], '1');
  t.sent.length = 0;
  t.app.onMessage({ MsgType: P.MSG_GET, Seq: 12, Object: P.OBJ_PRESENCE });
  await f.settle(); await f.settle();
  assert.equal(t.sent[0].AutoUnavailable, 1);
});

test('présence sans connexion : refusée, jamais retentée', async function() {
  var t = await opened([{ status: 200, body: DEVICES }, { error: { kind: 'network' } }]);
  var calls = t.http.calls.length;
  t.app.onMessage(presenceCommand(P.PRESENCE_HOME));
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, calls + 2);
  assert.equal(t.sent[0].Result, P.RES_OFFLINE);
  assert.equal(t.sent.length, 1);
});

test('présence : mode inconnu refusé sans requête d\'écriture', async function() {
  var t = await opened([{ status: 200, body: DEVICES }]);
  var calls = t.http.calls.length;
  t.app.onMessage(presenceCommand(9));
  await f.settle(); await f.settle();
  assert.equal(t.http.calls.length, calls + 1, 'seulement la lecture des appareils');
  assert.equal(t.sent[0].Result, P.RES_REFUSED);
});
