var test = require('node:test');
var assert = require('node:assert/strict');
var P = require('../src/pkjs/protocol');
var views = require('../src/pkjs/views');

function zone(over) {
  var z = {
    setting: { type: 'HEATING', power: 'ON', temperature: { celsius: 21, fahrenheit: 69.8 } },
    activityDataPoints: { heatingPower: { percentage: 0 } },
    sensorDataPoints: { insideTemperature: { celsius: 19.4, fahrenheit: 66.92 } },
    overlay: null, openWindow: null, link: { state: 'ONLINE' }
  };
  Object.keys(over || {}).forEach(function(k) { z[k] = over[k]; });
  return z;
}

function data(rooms, extra) {
  var d = { unit: 'CELSIUS', rooms: rooms, presence: { presence: 'HOME', locked: false }, ageSeconds: 30, stale: false };
  Object.keys(extra || {}).forEach(function(k) { d[k] = extra[k]; });
  return d;
}

test('pièce programmée : températures en dixièmes, tranche, sans indicateur', function() {
  var v = views.buildRooms(data([{ id: 1, name: 'Salon', state: zone() }]));
  assert.deepEqual(v.rooms[0], {
    name: 'Salon', abbrev: 'Salo', temp: 194, setpoint: 210, power: 0, band: 1,
    flags: 0, mode: P.MODE_SCHEDULE, remaining: 0
  });
  assert.deepEqual(v.head, { count: 1, unit: P.UNIT_C });
});

test('pièce qui chauffe, forcée 1 h, fenêtre ouverte', function() {
  var v = views.buildRooms(data([{ id: 1, name: 'Salon', state: zone({
    activityDataPoints: { heatingPower: { percentage: 60 } },
    overlay: { termination: { type: 'TIMER', typeSkillBasedApp: 'TIMER', remainingTimeInSeconds: 3599 } },
    openWindow: { detectedTime: 'x' }
  }) }]));
  var r = v.rooms[0];
  assert.equal(r.power, 60);
  assert.equal(r.flags, P.FLAG_HEATING | P.FLAG_FORCED | P.FLAG_WINDOW);
  assert.equal(r.mode, P.MODE_TIMER);
  assert.equal(r.remaining, 60);
});

test('modes de forçage', function() {
  function mode(termination) {
    return views.buildRooms(data([{ id: 1, name: 'A', state: zone({ overlay: { termination: termination } }) }])).rooms[0].mode;
  }
  assert.equal(mode({ type: 'TADO_MODE', typeSkillBasedApp: 'TADO_MODE' }), P.MODE_NEXT_BLOCK);
  assert.equal(mode({ type: 'TIMER', typeSkillBasedApp: 'NEXT_TIME_BLOCK' }), P.MODE_NEXT_BLOCK);
  assert.equal(mode({ type: 'MANUAL', typeSkillBasedApp: 'MANUAL' }), P.MODE_MANUAL);
});

test('chauffage éteint : pas de consigne', function() {
  var v = views.buildRooms(data([{ id: 1, name: 'Chambre', state: zone({
    setting: { type: 'HEATING', power: 'OFF', temperature: null } }) }]));
  assert.equal(v.rooms[0].flags, P.FLAG_OFF);
  assert.equal(v.rooms[0].setpoint, 0);
});

test('mesure indisponible, appareil hors ligne', function() {
  var v = views.buildRooms(data([{ id: 1, name: 'Cave', state: zone({
    sensorDataPoints: {}, link: { state: 'OFFLINE' } }) }]));
  assert.equal(v.rooms[0].flags, P.FLAG_NO_MEASURE | P.FLAG_OFFLINE);
});

test('tranches de couleur aux limites, en Celsius et en Fahrenheit', function() {
  assert.deepEqual([179, 180, 194, 195, 209, 210].map(function(t) { return views.band(t, 'CELSIUS'); }), [0, 1, 1, 2, 2, 3]);
  assert.deepEqual([643, 644, 670, 671, 697, 698].map(function(t) { return views.band(t, 'FAHRENHEIT'); }), [0, 1, 1, 2, 2, 3]);
});

test('Fahrenheit : valeurs de l\'unité du compte', function() {
  var v = views.buildRooms(data([{ id: 1, name: 'Salon', state: zone() }], { unit: 'FAHRENHEIT' }));
  assert.equal(v.rooms[0].temp, 669);
  assert.equal(v.rooms[0].setpoint, 698);
  assert.equal(v.rooms[0].band, 1);
  assert.equal(v.head.unit, P.UNIT_F);
});

test('présence : Auto, imposée Présent, imposée Absent', function() {
  function st(p) { return views.buildRooms(data([], { presence: p })).status; }
  assert.deepEqual([st({ presence: 'HOME', locked: false }).presenceMode, st({ presence: 'HOME', locked: false }).presenceState], [P.PRESENCE_AUTO, P.PRESENCE_HOME]);
  assert.equal(st({ presence: 'HOME', locked: true }).presenceMode, P.PRESENCE_HOME);
  assert.deepEqual([st({ presence: 'AWAY', locked: true }).presenceMode, st({ presence: 'AWAY', locked: true }).presenceState], [P.PRESENCE_AWAY, P.PRESENCE_AWAY]);
});

test('abréviations : quatre caractères au plus, deux à deux distinctes', function() {
  var names = ['Chambre Marcel', 'Chambre aux tableaux', 'Notre Chambre', 'Chambre', 'Salon & Cuisine', 'Salle de bain', 'Salon'];
  var ab = views.abbreviations(names);
  ab.forEach(function(a) { assert.ok(a.length > 0 && a.length <= 4, a); });
  assert.equal(new Set(ab).size, names.length, ab.join(','));
});

test('noms : coupés à 20 octets sans casser un caractère', function() {
  assert.equal(views.truncateBytes('Chambre aux tableaux et plus', 20), 'Chambre aux tableaux');
  assert.equal(views.truncateBytes('é'.repeat(15), 20), 'é'.repeat(10));
  var v = views.buildRooms(data([{ id: 1, name: 'Chambre aux tableaux et plus', state: zone() }]));
  assert.equal(v.rooms[0].name, 'Chambre aux tableaux');
});

test('statut : âge et hors connexion', function() {
  var s = views.buildRooms(data([], { ageSeconds: 130, stale: true })).status;
  assert.equal(s.ageSeconds, 130);
  assert.equal(s.offline, true);
});
