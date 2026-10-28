#include "win_presence.h"
#include "comms.h"
#include "protocol.h"
#include "store.h"
#include "text.h"
#include "win_actions.h"
#include "win_result.h"

static ActionList *s_list;

static const char *state_text(void) {
  return text_get(g_presence.state == PRESENCE_AWAY ? T_PRES_AWAY : T_PRES_PRESENT);
}

// Mode en vigueur et état qui en résulte (TPB-PRE-001) ; pour Auto, les appareils présents (TPB-PRE-003).
static void build(void) {
  ActionItem items[3];
  uint8_t n = 0;
  char header[48];

  snprintf(items[n].label, sizeof(items[n].label), "%s", text_get(T_PRES_PRESENT));
  items[n].id = PRESENCE_HOME;
  items[n].marked = g_presence.valid && g_presence.mode == PRESENCE_HOME;
  n++;
  snprintf(items[n].label, sizeof(items[n].label), "%s", text_get(T_PRES_AWAY));
  items[n].id = PRESENCE_AWAY;
  items[n].marked = g_presence.valid && g_presence.mode == PRESENCE_AWAY;
  n++;
  if (!g_presence.auto_unavailable) {
    bool current = g_presence.valid && g_presence.mode == PRESENCE_AUTO;
    if (current && g_presence.devices_tracked > 0) {
      snprintf(items[n].label, sizeof(items[n].label), "%s (%d/%d)", text_get(T_PRES_AUTO),
               g_presence.devices_home, g_presence.devices_tracked);
    } else {
      snprintf(items[n].label, sizeof(items[n].label), "%s", text_get(T_PRES_AUTO));
    }
    items[n].id = PRESENCE_AUTO;
    items[n].marked = current;
    n++;
  }
  actions_set_items(s_list, items, n);

  if (g_presence.valid) {
    snprintf(header, sizeof(header), "%s : %s · %s", text_get(T_NOW), state_text(),
             g_presence.mode == PRESENCE_AUTO ? text_get(T_PRES_AUTO) : text_get(T_IMPOSED));
  } else {
    header[0] = '\0';
  }
  actions_set_header(s_list, header);
#ifdef PBL_ROUND
  // Écran rond : pas de bandeau, l'état en vigueur est dans le titre.
  if (g_presence.valid) {
    snprintf(header, sizeof(header), "%s · %s", state_text(),
             g_presence.mode == PRESENCE_AUTO ? text_get(T_PRES_AUTO) : text_get(T_IMPOSED));
    actions_set_title(s_list, header);
  } else {
    actions_set_title(s_list, text_get(T_PRESENCE));
  }
#else
  actions_set_title(s_list, text_get(T_PRESENCE));
#endif
}

static void on_select(int mode) {
  // Aucune commande si le mode demandé est déjà en vigueur.
  if (g_presence.valid && g_presence.mode == mode) {
    return;
  }
  win_result_send(CMD_PRESENCE, 0, 0, mode);
}

// La présence est rechargée à chaque affichage de l'écran.
static void on_appear(void) {
  comms_request_presence(true);
}

void win_presence_push(void) {
  if (!s_list) {
    s_list = actions_create(on_select, on_appear);
    actions_set_radio(s_list, true);
  }
  if (!s_list || actions_is_open(s_list)) {
    return;
  }
  build();
  actions_push(s_list);
}

void win_presence_close(void) {
  if (s_list) {
    actions_remove(s_list);
  }
}

void win_presence_changed(void) {
  if (s_list && actions_is_open(s_list)) {
    build();
  }
}
