var test = require('node:test');
var assert = require('node:assert/strict');
var createLink = require('../src/pkjs/link');
var createClient = require('../src/pkjs/tado');
var f = require('./fakes');

function setup(steps, tokenOverrides) {
  var clock = f.manualClock();
  var http = f.scriptedHttp(steps);
  var store = f.tokenStore(clock, tokenOverrides);
  var link = createLink({
    http: http, storage: store, now: clock.now,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer
  });
  return { http: http, store: store, link: link, client: createClient({ http: http, link: link }) };
}

function once(fn) {
  return new Promise(function(resolve) {
    fn(function(err, body) { resolve({ err: err, body: body }); });
  });
}

var REFRESHED = { status: 200, body: { access_token: 'A2', refresh_token: 'R2', expires_in: 600 } };

test('lecture : adresse, jeton porteur, corps décodé', async function() {
  var t = setup([{ status: 200, body: { zoneStates: {} } }]);
  var r = await once(function(cb) { t.client.getZoneStates(120677, cb); });
  assert.equal(r.err, null);
  assert.deepEqual(r.body, { zoneStates: {} });
  var call = t.http.calls[0];
  assert.equal(call.method, 'GET');
  assert.equal(call.url, 'https://my.tado.com/api/v2/homes/120677/zoneStates');
  assert.equal(call.headers.Authorization, 'Bearer A1');
  assert.equal(call.body, undefined);
});

test('adresses des requêtes vérifiées sur le compte', async function() {
  var t = setup(new Array(12).fill({ status: 204 }));
  var c = t.client;
  var calls = [
    function(cb) { c.getMe(cb); },
    function(cb) { c.getHome(1, cb); },
    function(cb) { c.getState(1, cb); },
    function(cb) { c.getMobileDevices(1, cb); },
    function(cb) { c.getZones(1, cb); },
    function(cb) { c.getAirComfort(1, cb); },
    function(cb) { c.getCapabilities(1, 5, cb); },
    function(cb) { c.getDayReport(1, 5, '2026-10-28', cb); },
    function(cb) { c.getZoneState(1, 5, cb); },
    function(cb) { c.deleteOverlay(1, 5, cb); },
    function(cb) { c.putPresenceLock(1, 'AWAY', cb); },
    function(cb) { c.deletePresenceLock(1, cb); }
  ];
  for (var i = 0; i < calls.length; i++) {
    await once(calls[i]);
  }
  var urls = t.http.calls.map(function(x) { return x.method + ' ' + x.url.replace('https://my.tado.com/api/v2', ''); });
  assert.deepEqual(urls, [
    'GET /me', 'GET /homes/1', 'GET /homes/1/state', 'GET /homes/1/mobileDevices',
    'GET /homes/1/zones', 'GET /homes/1/airComfort', 'GET /homes/1/zones/5/capabilities',
    'GET /homes/1/zones/5/dayReport?date=2026-10-28', 'GET /homes/1/zones/5/state',
    'DELETE /homes/1/zones/5/overlay', 'PUT /homes/1/presenceLock', 'DELETE /homes/1/presenceLock'
  ]);
  assert.equal(t.http.calls[10].body, '{"homePresence":"AWAY"}');
});

test('forçage : forme du corps vérifiée sur le compte', async function() {
  var t = setup([{ status: 200, body: { type: 'MANUAL' } }]);
  var r = await once(function(cb) {
    t.client.putOverlay(1, 5, { type: 'HEATING', power: 'ON', temperature: { fahrenheit: 62 } },
      { typeSkillBasedApp: 'TIMER', durationInSeconds: 3600 }, cb);
  });
  assert.deepEqual(r.body, { type: 'MANUAL' });
  var call = t.http.calls[0];
  assert.equal(call.method, 'PUT');
  assert.equal(call.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.body), {
    setting: { type: 'HEATING', power: 'ON', temperature: { fahrenheit: 62 } },
    termination: { typeSkillBasedApp: 'TIMER', durationInSeconds: 3600 }
  });
});

test('204 sans corps : succès', async function() {
  var t = setup([{ status: 204 }]);
  var r = await once(function(cb) { t.client.deleteOverlay(1, 5, cb); });
  assert.equal(r.err, null);
  assert.equal(r.body, null);
});

test('401 : rafraîchit puis rejoue une seule fois avec le nouveau jeton', async function() {
  var t = setup([{ status: 401 }, REFRESHED, { status: 200, body: { ok: 1 } }]);
  var r = await once(function(cb) { t.client.getState(1, cb); });
  assert.deepEqual(r.body, { ok: 1 });
  assert.equal(t.http.calls[2].headers.Authorization, 'Bearer A2');
  assert.equal(JSON.parse(t.store.data['tado.tokens']).refresh, 'R2');
});

test('401 encore après rafraîchissement : liaison perdue, jetons effacés', async function() {
  var t = setup([{ status: 401 }, REFRESHED, { status: 401 }]);
  var r = await once(function(cb) { t.client.getState(1, cb); });
  assert.equal(r.err.kind, 'lost');
  assert.equal(t.link.isLinked(), false);
});

test('non lié : erreur unlinked sans requête', async function() {
  var t = setup([]);
  t.link.unlink();
  var r = await once(function(cb) { t.client.getState(1, cb); });
  assert.equal(r.err.kind, 'unlinked');
  assert.equal(t.http.calls.length, 0);
});

test('erreurs normalisées', async function() {
  var cases = [
    [403, 'forbidden'], [404, 'notfound'], [422, 'refused'], [429, 'rate'], [400, 'http']
  ];
  for (var i = 0; i < cases.length; i++) {
    var t = setup([{ status: cases[i][0], body: { errors: [] } }]);
    var r = await once(function(cb) { t.client.putPresenceLock(1, 'HOME', cb); });
    assert.equal(r.err.kind, cases[i][1]);
    assert.equal(r.err.status, cases[i][0]);
  }
});

test('lecture : une seule nouvelle tentative si Tado est injoignable ou en erreur', async function() {
  var t = setup([{ error: { kind: 'network' } }, { status: 200, body: { ok: 1 } }]);
  var r = await once(function(cb) { t.client.getState(1, cb); });
  assert.deepEqual(r.body, { ok: 1 });
  assert.equal(t.http.calls.length, 2);

  var t2 = setup([{ status: 503 }, { status: 502 }]);
  var r2 = await once(function(cb) { t2.client.getState(1, cb); });
  assert.equal(r2.err.kind, 'server');
  assert.equal(t2.http.calls.length, 2);

  var t3 = setup([{ error: { kind: 'network' } }, { error: { kind: 'network' } }]);
  var r3 = await once(function(cb) { t3.client.getState(1, cb); });
  assert.equal(r3.err.kind, 'network');
});

test('commande : jamais retentée', async function() {
  var t = setup([{ error: { kind: 'network' } }]);
  var r = await once(function(cb) { t.client.deletePresenceLock(1, cb); });
  assert.equal(r.err.kind, 'network');
  assert.equal(t.http.calls.length, 1);

  var t2 = setup([{ status: 500 }]);
  var r2 = await once(function(cb) { t2.client.deleteOverlay(1, 5, cb); });
  assert.equal(r2.err.kind, 'server');
  assert.equal(t2.http.calls.length, 1);
});

test('raccourcis groupés : adresses et corps vérifiés sur le compte', async function() {
  var t = setup([{ status: 200, body: {} }, { status: 200, body: {} }]);
  var off = { type: 'HEATING', power: 'OFF' };
  var manual = { typeSkillBasedApp: 'MANUAL' };
  await once(function(cb) { t.client.postOverlays(7, [{ room: 1, setting: off, termination: manual }, { room: 5, setting: off, termination: manual }], cb); });
  await once(function(cb) { t.client.deleteOverlays(7, [1, 5, 14], cb); });
  var post = t.http.calls[0];
  assert.equal(post.method, 'POST');
  assert.equal(post.url, 'https://my.tado.com/api/v2/homes/7/overlay');
  assert.deepEqual(JSON.parse(post.body), { overlays: [
    { overlay: { setting: off, termination: manual }, room: 1 },
    { overlay: { setting: off, termination: manual }, room: 5 } ] });
  var del = t.http.calls[1];
  assert.equal(del.method, 'DELETE');
  assert.equal(del.url, 'https://my.tado.com/api/v2/homes/7/overlay?rooms=1,5,14');
  assert.equal(del.body, undefined);
});
