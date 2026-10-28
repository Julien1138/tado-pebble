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
  var history = deps.history;
  var cache = deps.cache;
  var openUrl = deps.openUrl;
  var now = deps.now || function() { return Date.now(); };
  var latestSeq = 0;
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

  // Messages à envoyer quand la lecture échoue : état de liaison, ou hors connexion (DEC-07 : la
  // montre garde sa copie).
  function failureMessages(seq, err, prefix) {
    if (err.kind === 'lost' || err.kind === 'unlinked') {
      linkLost = err.kind === 'lost';
      return (prefix || []).concat([linkStatus(seq)]);
    }
    return (prefix || []).concat([status(seq, { Indicators: P.IND_OFFLINE })]);
  }

  // La liste des pièces : STATUS, tête, une ligne par pièce. prefix : messages à envoyer avant
  // (accusé d'une commande).
  function roomsMessages(seq, data, prefix) {
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
    return messages;
  }

  function sendRooms(seq, refresh, prefix) {
    home.rooms({ force: refresh }, function(err, data) {
      if (err) {
        return messenger.replace(failureMessages(seq, err, prefix));
      }
      messenger.replace(roomsMessages(seq, data, prefix));
    });
  }

  // Détail d'une pièce (MSG-14). Avec refresh, les pièces sont relues chez Tado et renvoyées d'abord,
  // sous la même séquence : la montre n'accepte que la dernière demande (TPB-ACT-001).
  function sendDetail(seq, index, refresh) {
    home.rooms({ force: refresh }, function(err, data) {
      if (err) {
        return refresh ? messenger.replace(failureMessages(seq, err)) : undefined;
      }
      if (!data.rooms[index]) {
        return;
      }
      var d = views.buildDetail(data.rooms[index], data.unit, now());
      var last = control.last(data.rooms[index].id, data.unit);
      var messages = refresh ? roomsMessages(seq, data) : [];
      messages.push({
        MsgType: P.MSG_DETAIL, Seq: seq, Index: index, Mode: d.mode, Remaining: d.remaining,
        EndTime: d.endTime, NextTime: d.nextTime, NextTemp: d.nextTemp,
        Humidity: d.humidity, WindowMin: d.windowMinutes,
        LastTemp: last ? last.temp : 0, LastDur: last ? last.duration : 0
      });
      messenger.replace(messages);
    });
  }

  // Plage de consigne de la pièce (MSG-20), avec les pièces relues si refresh.
  function sendCaps(seq, index, refresh) {
    home.rooms({ force: refresh }, function(err, data) {
      if (err) {
        return refresh ? messenger.replace(failureMessages(seq, err)) : undefined;
      }
      if (!data.rooms[index]) {
        return;
      }
      control.range({ homeId: data.homeId, zoneId: data.rooms[index].id, unit: data.unit }, function(err, r) {
        var messages = refresh ? roomsMessages(seq, data) : [];
        if (!err) {
          messages.push({ MsgType: P.MSG_CAPS, Seq: seq, Index: index,
                          CapMin: r.min, CapMax: r.max, CapStep: r.step });
        }
        if (messages.length > 0) {
          messenger.replace(messages);
        }
      });
    });
  }

  function presenceMessage(seq, data) {
    var v = views.buildPresence(data, control.autoUnavailable());
    return { MsgType: P.MSG_PRESENCE, Seq: seq, PresenceMode: v.mode, PresenceState: v.state,
             DevicesHome: v.devicesHome, DevicesTracked: v.devicesTracked, AutoUnavailable: v.autoUnavailable };
  }

  // Présence (MSG-18) : mode, état et appareils présents.
  function sendPresence(seq, refresh) {
    home.presence({ force: refresh }, function(err, data) {
      if (err) {
        return refresh ? messenger.replace(failureMessages(seq, err)) : undefined;
      }
      messenger.replace([presenceMessage(seq, data)]);
    });
  }

  // Changement de mode de présence : écriture, puis relecture sans cache (TPB-PRE-005). Jamais retentée.
  function runPresence(payload) {
    var seq = payload.Seq;
    home.presence({ force: false }, function(err, current) {
      if (err) {
        return messenger.replace([{ MsgType: P.MSG_ACK, Seq: seq, Result: control.resultFor(err) }]);
      }
      control.setPresence({ homeId: current.homeId }, payload.PresenceMode, function(err) {
        if (err) {
          var autoRefused = payload.PresenceMode === P.PRESENCE_AUTO && err.kind === 'forbidden';
          var ack = { MsgType: P.MSG_ACK, Seq: seq, Result: autoRefused ? P.RES_AUTO_UNAVAILABLE : control.resultFor(err) };
          if (err.kind === 'lost' || err.kind === 'unlinked') {
            linkLost = err.kind === 'lost';
            return messenger.replace([ack, linkStatus(seq)]);
          }
          return messenger.replace(autoRefused ? [ack, presenceMessage(seq, current)] : [ack]);
        }
        var ok = { MsgType: P.MSG_ACK, Seq: seq, Result: P.RES_OK };
        home.rooms({ force: true }, function(err, data) {
          if (err) {
            return messenger.replace(failureMessages(seq, err, [ok]));
          }
          home.presence({ force: false }, function(err, fresh) {
            var prefix = err ? [ok] : [ok, presenceMessage(seq, fresh)];
            messenger.replace(roomsMessages(seq, data, prefix));
          });
        });
      });
    });
  }

  // Historique (MSG-15) : une rangée par pièce, envoyée dès que son rapport est lu, pour que la
  // grille se remplisse à l'écran. columns : nombre de colonnes voulu par la montre (12, ou 8).
  function sendHistory(seq, refresh, columns) {
    home.rooms({ force: false }, function(err, data) {
      if (err) {
        return messenger.replace(failureMessages(seq, err));
      }
      var n = columns > 0 && columns <= 12 ? columns : 12;
      var abbrevs = views.abbreviations(data.rooms.map(function(r) { return r.name; }));
      messenger.replace([]);
      data.rooms.forEach(function(room, index) {
        history.columnsFor(data.homeId, room.id, now(), n, refresh, function(err, cols) {
          if (seq !== latestSeq) {
            return;   // une demande plus récente est arrivée : celle-ci n'intéresse plus la montre
          }
          var packed = history.pack(cols);
          messenger.send([{ MsgType: P.MSG_HISTORY_ROW, Seq: seq, Index: index, Abbrev: abbrevs[index],
                            Columns: n, Levels: packed.levels, Unknown: packed.unknown }]);
        });
      });
    });
  }

  // Raccourcis offerts (MSG-19) : masque et nombre de pièces forcées, avec les pièces relues si refresh.
  function sendShortcuts(seq, refresh) {
    home.rooms({ force: refresh }, function(err, data) {
      if (err) {
        return refresh ? messenger.replace(failureMessages(seq, err)) : undefined;
      }
      var v = views.buildShortcuts(data, control.autoUnavailable());
      var messages = refresh ? roomsMessages(seq, data) : [];
      messages.push({ MsgType: P.MSG_SHORTCUTS, Seq: seq, Mask: v.mask, ForcedCount: v.forced });
      messenger.replace(messages);
    });
  }

  // Raccourci de toute la maison : écriture, relecture sans cache, puis comparaison pour dire quelles
  // pièces n'ont pas été modifiées (TPB-RAC-007). Jamais retenté.
  function runShortcut(payload) {
    var seq = payload.Seq;
    var kind = payload.Shortcut;
    home.rooms({ force: false }, function(err, data) {
      if (err) {
        return messenger.replace([{ MsgType: P.MSG_ACK, Seq: seq, Result: control.resultFor(err) }]);
      }
      var done = function(err) {
        if (err) {
          var autoRefused = kind === P.SC_GEO && err.kind === 'forbidden';
          var ack = { MsgType: P.MSG_ACK, Seq: seq, Result: autoRefused ? P.RES_AUTO_UNAVAILABLE : control.resultFor(err) };
          if (err.kind === 'lost' || err.kind === 'unlinked') {
            linkLost = err.kind === 'lost';
            return messenger.replace([ack, linkStatus(seq)]);
          }
          return messenger.replace([ack]);
        }
        home.rooms({ force: true }, function(err, fresh) {
          var ack = { MsgType: P.MSG_ACK, Seq: seq, Result: P.RES_OK };
          if (err) {
            return messenger.replace(failureMessages(seq, err, [ack]));
          }
          if (kind === P.SC_ALL_OFF || kind === P.SC_PROGRAM) {
            var targeted = [];
            data.rooms.forEach(function(r, i) {
              if (kind === P.SC_ALL_OFF || r.state.overlay) {
                targeted.push(i);
              }
            });
            var u = views.unmodifiedRooms(kind, fresh.rooms, targeted);
            if (u.count > 0) {
              ack.Result = u.count === targeted.length ? P.RES_FAILED : P.RES_PARTIAL;
              ack.FailedMask = u.mask;
            }
          }
          messenger.replace(roomsMessages(seq, fresh, [ack]));
        });
      };
      if (kind === P.SC_ABSENT || kind === P.SC_GEO) {
        control.setPresence({ homeId: data.homeId }, kind === P.SC_ABSENT ? P.PRESENCE_AWAY : P.PRESENCE_AUTO, done);
      } else {
        control.shortcut({ homeId: data.homeId, unit: data.unit }, kind, data.rooms, done);
      }
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
      sendDetail(seq, payload.Index, !!payload.Refresh);
    } else if (payload.Object === P.OBJ_HISTORY) {
      sendHistory(seq, !!payload.Refresh, payload.Columns);
    } else if (payload.Object === P.OBJ_SHORTCUTS) {
      sendShortcuts(seq, !!payload.Refresh);
    } else if (payload.Object === P.OBJ_PRESENCE) {
      sendPresence(seq, !!payload.Refresh);
    } else if (payload.Object === P.OBJ_CAPS) {
      sendCaps(seq, payload.Index, !!payload.Refresh);
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
    } else if (payload.Command === P.CMD_SHORTCUT) {
      if (!link.isLinked()) {
        return messenger.replace([linkStatus(payload.Seq)]);
      }
      runShortcut(payload);
    } else if (payload.Command === P.CMD_PRESENCE) {
      if (!link.isLinked()) {
        return messenger.replace([linkStatus(payload.Seq)]);
      }
      runPresence(payload);
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
    if (payload.Seq !== undefined) {
      latestSeq = payload.Seq;
    }
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
