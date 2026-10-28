// J-11 Vues : construit ce que la montre affiche. La montre n'interprète aucune donnée de Tado
// (DEC-02) : températures en dixièmes dans l'unité du compte, tranche de couleur, indicateurs.
var P = require('./protocol');

var NAME_BYTES = 20;
var ABBREV_CHARS = 4;
// Seuils de tranche (18 ; 19,5 ; 21 °C) en dixièmes, dans l'unité du compte.
var BANDS = { CELSIUS: [180, 195, 210], FAHRENHEIT: [644, 671, 698] };

function tenths(value) {
  return Math.round(value * 10);
}

function band(measured, unit) {
  var limits = BANDS[unit];
  var n = 0;
  limits.forEach(function(limit) {
    if (measured >= limit) {
      n += 1;
    }
  });
  return n;
}

// Coupe un texte à n octets UTF-8 sans couper un caractère en deux.
function truncateBytes(text, n) {
  var out = '';
  var size = 0;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    var cost = code < 0x80 ? 1 : (code < 0x800 ? 2 : 3);
    if (size + cost > n) {
      break;
    }
    out += text.charAt(i);
    size += cost;
  }
  return out;
}

function plain(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ');
}

// Abréviations de quatre caractères au plus, deux à deux distinctes (TPB-PLT-006).
function abbreviations(names) {
  var taken = {};
  return names.map(function(name) {
    var words = plain(name).split(/\s+/).filter(Boolean);
    var joined = words.join('');
    var candidates = [joined.slice(0, ABBREV_CHARS)];
    if (words.length > 1) {
      candidates.push(joined.slice(0, ABBREV_CHARS - 1) + words[words.length - 1].charAt(0));
      candidates.push(words.map(function(w) { return w.charAt(0); }).join('').slice(0, ABBREV_CHARS));
    }
    var pick = null;
    candidates.forEach(function(c) {
      if (pick === null && c && !taken[c]) {
        pick = c;
      }
    });
    for (var i = 2; pick === null; i++) {
      var c = joined.slice(0, ABBREV_CHARS - 1) + i;
      if (!taken[c]) {
        pick = c;
      }
    }
    taken[pick] = true;
    return pick;
  });
}

function mode(overlay) {
  if (!overlay) {
    return { mode: P.MODE_SCHEDULE, remaining: 0 };
  }
  var term = overlay.termination || {};
  if (term.type === 'TIMER' && term.typeSkillBasedApp === 'TIMER') {
    return { mode: P.MODE_TIMER, remaining: Math.ceil((term.remainingTimeInSeconds || 0) / 60) };
  }
  if (term.type === 'MANUAL') {
    return { mode: P.MODE_MANUAL, remaining: 0 };
  }
  return { mode: P.MODE_NEXT_BLOCK, remaining: 0 };
}

function room(entry, abbrev, unit) {
  var s = entry.state;
  var key = unit === 'FAHRENHEIT' ? 'fahrenheit' : 'celsius';
  var inside = s.sensorDataPoints && s.sensorDataPoints.insideTemperature;
  var flags = 0;
  var out = { name: truncateBytes(entry.name, NAME_BYTES), abbrev: abbrev, temp: 0, setpoint: 0, power: 0, band: 0 };

  if (inside && typeof inside[key] === 'number') {
    out.temp = tenths(inside[key]);
    out.band = band(out.temp, unit);
  } else {
    flags |= P.FLAG_NO_MEASURE;
  }
  var setting = s.setting || {};
  if (setting.power === 'OFF' || !setting.temperature) {
    flags |= P.FLAG_OFF;
  } else {
    out.setpoint = tenths(setting.temperature[key]);
  }
  var heating = s.activityDataPoints && s.activityDataPoints.heatingPower;
  out.power = heating ? Math.round(heating.percentage || 0) : 0;
  if (out.power > 0) {
    flags |= P.FLAG_HEATING;
  }
  if (s.overlay) {
    flags |= P.FLAG_FORCED;
  }
  if (s.link && s.link.state === 'OFFLINE') {
    flags |= P.FLAG_OFFLINE;
  }
  if (s.openWindow) {
    flags |= P.FLAG_WINDOW;
  }
  var m = mode(s.overlay);
  out.flags = flags;
  out.mode = m.mode;
  out.remaining = m.remaining;
  return out;
}

// data : résultat de J-06 rooms(). Renvoie {status, head, rooms}.
function buildRooms(data) {
  var abbrevs = abbreviations(data.rooms.map(function(r) { return r.name; }));
  var presence = data.presence;
  return {
    status: {
      ageSeconds: data.ageSeconds,
      offline: data.stale,
      presenceMode: presence.locked ? (presence.presence === 'HOME' ? P.PRESENCE_HOME : P.PRESENCE_AWAY) : P.PRESENCE_AUTO,
      presenceState: presence.presence === 'HOME' ? P.PRESENCE_HOME : P.PRESENCE_AWAY,
      alerts: 0
    },
    head: { count: data.rooms.length, unit: data.unit === 'FAHRENHEIT' ? P.UNIT_F : P.UNIT_C },
    rooms: data.rooms.map(function(entry, i) {
      return room(entry, abbrevs[i], data.unit);
    })
  };
}

function minutesOfDay(iso) {
  var d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// Détail d'une pièce (MSG-14) : mode en cours et sa fin, prochain changement, humidité, fenêtre.
// entry : une pièce de J-06 ; now : heure courante en millisecondes.
function buildDetail(entry, unit, now) {
  var s = entry.state;
  var key = unit === 'FAHRENHEIT' ? 'fahrenheit' : 'celsius';
  var m = mode(s.overlay);
  var next = s.nextScheduleChange;
  var nextTime = next && next.start ? minutesOfDay(next.start) : P.NONE;
  var nextTemp = P.NO_TEMP;
  if (next && next.setting && next.setting.power === 'ON' && next.setting.temperature) {
    nextTemp = tenths(next.setting.temperature[key]);
  }
  var endTime = nextTime;
  if (s.overlay) {
    var term = s.overlay.termination || {};
    var end = term.expiry || term.projectedExpiry;
    endTime = m.mode !== P.MODE_MANUAL && end ? minutesOfDay(end) : P.NONE;
  }
  var humidity = s.sensorDataPoints && s.sensorDataPoints.humidity;
  var windowMinutes = 0;
  if (s.openWindow && s.openWindow.detectedTime) {
    windowMinutes = Math.max(0, Math.floor((now - Date.parse(s.openWindow.detectedTime)) / 60000));
  }
  return {
    mode: m.mode,
    remaining: m.remaining,
    endTime: endTime,
    nextTime: nextTime,
    nextTemp: nextTemp,
    humidity: humidity && typeof humidity.percentage === 'number' ? Math.round(humidity.percentage) : P.NONE,
    windowMinutes: windowMinutes
  };
}

// Présence (MSG-18) : mode en vigueur (Auto, ou imposé Présent/Absent), état, appareils.
function buildPresence(data, autoUnavailable) {
  var p = data.presence;
  return {
    mode: p.locked ? (p.presence === 'HOME' ? P.PRESENCE_HOME : P.PRESENCE_AWAY) : P.PRESENCE_AUTO,
    state: p.presence === 'HOME' ? P.PRESENCE_HOME : P.PRESENCE_AWAY,
    devicesHome: data.devices.home,
    devicesTracked: data.devices.tracked,
    autoUnavailable: autoUnavailable ? 1 : 0
  };
}

module.exports = {
  buildRooms: buildRooms,
  buildPresence: buildPresence,
  buildDetail: buildDetail,
  abbreviations: abbreviations,
  truncateBytes: truncateBytes,
  band: band
};
