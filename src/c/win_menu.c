#include "win_menu.h"
#include "text.h"
#include "win_actions.h"
#include "win_presence.h"

enum { ENTRY_PRESENCE = 1 };

static ActionList *s_menu;

static void on_select(int id) {
  if (id == ENTRY_PRESENCE) {
    win_presence_push();
  }
}

void win_menu_push(void) {
  if (!s_menu) {
    s_menu = actions_create(on_select, NULL);
  }
  if (!s_menu || actions_is_open(s_menu)) {
    return;
  }
  ActionItem items[1] = { { .id = ENTRY_PRESENCE } };
  snprintf(items[0].label, sizeof(items[0].label), "%s", text_get(T_PRESENCE));
  actions_set_items(s_menu, items, 1);
  actions_set_title(s_menu, text_get(T_MENU));
  actions_set_header(s_menu, NULL);
  actions_push(s_menu);
}

void win_menu_close_all(void) {
  if (!s_menu) {
    return;
  }
  win_presence_close();
  actions_remove(s_menu);
}
