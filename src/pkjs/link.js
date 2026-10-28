// J-02 Liaison : flux de code d'appareil (RFC 8628), conservation et rafraîchissement des jetons.
// Seul composant à connaître les jetons. Le jeton de rafraîchissement tourne : le nouveau est
// écrit avant tout usage, et un seul rafraîchissement est en vol à la fois.
//
// Dépendances injectées : http(req, cb), storage {get, set, remove}, now(), setTimer, clearTimer.
// Erreurs : {kind} parmi unlinked, lost, network, expired, denied, failed.

// Identifiant public utilisé par la communauté pour le flux de code d'appareil.
var CLIENT_ID = '1bb50063-6b0c-4d11-bd99-387f4a91cc46';
var AUTHORIZE_URL = 'https://login.tado.com/oauth2/device_authorize';
var TOKEN_URL = 'https://login.tado.com/oauth2/token';
var DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
var STORAGE_KEY = 'tado.tokens';
var MARGIN_MS = 60 * 1000;

function encodeForm(params) {
  return Object.keys(params).map(function(name) {
    return encodeURIComponent(name) + '=' + encodeURIComponent(params[name]);
  }).join('&');
}

function createLink(deps) {
  var http = deps.http;
  var storage = deps.storage;
  var now = deps.now;
  var setTimer = deps.setTimer;
  var clearTimer = deps.clearTimer;

  var refreshWaiters = null;
  var cancelPending = null;

  function load() {
    try {
      return JSON.parse(storage.get(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function save(body) {
    storage.set(STORAGE_KEY, JSON.stringify({
      access: body.access_token,
      refresh: body.refresh_token,
      expiresAt: now() + body.expires_in * 1000
    }));
  }

  function postForm(url, params, cb) {
    http({
      method: 'POST',
      url: url,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeForm(params)
    }, cb);
  }

  function isLinked() {
    return load() !== null;
  }

  // Efface les jetons ; sert à délier (TPB-CPT-004) comme à déclarer la liaison perdue.
  function unlink() {
    if (cancelPending) {
      cancelPending();
    }
    storage.remove(STORAGE_KEY);
  }

  // Démarre la liaison. handlers.onCode({userCode, url, expiresIn}) puis handlers.onDone(err).
  // Les jetons sont écrits avant onDone(null). Renvoie une fonction d'annulation.
  function begin(handlers) {
    var cancelled = false;
    var timer = null;
    var cancel = function() {
      cancelled = true;
      if (timer !== null) {
        clearTimer(timer);
      }
      cancelPending = null;
    };
    var finish = function(err) {
      cancelPending = null;
      handlers.onDone(err);
    };
    cancelPending = cancel;

    postForm(AUTHORIZE_URL, { client_id: CLIENT_ID, scope: 'offline_access' }, function(err, res) {
      if (cancelled) {
        return;
      }
      if (err) {
        return finish({ kind: 'network' });
      }
      if (res.status !== 200 || !res.body) {
        return finish({ kind: 'failed', status: res.status });
      }
      var deviceCode = res.body.device_code;
      var intervalMs = (res.body.interval || 5) * 1000;
      var deadline = now() + res.body.expires_in * 1000;
      handlers.onCode({
        userCode: res.body.user_code,
        url: res.body.verification_uri_complete,
        expiresIn: res.body.expires_in
      });

      var schedule = function() {
        timer = setTimer(poll, intervalMs);
      };
      var poll = function() {
        timer = null;
        if (now() >= deadline) {
          return finish({ kind: 'expired' });
        }
        postForm(TOKEN_URL, {
          client_id: CLIENT_ID,
          device_code: deviceCode,
          grant_type: DEVICE_GRANT
        }, function(err, res) {
          if (cancelled) {
            return;
          }
          if (err) {
            return schedule();
          }
          if (res.status === 200) {
            save(res.body);
            return finish(null);
          }
          var code = res.body && res.body.error;
          if (code === 'authorization_pending') {
            return schedule();
          }
          if (code === 'slow_down') {
            intervalMs += 5000;
            return schedule();
          }
          if (code === 'expired_token') {
            return finish({ kind: 'expired' });
          }
          if (code === 'access_denied') {
            return finish({ kind: 'denied' });
          }
          finish({ kind: 'failed', status: res.status });
        });
      };
      schedule();
    });
    return cancel;
  }

  function refresh(tokens, cb) {
    if (refreshWaiters) {
      refreshWaiters.push(cb);
      return;
    }
    refreshWaiters = [cb];
    var settle = function(err, access) {
      var waiters = refreshWaiters;
      refreshWaiters = null;
      waiters.forEach(function(waiter) {
        waiter(err, access);
      });
    };
    postForm(TOKEN_URL, {
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh
    }, function(err, res) {
      if (err || res.status >= 500) {
        return settle({ kind: 'network' });
      }
      if (res.status !== 200) {
        unlink();
        return settle({ kind: 'lost' });
      }
      save(res.body);
      settle(null, res.body.access_token);
    });
  }

  // Rend un jeton d'accès valable. rejected : jeton que Tado vient de refuser (force le
  // rafraîchissement, sauf si un autre appel l'a déjà remplacé).
  function accessToken(cb, rejected) {
    var tokens = load();
    if (!tokens) {
      return cb({ kind: 'unlinked' });
    }
    var fresh = now() < tokens.expiresAt - MARGIN_MS;
    if (fresh && tokens.access !== rejected) {
      return cb(null, tokens.access);
    }
    refresh(tokens, cb);
  }

  return { begin: begin, accessToken: accessToken, isLinked: isLinked, unlink: unlink };
}

module.exports = createLink;
