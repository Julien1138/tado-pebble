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
  var control = deps.control;
  var cache = deps.cache;
  var openUrl = deps.openUrl;
  var now = deps.now || function() { return Date.now(); };
  var linkLost = false;
  var cancelLink = null;
  var pendingUrl = null;

  function status(seq, extra) {
    var m = { MsgType: P.MSG_STATUS, Seq: seq, Link: P.LINK_ACTIVE, Age: 0, Indicators: 0,
              PresenceMode: P.PRESENCE_AUTO, PresenceState: P.PRESENCE_HOME, Alerts: 0 };
    Object.keys(extra || {}).forEach(function(k) { m[k] = extra[k]; });
    return m;
  }

  function linkStatus(seq) {
    return status(seq, { Link: linkLost ? P.LINK_LOST : P.LINK_NONE });
  }

  // prefix : messages à envoyer avant la liste (accusé d'une commande).
  function sendRooms(seq, refresh, prefix) {
    home.rooms({ force: refresh }, function(err, data) {
      if (err) {
        if (err.kind === 'lost' || err.kind === 'unlinked') {
          linkLost = err.kind === 'lost';
          return messenger.replace((prefix || []).concat([linkStatus(seq)]));
        }
        // Rien à montrer et Tado injoignable : la montre garde sa copie (DEC-07).
        return messenger.replace((prefix || []).concat([status(seq, { Indicators: P.IND_OFFLINE })]));
      }
      var view = views.buildRooms(data);
      var messages = (prefix || []).concat([
        status(seq, {
          Age: view.status.ageSeconds,
          Indicators: view.status.offline ? P.IND_OFFLINE : 0,
          PresenceMode: view.status.presenceMode,
          PresenceState: view.status.presenceState,
          Alerts: view.status.alerts
        }),
        { MsgType: P.MSG_ROOMS_HEAD, Seq: seq, Count: view.head.count, Unit: view.head.unit }
      ]);
      view.rooms.forEach(function(r, i) {
        messages.push({
          MsgType: P.MSG_ROOM, Seq: seq, Index: i, Name: r.name,
          Temp: r.temp, Setpoint: r.setpoint, Power: r.power, Band: r.band,
          Flags: r.flags, Mode: r.mode, Remaining: r.remaining
        });
      });
      messenger.replace(messages);
    });
  }

  // Détail d'une pièce, d'après les données déjà lues (aucune requête si elles sont fraîches).
  function sendDetail(seq, index) {
    home.rooms({ force: false }, function(err, data) {
      if (err || !data.rooms[index]) {
        return;
      }
      var d = views.buildDetail(data.rooms[index], data.unit, now());
      var last = control.last(data.rooms[index].id, data.unit);
      messenger.replace([{
        MsgType: P.MSG_DETAIL, Seq: seq, Index: index, Mode: d.mode, Remaining: d.remaining,
        EndTime: d.endTime, NextTime: d.nextTime, NextTemp: d.nextTemp,
        Humidity: d.humidity, WindowMin: d.windowMinutes,
        LastTemp: last ? last.temp : 0, LastDur: last ? last.duration : 0
      }]);
    });
  }

  // Plage de consigne de la pièce (MSG-20).
  function sendCaps(seq, index) {
    home.rooms({ force: false }, function(err, data) {
      if (err || !data.rooms[index]) {
        return;
      }
      control.range({ homeId: data.homeId, zoneId: data.rooms[index].id, unit: data.unit }, function(err, r) {
        if (err) {
          return;
        }
        messenger.replace([{ MsgType: P.MSG_CAPS, Seq: seq, Index: index,
                             CapMin: r.min, CapMax: r.max, CapStep: r.step }]);
      });
    });
  }

  // Commande sur une pièce : écriture, puis relecture sans cache (DEC-10). Jamais retentée.
  function runCommand(payload) {
    var seq = payload.Seq;
    home.rooms({ force: false }, function(err, data) {
      var entry = !err && data.rooms[payload.Index];
      if (err || !entry) {
        return messenger.replace([{ MsgType: P.MSG_ACK, Seq: seq, Result: control.resultFor(err || { kind: 'refused' }) }]);
      }
      var target = { homeId: data.homeId, zoneId: entry.id, unit: data.unit };
      control.execute(target, { kind: payload.Command, temp: payload.Temp, duration: payload.Duration }, function(err) {
        var result = control.resultFor(err);
        var ack = { MsgType: P.MSG_ACK, Seq: seq, Result: result };
        if (err) {
          if (err.kind === 'lost' || err.kind === 'unlinked') {
            linkLost = err.kind === 'lost';
            return messenger.replace([ack, linkStatus(seq)]);
          }
          return messenger.replace([ack]);
        }
        sendRooms(seq, true, [ack]);
      });
    });
  }

  function onGet(payload) {
    var seq = payload.Seq;
    if (!link.isLinked()) {
      return messenger.replace([linkStatus(seq)]);
    }
    if (payload.Object === P.OBJ_ROOMS) {
      sendRooms(seq, !!payload.Refresh);
    } else if (payload.Object === P.OBJ_DETAIL) {
      sendDetail(seq, payload.Index);
    } else if (payload.Object === P.OBJ_CAPS) {
      sendCaps(seq, payload.Index);
    }
  }

  function startLink(seq) {
    if (cancelLink) {
      cancelLink();
    }
    cancelLink = link.begin({
      onCode: function(info) {
        pendingUrl = info.url;
        messenger.replace([{ MsgType: P.MSG_LINK_CODE, Seq: seq, LinkCode: info.userCode,
                             LinkSeconds: info.expiresIn, LinkState: P.CODE_WAITING }]);
        openUrl(info.url);
      },
      onDone: function(err) {
        cancelLink = null;
        pendingUrl = null;
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
    } else if (payload.Command === P.CMD_FORCE || payload.Command === P.CMD_SCHEDULE ||
               payload.Command === P.CMD_OFF) {
      if (!link.isLinked()) {
        return messenger.replace([linkStatus(payload.Seq)]);
      }
      runCommand(payload);
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

  // Page de validation de la liaison en cours, ou null (ouverte aussi depuis les réglages du pkjs).
  function pendingLinkUrl() {
    return pendingUrl;
  }

  return { onMessage: onMessage, pendingLinkUrl: pendingLinkUrl };
}

module.exports = createApp;
