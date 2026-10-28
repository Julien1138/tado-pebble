#pragma once
#include <pebble.h>

// M-08 Textes : libellés en français et en anglais, mise en forme des températures.
typedef enum {
  T_HOUSE, T_PRESENT, T_ABSENT, T_IDLE, T_OFF, T_OFFLINE, T_FORCED, T_NO_MEASURE,
  T_LOADING, T_NO_ROOM, T_LINK_TITLE, T_LINK_HELP, T_LINK_WAIT, T_LINK_EXPIRED,
  T_LINK_DENIED, T_LINK_LOST, T_DISCONNECTED, T_AGO, T_COUNT
} TextId;

void text_init(void);
const char *text_get(TextId id);
bool text_is_french(void);
// Température en dixièmes dans l'unité du compte : « 19,4° » ou « 67° ».
void text_temp(char *out, size_t size, int16_t tenths, uint8_t unit);
// Consigne : décimale seulement si elle n'est pas ronde (« 21° », « 21,5° »).
void text_setpoint(char *out, size_t size, int16_t tenths, uint8_t unit);
