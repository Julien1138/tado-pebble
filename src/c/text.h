#pragma once
#include <pebble.h>

// M-08 Textes : libellés en français et en anglais, mise en forme des températures.
typedef enum {
  T_HOUSE, T_PRESENT, T_ABSENT, T_IDLE, T_OFF, T_OFFLINE, T_FORCED, T_NO_MEASURE,
  T_LOADING, T_NO_ROOM, T_LINK_TITLE, T_LINK_HELP, T_LINK_WAIT, T_LINK_EXPIRED,
  T_LINK_DENIED, T_LINK_LOST, T_DISCONNECTED, T_AGO,
  T_SETPOINT, T_SCHEDULE, T_BOOST, T_LEFT, T_UNTIL, T_UNTIL_FURTHER, T_HEATING, T_NOT_HEATING,
  T_HUMIDITY, T_WINDOW_OPEN, T_THEN, T_AT, T_OFF_CAP,
  T_PILOT, T_FORCE_TEMP, T_BACK_SCHEDULE, T_TURN_OFF, T_CURRENT, T_FOR,
  T_DUR_30, T_DUR_60, T_DUR_120, T_DUR_NEXT, T_DUR_MANUAL,
  T_HISTORY, T_NOW_SHORT, T_SHORTCUTS, T_SC_ALL_OFF, T_SC_PROGRAM, T_SC_ABSENT, T_SC_GEO, T_SC_EVERYWHERE, T_SC_FORCED_ONE,
  T_SC_FORCED_MANY, T_SC_YOU_HOME, T_SC_IMPOSED, T_SC_ASK_ALL_OFF, T_SC_ASK_PROGRAM, T_SC_ASK_ABSENT,
  T_SC_ASK_GEO, T_CONFIRM, T_CANCEL, T_RES_PARTIAL,
  T_MENU, T_PRESENCE, T_PRES_PRESENT, T_PRES_AWAY, T_PRES_AUTO, T_NOW, T_IMPOSED, T_AUTO_UNAVAILABLE,
  T_FORCE_SHORT, T_SENDING, T_RES_OK, T_RES_REFUSED, T_RES_FAILED, T_NO_ANSWER, T_COUNT
} TextId;

void text_init(void);
const char *text_get(TextId id);
bool text_is_french(void);
// Température en dixièmes dans l'unité du compte : « 19,4° » ou « 67° ».
void text_temp(char *out, size_t size, int16_t tenths, uint8_t unit);
// Consigne : décimale seulement si elle n'est pas ronde (« 21° », « 21,5° »).
// Heure en minutes depuis minuit, au format de la montre (24 h ou 12 h).
void text_time(char *out, size_t size, int minutes);
// Durée en minutes : « 40 min », « 1 h 05 ».
void text_duration(char *out, size_t size, int minutes);
void text_setpoint(char *out, size_t size, int16_t tenths, uint8_t unit);
