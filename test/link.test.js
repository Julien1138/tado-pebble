var test = require('node:test');
var assert = require('node:assert/strict');
var createLink = require('../src/pkjs/link');
var f = require('./fakes');

function setup(steps, storage) {
  var clock = f.manualClock();
  var http = f.scriptedHttp(steps);
  var store = storage ? storage(clock) : f.memoryStorage();
  var link = createLink({
    http: http, storage: store, now: clock.now,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer
  });
  return { clock: clock, http: http, store: store, link: link };
}

function saved(store) {
  return JSON.parse(store.data['tado.tokens']);
}

var AUTHORIZED = {
  status: 200,
  body: { device_code: 'DC', user_code: 'ABC123', verification_uri_complete: 'https://x/y',
          expires_in: 300, interval: 5 }
};
var PENDING = { status: 400, body: { error: 'authorization_pending' } };
var TOKENS = { status: 200, body: { access_token: 'A1', refresh_token: 'R1', expires_in: 600 } };

test('liaison : affiche le code, interroge toutes les 5 s, écrit les jetons avant de conclure', async function() {
  var t = setup([AUTHORIZED, PENDING, TOKENS]);
  var events = [];
  t.link.begin({
    onCode: function(info) { events.push(['code', info]); },
    onDone: function(err) { events.push(['done', err, t.store.data['tado.tokens'] !== undefined]); }
  });
  await f.settle();
  assert.deepEqual(events[0], ['code', { userCode: 'ABC123', url: 'https://x/y', expiresIn: 300 }]);
  assert.match(t.http.calls[0].body, /scope=offline_access/);

  t.clock.tick(5000);
  await f.settle();
  assert.equal(events.length, 1, 'encore en attente');
  t.clock.tick(5000);
  await f.settle();
  assert.deepEqual(events[1], ['done', null, true]);
  assert.match(t.http.calls[1].body, /device_code=DC/);
  assert.match(t.http.calls[1].body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code/);
  assert.equal(saved(t.store).refresh, 'R1');
  assert.equal(t.link.isLinked(), true);
});

test('liaison : slow_down allonge l\'intervalle de 5 s', async function() {
  var t = setup([AUTHORIZED, { status: 400, body: { error: 'slow_down' } }, TOKENS]);
  var done = [];
  t.link.begin({ onCode: function() {}, onDone: function(e) { done.push(e); } });
  await f.settle();
  t.clock.tick(5000);
  await f.settle();
  t.clock.tick(5000);
  await f.settle();
  assert.equal(done.length, 0, 'l\'intervalle vaut maintenant 10 s');
  t.clock.tick(5000);
  await f.settle();
  assert.deepEqual(done, [null]);
});

test('liaison : expiration, refus et échec réseau d\'amorçage', async function() {
  var cases = [
    [{ status: 400, body: { error: 'expired_token' } }, 'expired'],
    [{ status: 400, body: { error: 'access_denied' } }, 'denied'],
    [{ status: 500, body: null }, 'failed']
  ];
  for (var i = 0; i < cases.length; i++) {
    var t = setup([AUTHORIZED, cases[i][0]]);
    var done = [];
    t.link.begin({ onCode: function() {}, onDone: function(e) { done.push(e); } });
    await f.settle();
    t.clock.tick(5000);
    await f.settle();
    assert.equal(done[0].kind, cases[i][1]);
    assert.equal(t.link.isLinked(), false);
  }
  var t2 = setup([{ error: { kind: 'network' } }]);
  var done2 = [];
  t2.link.begin({ onCode: function() {}, onDone: function(e) { done2.push(e); } });
  await f.settle();
  assert.equal(done2[0].kind, 'network');
});

test('liaison : expire au bout de expires_in même si Tado reste en attente', async function() {
  var t = setup([AUTHORIZED, PENDING]);
  var done = [];
  t.link.begin({ onCode: function() {}, onDone: function(e) { done.push(e); } });
  await f.settle();
  t.clock.tick(300000);
  await f.settle();
  assert.equal(done[0].kind, 'expired');
});

test('liaison : une coupure réseau pendant l\'interrogation ne l\'interrompt pas', async function() {
  var t = setup([AUTHORIZED, { error: { kind: 'network' } }, TOKENS]);
  var done = [];
  t.link.begin({ onCode: function() {}, onDone: function(e) { done.push(e); } });
  await f.settle();
  t.clock.tick(5000);
  await f.settle();
  t.clock.tick(5000);
  await f.settle();
  assert.deepEqual(done, [null]);
});

test('liaison : l\'annulation arrête l\'interrogation', async function() {
  var t = setup([AUTHORIZED]);
  var cancel = t.link.begin({ onCode: function() {}, onDone: function() { assert.fail(); } });
  await f.settle();
  cancel();
  assert.equal(t.clock.pending(), 0);
});

test('jeton : valable, rendu tel quel sans requête', async function() {
  var t = setup([], function(clock) { return f.tokenStore(clock); });
  var got;
  t.link.accessToken(function(err, token) { got = [err, token]; });
  assert.deepEqual(got, [null, 'A1']);
  assert.equal(t.http.calls.length, 0);
});

test('jeton : non lié', function() {
  var t = setup([]);
  var got;
  t.link.accessToken(function(err) { got = err; });
  assert.equal(got.kind, 'unlinked');
});

test('jeton : périmé, rafraîchi, et le nouveau jeton de rafraîchissement est écrit', async function() {
  var t = setup([{ status: 200, body: { access_token: 'A2', refresh_token: 'R2', expires_in: 600 } }],
    function(clock) { return f.tokenStore(clock, { expiresAt: clock.now() + 30 * 1000 }); });
  var got;
  t.link.accessToken(function(err, token) { got = [err, token]; });
  await f.settle();
  assert.deepEqual(got, [null, 'A2']);
  assert.match(t.http.calls[0].body, /grant_type=refresh_token/);
  assert.match(t.http.calls[0].body, /refresh_token=R1/);
  assert.equal(saved(t.store).refresh, 'R2');
});

test('jeton : des appels simultanés ne font qu\'un seul rafraîchissement (rotation)', async function() {
  var t = setup([{ status: 200, body: { access_token: 'A2', refresh_token: 'R2', expires_in: 600 } }],
    function(clock) { return f.tokenStore(clock, { expiresAt: 0 }); });
  var got = [];
  t.link.accessToken(function(err, token) { got.push(token); });
  t.link.accessToken(function(err, token) { got.push(token); });
  await f.settle();
  assert.deepEqual(got, ['A2', 'A2']);
  assert.equal(t.http.calls.length, 1);
});

test('jeton : refusé par Tado, rafraîchi ; déjà remplacé par un autre appel, pas de second rafraîchissement', async function() {
  var t = setup([{ status: 200, body: { access_token: 'A2', refresh_token: 'R2', expires_in: 600 } }],
    function(clock) { return f.tokenStore(clock); });
  var got = [];
  t.link.accessToken(function(err, token) { got.push(token); }, 'A1');
  await f.settle();
  t.link.accessToken(function(err, token) { got.push(token); }, 'A1');
  await f.settle();
  assert.deepEqual(got, ['A2', 'A2']);
  assert.equal(t.http.calls.length, 1);
});

test('jeton : rafraîchissement refusé, liaison perdue et jetons effacés', async function() {
  var t = setup([{ status: 400, body: { error: 'invalid_grant' } }],
    function(clock) { return f.tokenStore(clock, { expiresAt: 0 }); });
  var got;
  t.link.accessToken(function(err) { got = err; });
  await f.settle();
  assert.equal(got.kind, 'lost');
  assert.equal(t.link.isLinked(), false);
});

test('jeton : réseau ou serveur en panne au rafraîchissement, jetons conservés', async function() {
  var t = setup([{ error: { kind: 'network' } }, { status: 503, body: null }],
    function(clock) { return f.tokenStore(clock, { expiresAt: 0 }); });
  var got = [];
  t.link.accessToken(function(err) { got.push(err.kind); });
  await f.settle();
  t.link.accessToken(function(err) { got.push(err.kind); });
  await f.settle();
  assert.deepEqual(got, ['network', 'network']);
  assert.equal(t.link.isLinked(), true);
});
