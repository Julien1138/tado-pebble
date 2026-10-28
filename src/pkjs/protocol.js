// Constantes du protocole montre/téléphone (§ Protocole). Miroir : src/c/protocol.h.
module.exports = {
  // Types de message (clé MsgType)
  MSG_HELLO: 1,
  MSG_GET: 2,
  MSG_DO: 3,
  MSG_STATUS: 11,
  MSG_ROOMS_HEAD: 12,
  MSG_ROOM: 13,
  MSG_DETAIL: 14,
  MSG_CAPS: 20,
  MSG_ACK: 21,
  MSG_LINK_CODE: 22,
  MSG_READY: 30,

  // Objets demandables (clé Object)
  OBJ_ROOMS: 1,
  OBJ_DETAIL: 2,
  OBJ_CAPS: 3,

  // Commandes (clé Command)
  CMD_LINK: 1,
  CMD_UNLINK: 2,
  CMD_FORCE: 4,
  CMD_SCHEDULE: 5,
  CMD_OFF: 6,

  // Durées d'un forçage (clé Duration)
  DUR_30: 1,
  DUR_60: 2,
  DUR_120: 3,
  DUR_NEXT: 4,
  DUR_MANUAL: 5,

  // Résultat d'une commande (MSG_ACK, clé Result)
  RES_OK: 0,
  RES_REFUSED: 1,
  RES_FAILED: 2,
  RES_OFFLINE: 3,

  // État de la liaison (STATUS, clé Link)
  LINK_NONE: 0,
  LINK_LOST: 1,
  LINK_ACTIVE: 2,

  // État du code de liaison (LINK_CODE, clé LinkState)
  CODE_WAITING: 0,
  CODE_VALID: 1,
  CODE_EXPIRED: 2,
  CODE_DENIED: 3,

  // Indicateurs de STATUS (clé Indicators)
  IND_OFFLINE: 1,
  IND_WAITING: 2,

  // Présence (clés PresenceMode et PresenceState)
  PRESENCE_AUTO: 0,
  PRESENCE_HOME: 1,
  PRESENCE_AWAY: 2,

  // Indicateurs d'une pièce (clé Flags)
  FLAG_HEATING: 1,
  FLAG_FORCED: 2,
  FLAG_OFF: 4,
  FLAG_OFFLINE: 8,
  FLAG_WINDOW: 16,
  FLAG_NO_MEASURE: 32,

  // Mode d'une pièce (clé Mode)
  MODE_SCHEDULE: 0,
  MODE_TIMER: 1,
  MODE_NEXT_BLOCK: 2,
  MODE_MANUAL: 3,

  // Valeurs absentes dans MSG_DETAIL (EndTime, NextTime : minutes depuis minuit)
  NONE: -1,
  NO_TEMP: -999,

  // Unité (clé Unit)
  UNIT_C: 0,
  UNIT_F: 1
};
