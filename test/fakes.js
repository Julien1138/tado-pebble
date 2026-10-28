// Doublures pour tester J-02 et J-03 sans réseau ni montre.

// Rejoue des réponses dans l'ordre. Une étape est {status, body}, {error} ou une fonction
// de la requête renvoyant l'une de ces formes. Les requêtes reçues sont dans calls.
function scriptedHttp(steps) {
  var calls = [];
  var http = function(req, cb) {
    calls.push(req);
    var step = steps.shift();
    if (!step) {
      throw new Error('requête inattendue : ' + req.method + ' ' + req.url);
    }
    if (typeof step === 'function') {
      step = step(req);
    }
    setImmediate(function() {
      if (step.error) {
        cb(step.error);
      } else {
        cb(null, { status: step.status, body: step.body === undefined ? null : step.body });
      }
    });
  };
  http.calls = calls;
  return http;
}

function memoryStorage(initial) {
  var data = initial || {};
  return {
    get: function(key) { return key in data ? data[key] : null; },
    set: function(key, value) { data[key] = value; },
    remove: function(key) { delete data[key]; },
    data: data
  };
}

// Horloge et minuteurs manuels : tick(ms) fait avancer le temps et lance les minuteurs échus.
function manualClock(start) {
  var time = start || 1000000;
  var timers = [];
  var nextId = 1;
  return {
    now: function() { return time; },
    setTimer: function(fn, ms) {
      var id = nextId++;
      timers.push({ id: id, at: time + ms, fn: fn });
      return id;
    },
    clearTimer: function(id) {
      timers = timers.filter(function(t) { return t.id !== id; });
    },
    tick: function(ms) {
      time += ms;
      var due = timers.filter(function(t) { return t.at <= time; });
      timers = timers.filter(function(t) { return t.at > time; });
      due.forEach(function(t) { t.fn(); });
    },
    pending: function() { return timers.length; }
  };
}

function tokenStore(clock, overrides) {
  var tokens = { access: 'A1', refresh: 'R1', expiresAt: clock.now() + 3600 * 1000 };
  Object.keys(overrides || {}).forEach(function(k) { tokens[k] = overrides[k]; });
  return memoryStorage({ 'tado.tokens': JSON.stringify(tokens) });
}

// Laisse les callbacks setImmediate de scriptedHttp se dérouler.
function settle() {
  return new Promise(function(resolve) { setTimeout(resolve, 5); });
}

module.exports = {
  scriptedHttp: scriptedHttp,
  memoryStorage: memoryStorage,
  manualClock: manualClock,
  tokenStore: tokenStore,
  settle: settle
};
