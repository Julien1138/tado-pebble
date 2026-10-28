var test = require('node:test');
var assert = require('node:assert/strict');
var P = require('../src/pkjs/protocol');
var createHistory = require('../src/pkjs/history');
var createCache = require('../src/pkjs/cache');
var createLink = require('../src/pkjs/link');
var createClient = require('../src/pkjs/tado');
var f = require('./fakes');

var compute = createHistory.computeColumns;
var pack = createHistory.pack;
var H = 3600 * 1000;

// Heures locales de l'ordinateur d'essai : les résultats ne dépendent pas du fuseau.
function at(day, h, m) {
  return new Date(2026, 9, day, h, m || 0, 0).getTime();
}
function iv(from, to, value) {
  return { from: from, to: to, value: value };
}
function levels(columns) {
  return columns.map(function(c) { return c.unknown ? 'u' : c.level; }).join('');
}

test('colonnes : douze heures, la dernière est l\'heure en cours', function() {
  var now = at(28, 15, 30);
  var cols = compute([iv(at(28, 0, 0), now, 'NONE')], now, 12);
  assert.equal(cols.length, 12);
  assert.equal(levels(cols), '000000000000');
});

test('niveaux : un poids par niveau du rapport (DEC-11), rangé dans sa plage', function() {
  var now = at(28, 15, 30);
  var ivs = [
    iv(at(28, 0, 0), at(28, 11, 0), 'NONE'),
    iv(at(28, 11, 0), at(28, 12, 0), 'NONE'),
    iv(at(28, 12, 0), at(28, 13, 0), 'LOW'),
    iv(at(28, 13, 0), at(28, 14, 0), 'MEDIUM'),
    iv(at(28, 14, 0), now, 'HIGH')
  ];
  // colonnes : 11 h, 12 h, 13 h, 14 h, 15 h (en cours)
  var cols = compute(ivs, now, 5);
  // aucune = 0 % ; faible = 25 % (limite : plage moyenne) ; moyenne = 50 % (limite : plage forte) ; forte = 100 %
  assert.equal(levels(cols), '02333');
});

test('plages : 10 %, 25 % et 50 % vont à la plage supérieure ; 100 % reste en forte', function() {
  var now = at(28, 15, 59);
  function level(value, minutes) {
    // une heure complète (14 h) dont `minutes` minutes à `value`, le reste sans chauffe
    var ivs = [iv(at(28, 12, 0), at(28, 14, 0), 'NONE'),
               iv(at(28, 14, 0), at(28, 14, minutes), value),
               iv(at(28, 14, minutes), at(28, 15, 59), 'NONE')];
    return compute(ivs, now, 2)[0].level;
  }
  assert.equal(level('HIGH', 6), 1, '6 min de chauffe forte = 10 % : faible');
  assert.equal(level('HIGH', 5), 0, '5 min = 8,3 % : aucune');
  assert.equal(level('HIGH', 15), 2, '15 min = 25 % : moyenne');
  assert.equal(level('HIGH', 30), 3, '30 min = 50 % : forte');
  assert.equal(level('HIGH', 59), 3);
});

test('heure en cours : l\'intensité se calcule sur le temps écoulé', function() {
  var now = at(28, 15, 20);
  var cols = compute([iv(at(28, 12, 0), at(28, 15, 0), 'NONE'), iv(at(28, 15, 0), now, 'HIGH')], now, 2);
  assert.equal(cols[1].level, 3, '20 minutes de chauffe en 20 minutes écoulées = 100 %');
});

test('trous : une colonne mal couverte est inconnue, non nulle (HIS-008)', function() {
  var now = at(28, 15, 30);
  var cols = compute([iv(at(28, 13, 0), now, 'NONE')], now, 4);
  assert.deepEqual(cols.map(function(c) { return !!c.unknown; }), [true, false, false, false]);
  // 85 % de couverture : inconnue ; 90 % : connue
  var near = compute([iv(at(28, 14, 0), at(28, 14, 51), 'NONE')], at(28, 15, 0) + 1, 2);
  assert.equal(near[0].unknown, true, '51 min sur 60 = 85 %');
  var enough = compute([iv(at(28, 14, 0), at(28, 14, 54), 'NONE')], at(28, 15, 0) + 1, 2);
  assert.equal(enough[0].level, 0, '54 min sur 60 = 90 %');
});

test('passage de minuit : les périodes de la veille et du jour se rejoignent', function() {
  var now = at(28, 3, 30);
  var ivs = [iv(at(27, 12, 0), at(28, 0, 0), 'NONE'), iv(at(28, 0, 0), at(28, 1, 0), 'MEDIUM'), iv(at(28, 1, 0), now, 'NONE'),
             iv(at(27, 22, 0), at(27, 23, 0), 'HIGH')];
  var cols = compute(ivs, now, 6);
  // colonnes : 22 h, 23 h, 0 h, 1 h, 2 h, 3 h
  assert.equal(cols[2].level, 3, 'minuit à 1 h : chauffe moyenne = 50 %, limite de la plage forte');
  assert.equal(cols[1].level, 0, '23 h à minuit : aucune');
  assert.equal(cols.filter(function(c) { return c.unknown; }).length, 0);
});

test('un intervalle qui couvre plusieurs colonnes est réparti', function() {
  var now = at(28, 10, 30);
  var cols = compute([iv(at(28, 6, 0), now, 'HIGH')], now, 4);
  assert.equal(levels(cols), '3333');
});

test('empaquetage : deux bits par colonne, masque des inconnues', function() {
  var p = pack([{ level: 3 }, { unknown: true }, { level: 1 }, { level: 0 }]);
  assert.equal(p.levels, 3 | (1 << 4), 'colonne 0 niveau 3, colonne 2 niveau 1');
  assert.equal(p.unknown, 2);
  var all = pack(new Array(12).fill({ level: 3 }));
  assert.equal(all.levels, 0xFFFFFF, 'douze colonnes tiennent dans 24 bits');
});

function setup(steps) {
  var clock = f.manualClock();
  var http = f.scriptedHttp(steps);
  var store = f.tokenStore(clock);
  var link = createLink({ http: http, storage: store, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  var client = createClient({ http: http, link: link });
  var cache = createCache({ storage: store, now: clock.now });
  return { http: http, clock: clock, history: createHistory({ client: client, cache: cache }) };
}

function report(from, to, value) {
  return { callForHeat: { dataIntervals: [{ from: new Date(from).toISOString(), to: new Date(to).toISOString(), value: value }] } };
}

function columns(t, now, n, force) {
  return new Promise(function(resolve) {
    t.history.columnsFor(7, 5, now, n, force, function(err, cols) { resolve({ err: err, cols: cols }); });
  });
}

test('lecture : un rapport l\'après-midi, deux avant midi (la fenêtre passe minuit)', async function() {
  var now = at(28, 15, 30);
  var t = setup([{ status: 200, body: report(at(28, 0, 0), now, 'NONE') }]);
  var r = await columns(t, now, 12, false);
  assert.equal(r.err, null);
  assert.equal(t.http.calls.length, 1);
  assert.match(t.http.calls[0].url, /dayReport\?date=2026-10-28$/);

  var morning = at(28, 9, 30);
  var t2 = setup([{ status: 200, body: report(at(27, 0, 0), at(28, 0, 0), 'NONE') }, { status: 200, body: report(at(28, 0, 0), morning, 'LOW') }]);
  var r2 = await columns(t2, morning, 12, false);
  assert.equal(t2.http.calls.length, 2);
  assert.deepEqual(t2.http.calls.map(function(c) { return c.url.slice(-10); }).sort(), ['2026-10-27', '2026-10-28']);
  assert.equal(r2.cols.filter(function(c) { return c.unknown; }).length, 0);
});

test('lecture : le rapport d\'un jour échu reste en cache, celui d\'aujourd\'hui expire en 30 minutes', async function() {
  var now = at(28, 9, 30);
  var t = setup([{ status: 200, body: report(at(27, 0, 0), at(28, 0, 0), 'NONE') }, { status: 200, body: report(at(28, 0, 0), now, 'NONE') },
                 { status: 200, body: report(at(28, 0, 0), now + 40 * 60000, 'NONE') },
                 { status: 200, body: report(at(27, 0, 0), at(28, 0, 0), 'NONE') }, { status: 200, body: report(at(28, 0, 0), now + 40 * 60000, 'NONE') }]);
  await columns(t, now, 12, false);
  t.clock.tick(40 * 60000);
  await columns(t, now + 40 * 60000, 12, false);
  assert.equal(t.http.calls.length, 3, 'la veille n\'est pas relue, aujourd\'hui l\'est');
  t.clock.tick(1000);
  await columns(t, now + 40 * 60000, 12, true);
  assert.equal(t.http.calls.length, 5, 'le rechargement relit tout, la veille comprise');
});

test('lecture : un rapport illisible rend toutes les colonnes inconnues, sans faire échouer le reste', async function() {
  var now = at(28, 15, 30);
  var t = setup([{ status: 500, body: null }, { status: 500, body: null }]);
  var r = await columns(t, now, 12, false);
  assert.equal(r.err.kind, 'incomplete');
  assert.ok(r.cols.every(function(c) { return c.unknown; }));
});
