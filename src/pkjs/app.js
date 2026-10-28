// Contrôleur du pkjs : reçoit les demandes de la montre, interroge J-06 et J-02, envoie les vues
// construites par J-11 (§ Échanges types). Dépendances : messenger (J-01), link (J-02),
// home (J-06), views (J-11), cache (J-04), openUrl(url).
var P = require('./protocol');

var CACHE_KEYS = ['home', 'zones', 'zoneStates', 'state'];

function createApp(deps) {
  var messenger = deps.messenger;
  var link = deps.link;
  var home = deps.home;
  var views = deps.views;
  var cache = deps.cache;
  var openUrl = deps.openUrl;
  var linkLost = false;
  var cancelLink = null;

  function status(seq, extra) {
    var m = { MsgType: P.MSG_STATUS, Seq: seq, Link: P.LINK_ACTIVE, Age: 0, Indicators: 0,
              PresenceMode: P.PRESENCE_AUTO, PresenceState: P.PRESENCE_HOME, Alerts: 0 };
    Object.keys(extra || {}).forEach(function(k) { m[k] = extra[k]; });
    return m;
  }

  function linkStatus(seq) {
    return status(seq, { Link: linkLost ? P.LINK_LOST : P.LINK_NONE });
  }

  function sendRooms(seq, refresh) {
    home.rooms({ force: refresh }, function(err, data) {
      if (err) {
        if (err.kind === 'lost' || err.kind === 'unlinked') {
          linkLost = err.kind === 'lost';
          return messenger.replace([linkStatus(seq)]);
        }
        // Rien à montrer et Tado injoignable : la montre garde sa copie (DEC-07).
        return messenger.replace([status(seq, { Indicators: P.IND_OFFLINE })]);
      }
      var view = views.buildRooms(data);
      var messages = [
        status(seq, {
          Age: view.status.ageSeconds,
          Indicators: view.status.offline ? P.IND_OFFLINE : 0,
          PresenceMode: view.status.presenceMode,
          PresenceState: view.status.presenceState,
          Alerts: view.status.alerts
        }),
        { MsgType: P.MSG_ROOMS_HEAD, Seq: seq, Count: view.head.count, Unit: view.head.unit }
      ];
      view.rooms.forEach(function(r, i) {
        messages.push({
          MsgType: P.MSG_ROOM, Seq: seq, Index: i, Name: r.name, Abbrev: r.abbrev,
          Temp: r.temp, Setpoint: r.setpoint, Power: r.power, Band: r.band,
          Flags: r.flags, Mode: r.mode, Remaining: r.remaining
        });
      });
      messenger.replace(messages);
    });
  }

  function onGet(payload) {
    var seq = payload.Seq;
    if (!link.isLinked()) {
      return messenger.replace([linkStatus(seq)]);
    }
    if (payload.Object === P.OBJ_ROOMS) {
      sendRooms(seq, !!payload.Refresh);
    }
  }

  function startLink(seq) {
    if (cancelLink) {
      cancelLink();
    }
    cancelLink = link.begin({
      onCode: function(info) {
        messenger.replace([{ MsgType: P.MSG_LINK_CODE, Seq: seq, LinkCode: info.userCode,
                             LinkSeconds: info.expiresIn, LinkState: P.CODE_WAITING }]);
        openUrl(info.url);
      },
      onDone: function(err) {
        cancelLink = null;
        if (!err) {
          linkLost = false;
          return messenger.replace([status(seq), { MsgType: P.MSG_LINK_CODE, Seq: seq,
            LinkCode: '', LinkSeconds: 0, LinkState: P.CODE_VALID }]);
        }
        var state = err.kind === 'denied' ? P.CODE_DENIED : P.CODE_EXPIRED;
        messenger.replace([{ MsgType: P.MSG_LINK_CODE, Seq: seq, LinkCode: '', LinkSeconds: 0, LinkState: state }]);
      }
    });
  }

  function onDo(payload) {
    if (payload.Command === P.CMD_LINK) {
      startLink(payload.Seq);
    } else if (payload.Command === P.CMD_UNLINK) {
      if (cancelLink) {
        cancelLink();
        cancelLink = null;
      }
      link.unlink();
      cache.clear(CACHE_KEYS);
      linkLost = false;
      messenger.replace([linkStatus(payload.Seq)]);
    }
  }

  // payload : dictionnaire reçu de la montre (clés par nom).
  function onMessage(payload) {
    if (payload.MsgType === P.MSG_GET) {
      onGet(payload);
    } else if (payload.MsgType === P.MSG_DO) {
      onDo(payload);
    }
    // MSG_HELLO : rien à retenir pour l'écran Pièces (langue et forme servent aux écrans suivants).
  }

  return { onMessage: onMessage };
}

module.exports = createApp;
