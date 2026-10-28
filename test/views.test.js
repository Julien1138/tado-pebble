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

function at(hours, minutes) {
  var d = new Date(2026, 9, 28, hours, minutes);
  return d.toISOString();
}
function clock(hours, minutes) {
  return hours * 60 + minutes;
}

test('détail : programme, fin au prochain changement, prochain changement, humidité', function() {
  var state = zone({
    nextScheduleChange: { start: at(22, 0), setting: { power: 'ON', temperature: { celsius: 16.5, fahrenheit: 61.7 } } },
    sensorDataPoints: { insideTemperature: { celsius: 19.4 }, humidity: { percentage: 52.4 } }
  });
  var d = views.buildDetail({ id: 1, name: 'Salon', state: state }, 'CELSIUS', Date.now());
  assert.equal(d.mode, P.MODE_SCHEDULE);
  assert.equal(d.endTime, clock(22, 0));
  assert.equal(d.nextTime, clock(22, 0));
  assert.equal(d.nextTemp, 165);
  assert.equal(d.humidity, 52);
  assert.equal(d.windowMinutes, 0);
});

test('détail : forçage minuté, durée restante et heure de fin', function() {
  var state = zone({
    overlay: { termination: { type: 'TIMER', typeSkillBasedApp: 'TIMER', remainingTimeInSeconds: 2400, expiry: at(20, 40) } },
    nextScheduleChange: { start: at(22, 0), setting: { power: 'OFF', temperature: null } }
  });
  var d = views.buildDetail({ id: 1, name: 'Salon', state: state }, 'CELSIUS', Date.now());
  assert.equal(d.mode, P.MODE_TIMER);
  assert.equal(d.remaining, 40);
  assert.equal(d.endTime, clock(20, 40));
  assert.equal(d.nextTemp, P.NO_TEMP);
  assert.equal(d.humidity, P.NONE);
});

test('détail : jusqu\'au prochain créneau et jusqu\'à nouvel ordre', function() {
  function detail(termination) {
    return views.buildDetail({ id: 1, name: 'A', state: zone({ overlay: { termination: termination },
      nextScheduleChange: { start: at(7, 30), setting: { power: 'ON', temperature: { celsius: 16 } } } }) }, 'CELSIUS', Date.now());
  }
  var next = detail({ type: 'TADO_MODE', typeSkillBasedApp: 'TADO_MODE', projectedExpiry: at(7, 30) });
  assert.equal(next.mode, P.MODE_NEXT_BLOCK);
  assert.equal(next.endTime, clock(7, 30));
  var manual = detail({ type: 'MANUAL', typeSkillBasedApp: 'MANUAL', projectedExpiry: null });
  assert.equal(manual.mode, P.MODE_MANUAL);
  assert.equal(manual.endTime, P.NONE);
});

test('détail : fenêtre ouverte depuis quatre minutes ; sans prochain changement', function() {
  var now = Date.parse('2026-10-28T20:00:00Z');
  var d = views.buildDetail({ id: 1, name: 'A', state: zone({
    openWindow: { detectedTime: '2026-10-28T19:56:00Z' }, nextScheduleChange: null }) }, 'CELSIUS', now);
  assert.equal(d.windowMinutes, 4);
  assert.equal(d.nextTime, P.NONE);
  assert.equal(d.nextTemp, P.NO_TEMP);
  assert.equal(d.endTime, P.NONE);
});

test('détail : Fahrenheit', function() {
  var d = views.buildDetail({ id: 1, name: 'A', state: zone({
    nextScheduleChange: { start: at(22, 0), setting: { power: 'ON', temperature: { celsius: 16.5, fahrenheit: 61.7 } } } }) }, 'FAHRENHEIT', Date.now());
  assert.equal(d.nextTemp, 617);
});

function rooms2(forced) {
  return [{ id: 1, name: 'A', state: zone({ overlay: forced ? { termination: { type: 'MANUAL' } } : null }) },
          { id: 2, name: 'B', state: zone() }];
}

test('raccourcis offerts : Tout off toujours ; programmation seulement si une pièce est forcée', function() {
  var base = { rooms: rooms2(false), presence: { presence: 'HOME', locked: false } };
  assert.equal(views.buildShortcuts(base, false).mask & 1, 1);
  assert.equal(views.buildShortcuts(base, false).mask & 2, 0);
  var forced = views.buildShortcuts({ rooms: rooms2(true), presence: { presence: 'HOME', locked: false } }, false);
  assert.equal(forced.mask & 2, 2);
  assert.equal(forced.forced, 1);
});

test('raccourcis offerts : Absent si présent en Auto ; Géolocalisation si imposé, sauf Auto indisponible', function() {
  function mask(presence, locked, unavailable) {
    return views.buildShortcuts({ rooms: rooms2(false), presence: { presence: presence, locked: locked } }, unavailable).mask;
  }
  assert.equal(mask('HOME', false, false), 1 | 4, 'Tout off et Absent');
  assert.equal(mask('AWAY', false, false), 1, 'Auto et absent : seulement Tout off');
  assert.equal(mask('HOME', true, false), 1 | 8, 'imposé : Géolocalisation');
  assert.equal(mask('AWAY', true, false), 1 | 8);
  assert.equal(mask('HOME', true, true), 1, 'Auto indisponible : plus de Géolocalisation');
});

test('pièces non modifiées : Tout off compare l\'extinction, programmation compare le forçage', function() {
  var off = zone({ setting: { type: 'HEATING', power: 'OFF', temperature: null } });
  var on = zone();
  var r = [{ state: off }, { state: on }, { state: off }];
  var u = views.unmodifiedRooms(P.SC_ALL_OFF, r, [0, 1, 2]);
  assert.deepEqual([u.mask, u.count], [2, 1]);
  var forced = zone({ overlay: { termination: { type: 'MANUAL' } } });
  var p = views.unmodifiedRooms(P.SC_PROGRAM, [{ state: forced }, { state: zone() }, { state: forced }], [0, 2]);
  assert.deepEqual([p.mask, p.count], [5, 2]);
});
