var test = require('node:test');
var assert = require('node:assert/strict');
var P = require('../src/pkjs/protocol');
var createCache = require('../src/pkjs/cache');
var createControl = require('../src/pkjs/control');
var createLink = require('../src/pkjs/link');
var createClient = require('../src/pkjs/tado');
var f = require('./fakes');

function setup(steps) {
  var clock = f.manualClock();
  var http = f.scriptedHttp(steps);
  var store = f.tokenStore(clock);
  var link = createLink({ http: http, storage: store, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  var client = createClient({ http: http, link: link });
  var cache = createCache({ storage: store, now: clock.now });
  return { http: http, store: store, control: createControl({ client: client, cache: cache, storage: store }) };
}

var TARGET = { homeId: 7, zoneId: 5, unit: 'CELSIUS' };

function run(t, target, command) {
  return new Promise(function(resolve) {
    t.control.execute(target, command, function(err) { resolve(err); });
  });
}

function sent(t) {
  var call = t.http.calls[t.http.calls.length - 1];
  return { method: call.method, url: call.url.replace('https://my.tado.com/api/v2', ''), body: call.body && JSON.parse(call.body) };
}

test('forcer 21,5 °C pendant 1 h : corps vérifié sur le compte', async function() {
  var t = setup([{ status: 200, body: {} }]);
  var err = await run(t, TARGET, { kind: P.CMD_FORCE, temp: 215, duration: P.DUR_60 });
  assert.equal(err, null);
  assert.deepEqual(sent(t), { method: 'PUT', url: '/homes/7/zones/5/overlay', body: {
    setting: { type: 'HEATING', power: 'ON', temperature: { celsius: 21.5 } },
    termination: { typeSkillBasedApp: 'TIMER', durationInSeconds: 3600 } } });
});

test('durées : 30 min, 2 h, prochain créneau, jusqu\'à nouvel ordre', async function() {
  var t = setup(new Array(4).fill({ status: 200, body: {} }));
  var seen = [];
  for (var d of [P.DUR_30, P.DUR_120, P.DUR_NEXT, P.DUR_MANUAL]) {
    await run(t, TARGET, { kind: P.CMD_FORCE, temp: 200, duration: d });
    seen.push(sent(t).body.termination);
  }
  assert.deepEqual(seen, [
    { typeSkillBasedApp: 'TIMER', durationInSeconds: 1800 },
    { typeSkillBasedApp: 'TIMER', durationInSeconds: 7200 },
    { typeSkillBasedApp: 'TADO_MODE' },
    { typeSkillBasedApp: 'MANUAL' }
  ]);
});

test('Fahrenheit : la consigne part en degrés Fahrenheit, sans conversion', async function() {
  var t = setup([{ status: 200, body: {} }]);
  await run(t, { homeId: 7, zoneId: 5, unit: 'FAHRENHEIT' }, { kind: P.CMD_FORCE, temp: 700, duration: P.DUR_30 });
  assert.deepEqual(sent(t).body.setting.temperature, { fahrenheit: 70 });
});

test('éteindre : chauffage coupé jusqu\'au prochain créneau', async function() {
  var t = setup([{ status: 200, body: {} }]);
  await run(t, TARGET, { kind: P.CMD_OFF });
  assert.deepEqual(sent(t).body, { setting: { type: 'HEATING', power: 'OFF' }, termination: { typeSkillBasedApp: 'TADO_MODE' } });
});

test('retour à la programmation : suppression du forçage', async function() {
  var t = setup([{ status: 204 }]);
  var err = await run(t, TARGET, { kind: P.CMD_SCHEDULE });
  assert.equal(err, null);
  assert.deepEqual(sent(t), { method: 'DELETE', url: '/homes/7/zones/5/overlay', body: undefined });
});

test('commande inconnue ou durée inconnue : refusée sans requête', async function() {
  var t = setup([]);
  var err = await run(t, TARGET, { kind: P.CMD_FORCE, temp: 200, duration: 99 });
  assert.equal(err.kind, 'refused');
  assert.equal(t.http.calls.length, 0);
});

test('dernier forçage : mémorisé après confirmation seulement, par pièce et par unité', async function() {
  var t = setup([{ status: 422, body: {} }, { status: 200, body: {} }]);
  await run(t, TARGET, { kind: P.CMD_FORCE, temp: 215, duration: P.DUR_60 });
  assert.equal(t.control.last(5, 'CELSIUS'), null, 'refusé : rien de mémorisé');
  await run(t, TARGET, { kind: P.CMD_FORCE, temp: 215, duration: P.DUR_60 });
  assert.deepEqual(t.control.last(5, 'CELSIUS'), { temp: 215, duration: P.DUR_60, unit: 'CELSIUS' });
  assert.equal(t.control.last(6, 'CELSIUS'), null);
  assert.equal(t.control.last(5, 'FAHRENHEIT'), null);
});

test('plage de consigne : pas de 0,5 °C, ou 1 °F, valeurs lues chez Tado', async function() {
  var caps = { type: 'HEATING', temperatures: { celsius: { min: 5, max: 25, step: 0.1 }, fahrenheit: { min: 41, max: 77, step: 0.1 } } };
  var t = setup([{ status: 200, body: caps }]);
  var got = await new Promise(function(r) { t.control.range(TARGET, function(e, v) { r(v); }); });
  assert.deepEqual(got, { min: 50, max: 250, step: 5 });
  // Mise en cache : pas de seconde requête, et Fahrenheit relit la même réponse.
  var f2 = await new Promise(function(r) { t.control.range({ homeId: 7, zoneId: 5, unit: 'FAHRENHEIT' }, function(e, v) { r(v); }); });
  assert.deepEqual(f2, { min: 410, max: 770, step: 10 });
  assert.equal(t.http.calls.length, 1);
});

test('résultats : correspondance avec les familles d\'erreur', function() {
  var r = createControl.resultFor;
  assert.equal(r(null), P.RES_OK);
  assert.equal(r({ kind: 'network' }), P.RES_OFFLINE);
  assert.equal(r({ kind: 'refused' }), P.RES_REFUSED);
  assert.equal(r({ kind: 'forbidden' }), P.RES_REFUSED);
  assert.equal(r({ kind: 'server' }), P.RES_FAILED);
  assert.equal(r({ kind: 'rate' }), P.RES_FAILED);
});
