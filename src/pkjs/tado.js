// J-03 Client Tado : seul composant à connaître les adresses, les formes des requêtes et des
// réponses de l'API. Ajoute le jeton, rejoue une fois après un 401, normalise les erreurs.
//
// Dépendances injectées : http(req, cb), link (J-02).
// Erreurs : {kind, status, body} avec kind parmi unlinked, lost, network, server, rate,
// forbidden, notfound, refused, http.

var API = 'https://my.tado.com/api/v2';

function errorFor(res) {
  var kinds = { 403: 'forbidden', 404: 'notfound', 422: 'refused', 429: 'rate' };
  var kind = kinds[res.status] || (res.status >= 500 ? 'server' : 'http');
  return { kind: kind, status: res.status, body: res.body };
}

function headersFor(token, body) {
  var headers = { Authorization: 'Bearer ' + token };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function createClient(deps) {
  var http = deps.http;
  var link = deps.link;

  // Une lecture est retentée une fois si Tado est injoignable ; une commande jamais.
  function request(method, path, body, cb) {
    var canRetry = method === 'GET';

    var attempt = function(rejected, replayed) {
      link.accessToken(function(err, token) {
        if (err) {
          return cb(err);
        }
        http({
          method: method,
          url: API + path,
          headers: headersFor(token, body),
          body: body === undefined ? undefined : JSON.stringify(body)
        }, function(err, res) {
          if (err || res.status >= 500) {
            if (canRetry) {
              canRetry = false;
              return attempt(undefined, replayed);
            }
            return cb(err || errorFor(res));
          }
          if (res.status === 401) {
            if (replayed) {
              link.unlink();
              return cb({ kind: 'lost' });
            }
            return attempt(token, true);
          }
          if (res.status >= 200 && res.status < 300) {
            return cb(null, res.body);
          }
          cb(errorFor(res));
        });
      }, rejected);
    };
    attempt(undefined, false);
  }

  function home(h) {
    return '/homes/' + h;
  }
  function zone(h, z) {
    return '/homes/' + h + '/zones/' + z;
  }
  function get(path) {
    return function(cb) {
      request('GET', path, undefined, cb);
    };
  }

  return {
    request: request,

    getMe: get('/me'),
    getHome: function(h, cb) { get(home(h))(cb); },
    getZoneStates: function(h, cb) { get(home(h) + '/zoneStates')(cb); },
    getState: function(h, cb) { get(home(h) + '/state')(cb); },
    getMobileDevices: function(h, cb) { get(home(h) + '/mobileDevices')(cb); },
    getZones: function(h, cb) { get(home(h) + '/zones')(cb); },
    getAirComfort: function(h, cb) { get(home(h) + '/airComfort')(cb); },
    getCapabilities: function(h, z, cb) { get(zone(h, z) + '/capabilities')(cb); },
    getDayReport: function(h, z, date, cb) {
      get(zone(h, z) + '/dayReport?date=' + encodeURIComponent(date))(cb);
    },
    getZoneState: function(h, z, cb) { get(zone(h, z) + '/state')(cb); },

    // setting : {type, power, temperature: {celsius} ou {fahrenheit}} ; termination :
    // {typeSkillBasedApp: TIMER (avec durationInSeconds), TADO_MODE ou MANUAL}.
    putOverlay: function(h, z, setting, termination, cb) {
      request('PUT', zone(h, z) + '/overlay', { setting: setting, termination: termination }, cb);
    },
    deleteOverlay: function(h, z, cb) {
      request('DELETE', zone(h, z) + '/overlay', undefined, cb);
    },

    // presence : 'HOME' ou 'AWAY'.
    putPresenceLock: function(h, presence, cb) {
      request('PUT', home(h) + '/presenceLock', { homePresence: presence }, cb);
    },
    deletePresenceLock: function(h, cb) {
      request('DELETE', home(h) + '/presenceLock', undefined, cb);
    }
  };
}

module.exports = createClient;
