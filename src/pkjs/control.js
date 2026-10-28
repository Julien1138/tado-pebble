// J-10 Commandes : forçages, retour à la programmation, extinction ; plage de consigne et dernier
// forçage mémorisé (TPB-INF-002). Une commande n'est jamais retentée ni mise en attente (DEC-10).
// Dépendances : client (J-03), cache (J-04), storage {get, set, remove}.
var P = require('./protocol');

var LAST_PREFIX = 'tado.last.';
var AUTO_KEY = 'tado.autoUnavailable';
var DURATIONS = {};
DURATIONS[P.DUR_30] = { typeSkillBasedApp: 'TIMER', durationInSeconds: 1800 };
DURATIONS[P.DUR_60] = { typeSkillBasedApp: 'TIMER', durationInSeconds: 3600 };
DURATIONS[P.DUR_120] = { typeSkillBasedApp: 'TIMER', durationInSeconds: 7200 };
DURATIONS[P.DUR_NEXT] = { typeSkillBasedApp: 'TADO_MODE' };
DURATIONS[P.DUR_MANUAL] = { typeSkillBasedApp: 'MANUAL' };

// Famille d'erreur de J-03 -> résultat envoyé à la montre.
function resultFor(err) {
  if (!err) {
    return P.RES_OK;
  }
  if (err.kind === 'network') {
    return P.RES_OFFLINE;
  }
  if (err.kind === 'refused' || err.kind === 'forbidden' || err.kind === 'notfound' || err.kind === 'http') {
    return P.RES_REFUSED;
  }
  return P.RES_FAILED;
}

function createControl(deps) {
  var client = deps.client;
  var cache = deps.cache;
  var storage = deps.storage;

  // Températures en dixièmes dans l'unité du compte : Tado accepte les deux unités telles quelles.
  function temperatureOf(tenths, unit) {
    var degrees = tenths / 10;
    return unit === 'FAHRENHEIT' ? { fahrenheit: degrees } : { celsius: degrees };
  }

  // target : {homeId, zoneId, unit}. command : {kind, temp, duration}. cb(err).
  function execute(target, command, cb) {
    if (command.kind === P.CMD_SCHEDULE) {
      return client.deleteOverlay(target.homeId, target.zoneId, function(err) { cb(err); });
    }
    var termination;
    var setting;
    if (command.kind === P.CMD_OFF) {
      setting = { type: 'HEATING', power: 'OFF' };
      termination = DURATIONS[P.DUR_NEXT];
    } else if (command.kind === P.CMD_FORCE && DURATIONS[command.duration]) {
      setting = { type: 'HEATING', power: 'ON', temperature: temperatureOf(command.temp, target.unit) };
      termination = DURATIONS[command.duration];
    } else {
      return cb({ kind: 'refused' });
    }
    client.putOverlay(target.homeId, target.zoneId, setting, termination, function(err) {
      if (!err && command.kind === P.CMD_FORCE) {
        // Mémorisé seulement après confirmation de Tado.
        storage.set(LAST_PREFIX + target.zoneId, JSON.stringify({
          temp: command.temp, duration: command.duration, unit: target.unit
        }));
      }
      cb(err);
    });
  }

  // Dernier forçage de la pièce, ou null (il n'a de sens que dans l'unité d'aujourd'hui).
  function last(zoneId, unit) {
    try {
      var v = JSON.parse(storage.get(LAST_PREFIX + zoneId));
      return v && v.unit === unit ? v : null;
    } catch (e) {
      return null;
    }
  }

  // Plage de consigne d'une pièce, en dixièmes dans l'unité du compte. cb(err, {min, max, step}).
  function range(target, cb) {
    cache.fetch('caps.' + target.zoneId, Infinity, false, function(done) {
      client.getCapabilities(target.homeId, target.zoneId, done);
    }, function(err, caps) {
      if (err) {
        return cb(err);
      }
      var key = target.unit === 'FAHRENHEIT' ? 'fahrenheit' : 'celsius';
      var t = caps.temperatures && caps.temperatures[key];
      if (!t) {
        return cb({ kind: 'http' });
      }
      // Pas de 0,5 °C ou de 1 °F (TPB-PIL-002), même si Tado en accepte de plus fins.
      cb(null, { min: Math.round(t.min * 10), max: Math.round(t.max * 10),
                 step: target.unit === 'FAHRENHEIT' ? 10 : 5 });
    });
  }

  // Mode de présence : Présent et Absent sont imposés (PUT), Auto rend la main à la géolocalisation
  // (DELETE). Un refus 403 d'Auto signale l'absence d'abonnement Auto-Assist : il est mémorisé et
  // Auto n'est plus offert (hypothèse H2). cb(err).
  function setPresence(target, mode, cb) {
    if (mode === P.PRESENCE_AUTO) {
      return client.deletePresenceLock(target.homeId, function(err) {
        if (err && err.kind === 'forbidden') {
          storage.set(AUTO_KEY, '1');
        }
        cb(err);
      });
    }
    if (mode !== P.PRESENCE_HOME && mode !== P.PRESENCE_AWAY) {
      return cb({ kind: 'refused' });
    }
    client.putPresenceLock(target.homeId, mode === P.PRESENCE_HOME ? 'HOME' : 'AWAY', function(err) { cb(err); });
  }

  function autoUnavailable() {
    return storage.get(AUTO_KEY) === '1';
  }

  return { execute: execute, last: last, range: range, resultFor: resultFor,
           setPresence: setPresence, autoUnavailable: autoUnavailable };
}

createControl.resultFor = resultFor;
module.exports = createControl;
