#include "text.h"
#include "protocol.h"

static bool s_french;

static const char *const FR[T_COUNT] = {
  "Maison", "Présent", "Absent", "repos", "éteint", "hors ligne", "forcé", "indisponible",
  "Chargement…", "Aucune pièce", "Liaison Tado", "Sinon, ouvrir sur le\ntéléphone :\nlogin.tado.com\n/oauth2/device",
  "Attente", "Code expiré", "Liaison refusée", "Liaison perdue", "Hors connexion", "Il y a",
  "Consigne", "Programme", "Forcé", "encore", "jusqu'à", "Jusqu'à nouvel ordre", "Chauffe", "Ne chauffe pas",
  "Humidité", "Fenêtre ouverte", "Ensuite", "à", "Éteint",
  "Pilotage", "Forcer temp.", "Retour programme", "Éteindre chauffage", "Actuelle", "pendant",
  "30 min", "1 h", "2 h", "Prochain créneau", "Nouvel ordre",
  "Forcer", "Envoi…", "Pris en compte", "Refusé", "Échec", "Pas de réponse"
};
static const char *const EN[T_COUNT] = {
  "House", "Present", "Away", "idle", "off", "offline", "boost", "unavailable",
  "Loading…", "No room", "Tado link", "Otherwise, open on\nyour phone:\nlogin.tado.com\n/oauth2/device",
  "Waiting", "Code expired", "Link refused", "Link lost", "Offline", "Ago",
  "Setpoint", "Schedule", "Boost", "left", "until", "Until further notice", "Heating", "Not heating",
  "Humidity", "Window open", "Then", "at", "Off",
  "Control", "Set temp.", "Back to schedule", "Turn heating off", "Current", "for",
  "30 min", "1 h", "2 h", "Next period", "Until changed",
  "Boost", "Sending…", "Done", "Refused", "Failed", "No answer"
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

void text_time(char *out, size_t size, int minutes) {
  int h = (minutes / 60) % 24;
  int m = minutes % 60;
  if (clock_is_24h_style()) {
    snprintf(out, size, "%02d:%02d", h, m);
  } else {
    snprintf(out, size, "%d:%02d %s", h % 12 == 0 ? 12 : h % 12, m, h < 12 ? "AM" : "PM");
  }
}

void text_duration(char *out, size_t size, int minutes) {
  if (minutes < 60) {
    snprintf(out, size, "%d min", minutes);
  } else if (minutes % 60 == 0) {
    snprintf(out, size, "%d h", minutes / 60);
  } else {
    snprintf(out, size, "%d h %02d", minutes / 60, minutes % 60);
  }
}
