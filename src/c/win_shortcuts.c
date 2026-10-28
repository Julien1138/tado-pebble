#include "win_shortcuts.h"
#include "comms.h"
#include "protocol.h"
#include "store.h"
#include "text.h"
#include "win_actions.h"
#include "win_result.h"

enum { CONFIRM_YES = 1, CONFIRM_NO };

static ActionList *s_list;
static ActionList *s_confirm;
static int s_chosen;    // raccourci en attente de confirmation (SC_*)

static TextId label_of(int sc) {
  static const TextId LABELS[] = { 0, T_SC_ALL_OFF, T_SC_PROGRAM, T_SC_ABSENT, T_SC_GEO };
  return LABELS[sc];
}

static TextId question_of(int sc) {
  static const TextId ASK[] = { 0, T_SC_ASK_ALL_OFF, T_SC_ASK_PROGRAM, T_SC_ASK_ABSENT, T_SC_ASK_GEO };
  return ASK[sc];
}

static void caption_of(int sc, char *out, size_t size) {
  switch (sc) {
    case SC_ALL_OFF:
      snprintf(out, size, "%s", text_get(T_SC_EVERYWHERE));
      break;
    case SC_PROGRAM:
      if (g_shortcuts.forced == 1) {
        snprintf(out, size, "%s", text_get(T_SC_FORCED_ONE));
      } else {
        snprintf(out, size, text_get(T_SC_FORCED_MANY), g_shortcuts.forced);
      }
      break;
    case SC_ABSENT:
      snprintf(out, size, "%s", text_get(T_SC_YOU_HOME));
      break;
    default:
      snprintf(out, size, "%s", text_get(T_SC_IMPOSED));
  }
}

// Seuls les raccourcis offerts dans la situation actuelle figurent dans la liste (TPB-RAC-002 à 005).
static void build(void) {
  ActionItem items[4];
  uint8_t n = 0;
  memset(items, 0, sizeof(items));
  for (int sc = SC_ALL_OFF; sc <= SC_GEO; sc++) {
    if (g_shortcuts.valid && (g_shortcuts.mask & (1 << (sc - 1)))) {
      snprintf(items[n].label, sizeof(items[n].label), "%s", text_get(label_of(sc)));
      caption_of(sc, items[n].sub, sizeof(items[n].sub));
      items[n].id = sc;
      n++;
    }
  }
  actions_set_items(s_list, items, n);
  actions_set_title(s_list, text_get(T_SHORTCUTS));
  actions_set_header(s_list, NULL);
}

// --- Confirmation ----------------------------------------------------------------------------

static void on_confirm(int id) {
  if (id == CONFIRM_YES) {
    win_result_send(CMD_SHORTCUT, 0, 0, s_chosen);
  } else {
    actions_remove(s_confirm);
  }
}

static void ask(int sc) {
  ActionItem items[2];
  memset(items, 0, sizeof(items));
  s_chosen = sc;
  if (!s_confirm) {
    s_confirm = actions_create(on_confirm, NULL);
  }
  if (!s_confirm || actions_is_open(s_confirm)) {
    return;
  }
  snprintf(items[0].label, sizeof(items[0].label), "%s", text_get(T_CONFIRM));
  items[0].id = CONFIRM_YES;
  snprintf(items[1].label, sizeof(items[1].label), "%s", text_get(T_CANCEL));
  items[1].id = CONFIRM_NO;
  actions_set_items(s_confirm, items, 2);
  actions_set_title(s_confirm, text_get(label_of(sc)));
  actions_set_header(s_confirm, text_get(question_of(sc)));
  actions_push(s_confirm);
}

// --- Liste ------------------------------------------------------------------------------------

static void on_select(int sc) {
  ask(sc);
}

// Les raccourcis offerts dépendent de la situation : ils sont rechargés à chaque affichage.
static void on_appear(void) {
  comms_request_shortcuts(true);
}

void win_shortcuts_push(void) {
  if (!s_list) {
    s_list = actions_create(on_select, on_appear);
    actions_set_two_line(s_list, true);
  }
  if (!s_list || actions_is_open(s_list)) {
    return;
  }
  build();
  actions_push(s_list);
}

void win_shortcuts_close(void) {
  if (s_confirm) {
    actions_remove(s_confirm);
  }
  if (s_list) {
    actions_remove(s_list);
  }
}

void win_shortcuts_changed(void) {
  if (s_list && actions_is_open(s_list)) {
    build();
  }
}
