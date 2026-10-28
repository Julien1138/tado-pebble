#include "text.h"
#include "protocol.h"

static bool s_french;

static const char *const FR[T_COUNT] = {
  "Maison", "Présent", "Absent", "repos", "éteint", "hors ligne", "forcé", "indisponible",
  "Chargement…", "Aucune pièce", "Liaison Tado", "Saisir ce code sur\nlogin.tado.com/device",
  "Attente", "Code expiré", "Liaison refusée", "Liaison perdue", "Hors connexion", "Il y a"
};
static const char *const EN[T_COUNT] = {
  "House", "Present", "Away", "idle", "off", "offline", "boost", "unavailable",
  "Loading…", "No room", "Tado link", "Enter this code at\nlogin.tado.com/device",
  "Waiting", "Code expired", "Link refused", "Link lost", "Offline", "Ago"
};

void text_init(void) {
  const char *locale = i18n_get_system_locale();
  s_french = locale && locale[0] == 'f' && locale[1] == 'r';
}

bool text_is_french(void) {
  return s_french;
}

const char *text_get(TextId id) {
  return s_french ? FR[id] : EN[id];
}

static void format_tenths(char *out, size_t size, int tenths, bool always_decimal) {
  int sign = tenths < 0 ? -1 : 1;
  int abs_t = tenths * sign;
  int whole = abs_t / 10;
  int dec = abs_t % 10;
  if (!always_decimal && dec == 0) {
    snprintf(out, size, "%d°", sign * whole);
  } else {
    snprintf(out, size, "%d%c%d°", sign * whole, s_french ? ',' : '.', dec);
  }
}

void text_temp(char *out, size_t size, int16_t tenths, uint8_t unit) {
  if (unit == UNIT_F) {
    snprintf(out, size, "%d°", (tenths + 5) / 10);
  } else {
    format_tenths(out, size, tenths, true);
  }
}

void text_setpoint(char *out, size_t size, int16_t tenths, uint8_t unit) {
  if (unit == UNIT_F) {
    snprintf(out, size, "%d°", (tenths + 5) / 10);
  } else {
    format_tenths(out, size, tenths, false);
  }
}
