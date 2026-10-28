#include "win_menu.h"
#include "text.h"
#include "win_actions.h"
#include "win_presence.h"
#include "win_shortcuts.h"

enum { ENTRY_PRESENCE = 1, ENTRY_SHORTCUTS };

static ActionList *s_menu;

static void on_select(int id) {
  if (id == ENTRY_PRESENCE) {
    win_presence_push();
  } else if (id == ENTRY_SHORTCUTS) {
    win_shortcuts_push();
  }
}

void win_menu_push(void) {
  if (!s_menu) {
    s_menu = actions_create(on_select, NULL);
  }
  if (!s_menu || actions_is_open(s_menu)) {
    return;
  }
  ActionItem items[2];
  memset(items, 0, sizeof(items));
  snprintf(items[0].label, sizeof(items[0].label), "%s", text_get(T_PRESENCE));
  items[0].id = ENTRY_PRESENCE;
  snprintf(items[1].label, sizeof(items[1].label), "%s", text_get(T_SHORTCUTS));
  items[1].id = ENTRY_SHORTCUTS;
  actions_set_items(s_menu, items, 2);
  actions_set_title(s_menu, text_get(T_MENU));
  actions_set_header(s_menu, NULL);
  actions_push(s_menu);
}

void win_menu_close_all(void) {
  if (!s_menu) {
    return;
  }
  win_presence_close();
  win_shortcuts_close();
  actions_remove(s_menu);
}
