// J-06 Maison : liste des pièces chauffées avec leur état, et présence de la maison.
// Dépendances : client (J-03), cache (J-04).
var MIN = 60 * 1000;
var TTL_HOME = Infinity;
var TTL_ZONES = 60 * MIN;
var TTL_STATES = 5 * MIN;

function parallel(tasks, cb) {
  var results = {};
  var pending = Object.keys(tasks).length;
  var failed = false;
  Object.keys(tasks).forEach(function(name) {
    tasks[name](function(err, data, info) {
      if (failed) {
        return;
      }
      if (err) {
        failed = true;
        return cb(err);
      }
      results[name] = { data: data, info: info };
      pending -= 1;
      if (pending === 0) {
        cb(null, results);
      }
    });
  });
}

function createHome(deps) {
  var client = deps.client;
  var cache = deps.cache;

  // La maison est choisie à la première lecture : la première de la liste (TPB-CPT-002).
  function home(cb) {
    cache.fetch('home', TTL_HOME, false, function(done) {
      client.getMe(function(err, me) {
        if (err) {
          return done(err);
        }
        var first = me.homes && me.homes[0];
        if (!first) {
          return done({ kind: 'http', status: 200 });
        }
        client.getHome(first.id, function(err, settings) {
          if (err) {
            return done(err);
          }
          done(null, {
            id: first.id,
            unit: settings.temperatureUnit === 'FAHRENHEIT' ? 'FAHRENHEIT' : 'CELSIUS'
          });
        });
      });
    }, function(err, data) {
      cb(err, data);
    });
  }

  // cb(err, {unit, rooms, presence, ageSeconds, stale}). rooms suit l'ordre de l'application Tado.
  function rooms(opts, cb) {
    var force = !!opts.force;
    home(function(err, h) {
      if (err) {
        return cb(err);
      }
      parallel({
        zones: function(done) {
          cache.fetch('zones', TTL_ZONES, false, function(d) { client.getZones(h.id, d); }, done);
        },
        states: function(done) {
          cache.fetch('zoneStates', TTL_STATES, force, function(d) { client.getZoneStates(h.id, d); }, done);
        },
        state: function(done) {
          cache.fetch('state', TTL_STATES, force, function(d) { client.getState(h.id, d); }, done);
        }
      }, function(err, r) {
        if (err) {
          return cb(err);
        }
        var states = r.states.data.zoneStates;
        var list = r.zones.data
          .filter(function(z) { return z.type === 'HEATING' && states[z.id]; })
          .map(function(z) { return { id: z.id, name: z.name, state: states[z.id] }; });
        cb(null, {
          homeId: h.id,
          unit: h.unit,
          rooms: list,
          presence: { presence: r.state.data.presence, locked: !!r.state.data.presenceLocked },
          ageSeconds: r.states.info.ageSeconds,
          stale: r.states.info.source === 'stale' || r.state.info.source === 'stale'
        });
      });
    });
  }

  return { rooms: rooms, home: home };
}

module.exports = createHome;
