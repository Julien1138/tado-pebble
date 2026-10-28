#pragma once
// Constantes du protocole montre/téléphone. Miroir de src/pkjs/protocol.js.

enum {
  MSG_HELLO = 1, MSG_GET = 2, MSG_DO = 3,
  MSG_STATUS = 11, MSG_ROOMS_HEAD = 12, MSG_ROOM = 13, MSG_DETAIL = 14,
  MSG_LINK_CODE = 22, MSG_READY = 30
};
enum { OBJ_ROOMS = 1, OBJ_DETAIL = 2 };
// Valeurs absentes dans MSG_DETAIL (EndTime, NextTime : minutes depuis minuit).
enum { DETAIL_NONE = -1, DETAIL_NO_TEMP = -999 };
enum { MODE_SCHEDULE = 0, MODE_TIMER = 1, MODE_NEXT_BLOCK = 2, MODE_MANUAL = 3 };
enum { CMD_LINK = 1, CMD_UNLINK = 2 };
enum { LINK_NONE = 0, LINK_LOST = 1, LINK_ACTIVE = 2 };
enum { CODE_WAITING = 0, CODE_VALID = 1, CODE_EXPIRED = 2, CODE_DENIED = 3 };
enum { IND_OFFLINE = 1, IND_WAITING = 2 };
enum { PRESENCE_AUTO = 0, PRESENCE_HOME = 1, PRESENCE_AWAY = 2 };
enum {
  FLAG_HEATING = 1, FLAG_FORCED = 2, FLAG_OFF = 4,
  FLAG_OFFLINE = 8, FLAG_WINDOW = 16, FLAG_NO_MEASURE = 32
};
enum { UNIT_C = 0, UNIT_F = 1 };
