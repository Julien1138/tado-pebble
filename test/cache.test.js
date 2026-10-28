var test = require('node:test');
var assert = require('node:assert/strict');
var createCache = require('../src/pkjs/cache');
var f = require('./fakes');

function setup() {
  var clock = f.manualClock();
  var store = f.memoryStorage();
  return { clock: clock, cache: createCache({ storage: store, now: clock.now }) };
}

function loader(results, counter) {
  return function(done) {
    counter.n += 1;
    var r = results.shift();
    r.err ? done(r.err) : done(null, r.data);
  };
}

test('cache : charge, puis sert la copie fraîche sans requête, avec son âge', function() {
  var t = setup();
  var n = { n: 0 };
  var got = [];
  var load = loader([{ data: 'A' }], n);
  t.cache.fetch('k', 300000, false, load, function(e, d, i) { got.push([d, i.source, i.ageSeconds]); });
  t.clock.tick(120000);
  t.cache.fetch('k', 300000, false, load, function(e, d, i) { got.push([d, i.source, i.ageSeconds]); });
  assert.deepEqual(got, [['A', 'live', 0], ['A', 'cache', 120]]);
  assert.equal(n.n, 1);
});

test('cache : périmée ou forcée, recharge', function() {
  var t = setup();
  var n = { n: 0 };
  var load = loader([{ data: 'A' }, { data: 'B' }, { data: 'C' }], n);
  var last;
  t.cache.fetch('k', 1000, false, load, function() {});
  t.clock.tick(2000);
  t.cache.fetch('k', 1000, false, load, function(e, d) { last = d; });
  assert.equal(last, 'B');
  t.cache.fetch('k', 1000, true, load, function(e, d) { last = d; });
  assert.equal(last, 'C');
});

test('cache : échec du chargement, copie périmée rendue ; sans copie, l\'erreur', function() {
  var t = setup();
  var n = { n: 0 };
  var out;
  t.cache.fetch('k', 1000, false, loader([{ err: { kind: 'network' } }], n), function(e) { out = e; });
  assert.equal(out.kind, 'network');
  t.cache.fetch('k', 1000, false, loader([{ data: 'A' }], n), function() {});
  t.clock.tick(5000);
  var res;
  t.cache.fetch('k', 1000, false, loader([{ err: { kind: 'network' } }], n), function(e, d, i) { res = [e, d, i.source, i.ageSeconds]; });
  assert.deepEqual(res, [null, 'A', 'stale', 5]);
});

test('cache : clear efface', function() {
  var t = setup();
  var n = { n: 0 };
  t.cache.fetch('k', 1000, false, loader([{ data: 'A' }, { data: 'B' }], n), function() {});
  t.cache.clear(['k']);
  var got;
  t.cache.fetch('k', 1000, false, loader([{ data: 'B' }], n), function(e, d) { got = d; });
  assert.equal(got, 'B');
});
