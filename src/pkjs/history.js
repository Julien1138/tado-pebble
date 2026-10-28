// J-07 Historique : rapports du jour de chaque pièce et calcul des colonnes d'intensité de chauffe
// (TPB-HIS-001 à 008, DEC-05, DEC-11). Dépendances : client (J-03), cache (J-04).
var HOUR = 3600 * 1000;
var MIN = 60 * 1000;
var TTL_TODAY = 30 * MIN;
// Poids des quatre niveaux du rapport (DEC-11, provisoires).
var WEIGHTS = { NONE: 0, LOW: 0.25, MEDIUM: 0.5, HIGH: 1 };
// Une colonne dont les périodes couvrent moins de 90 % de sa durée écoulée est inconnue (HIS-008).
var MIN_COVERAGE = 0.9;
// Plages d'intensité (HIS-002) : [0;10[, [10;25[, [25;50[, [50;100] -> niveaux 0 à 3.
var LEVEL_LIMITS = [0.10, 0.25, 0.50];

function levelOf(intensity) {
  var level = 0;
  LEVEL_LIMITS.forEach(function(limit) {
    if (intensity >= limit) {
      level += 1;
    }
  });
  return level;
}

// Début de l'heure locale qui contient ms.
function hourStart(ms) {
  var d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function dateKey(ms) {
  var d = new Date(ms);
  function two(n) { return n < 10 ? '0' + n : String(n); }
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
}

// intervals : [{from, to, value}] avec from/to en millisecondes. Rend n colonnes, de la plus ancienne
// à l'heure en cours, chacune {level} (0 à 3) ou {unknown: true}.
function computeColumns(intervals, now, n) {
  var current = hourStart(now);
  var columns = [];
  for (var i = 0; i < n; i++) {
    var start = current - (n - 1 - i) * HOUR;
    var end = i === n - 1 ? now : start + HOUR;
    var duration = end - start;
    var covered = 0;
    var weighted = 0;
    intervals.forEach(function(iv) {
      var overlap = Math.min(iv.to, end) - Math.max(iv.from, start);
      if (overlap > 0) {
        covered += overlap;
        weighted += overlap * (WEIGHTS[iv.value] || 0);
      }
    });
    if (duration <= 0 || covered < MIN_COVERAGE * duration) {
      columns.push({ unknown: true });
    } else {
      columns.push({ level: levelOf(weighted / duration) });
    }
  }
  return columns;
}

// Deux entiers pour le message : niveaux sur 2 bits par colonne (colonne 0 = la plus ancienne),
// et masque des colonnes inconnues.
function pack(columns) {
  var levels = 0;
  var unknown = 0;
  columns.forEach(function(c, i) {
    if (c.unknown) {
      unknown |= 1 << i;
    } else {
      levels |= c.level << (2 * i);
    }
  });
  return { levels: levels, unknown: unknown };
}

function parseIntervals(report) {
  var list = report && report.callForHeat && report.callForHeat.dataIntervals;
  return (list || []).map(function(iv) {
    return { from: Date.parse(iv.from), to: Date.parse(iv.to), value: iv.value };
  });
}

function createHistory(deps) {
  var client = deps.client;
  var cache = deps.cache;

  function report(homeId, zoneId, date, isToday, force, cb) {
    cache.fetch('day.' + zoneId + '.' + date, isToday ? TTL_TODAY : Infinity, force, function(done) {
      client.getDayReport(homeId, zoneId, date, done);
    }, cb);
  }

  // Colonnes d'une pièce : le rapport du jour, et celui de la veille quand la fenêtre passe minuit.
  // cb(err, columns) ; une erreur de lecture rend toutes les colonnes inconnues.
  function columnsFor(homeId, zoneId, now, n, force, cb) {
    var todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    var windowStart = hourStart(now) - (n - 1) * HOUR;
    var dates = [{ key: dateKey(now), today: true }];
    if (windowStart < todayStart.getTime()) {
      dates.unshift({ key: dateKey(todayStart.getTime() - 1), today: false });
    }
    var intervals = [];
    var failed = false;
    var pending = dates.length;
    dates.forEach(function(d) {
      report(homeId, zoneId, d.key, d.today, force, function(err, data) {
        if (err) {
          failed = true;
        } else {
          intervals = intervals.concat(parseIntervals(data));
        }
        pending -= 1;
        if (pending === 0) {
          var columns = failed ? computeColumns([], now, n) : computeColumns(intervals, now, n);
          cb(failed ? { kind: 'incomplete' } : null, columns);
        }
      });
    });
  }

  return { columnsFor: columnsFor, pack: pack };
}

createHistory.computeColumns = computeColumns;
createHistory.pack = pack;
createHistory.dateKey = dateKey;
module.exports = createHistory;
