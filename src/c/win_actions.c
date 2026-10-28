#include "win_actions.h"
#include "gesture.h"
#include "platform.h"
#include "touch.h"
#include "ui.h"

#if defined(PBL_ROUND)
  #define ACTION_ROW_H OTHER_H
#elif PBL_DISPLAY_WIDTH >= 200
  #define ACTION_ROW_H 44
#else
  #define ACTION_ROW_H 34
#endif
#if defined(PBL_ROUND)
  #define TWO_LINE_H (OTHER_H + 18)
#elif PBL_DISPLAY_WIDTH >= 200
  #define TWO_LINE_H 60
#else
  #define TWO_LINE_H 46
#endif
#define HEADER_H PBL_IF_ROUND_ELSE(0, 20)

struct ActionList {
  Window *window;
  Layer *title_layer;
  Layer *header_layer;
  MenuLayer *menu;
  ActionSelectHandler on_select;
  ActionAppearHandler on_appear;
  char title[32];
  char header[48];
  ActionItem items[ACTION_MAX];
  uint8_t count;
  bool radio;
  bool two_line;
  bool built;          // composants graphiques créés
  uint16_t saved_row;
};

#define POOL_SIZE 6
static ActionList s_pool[POOL_SIZE];
static uint8_t s_pool_used;

// --- Dessin ------------------------------------------------------------------------------

static void title_draw(Layer *layer, GContext *ctx) {
  ActionList *list = *(ActionList **)layer_get_data(layer);
  ui_draw_title(ctx, layer_get_bounds(layer), list->title, true);
}

static void header_draw(Layer *layer, GContext *ctx) {
  ActionList *list = *(ActionList **)layer_get_data(layer);
  GRect b = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkCandyAppleRed, GColorBlack));
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  graphics_context_set_text_color(ctx, GColorWhite);
  ui_draw_text(ctx, list->header, F_SUB, GRect(4, -2, b.size.w - 8, b.size.h + 2), GTextAlignmentLeft);
}

static uint16_t menu_rows(MenuLayer *layer, uint16_t section, void *context) {
  return ((ActionList *)context)->count;
}

static int16_t row_height(const ActionList *list) {
  return list->two_line ? TWO_LINE_H : ACTION_ROW_H;
}

static int16_t menu_height(MenuLayer *layer, MenuIndex *index, void *context) {
  return row_height(context);
}

static void menu_draw(GContext *ctx, const Layer *cell, MenuIndex *index, void *context) {
  ActionList *list = context;
  GRect b = layer_get_bounds(cell);
  bool selected = menu_layer_is_index_selected(list->menu, index);
  GColor bg = selected ? PBL_IF_COLOR_ELSE(GColorChromeYellow, GColorWhite) : GColorBlack;
  GColor fg = selected ? GColorBlack : GColorWhite;
  graphics_context_set_fill_color(ctx, bg);
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  graphics_context_set_text_color(ctx, fg);
  int text_h = PBL_DISPLAY_WIDTH >= 200 ? 30 : 24;
  int left = PBL_IF_ROUND_ELSE(10, 6);
  if (list->radio) {
    // Puce : cercle vide, plein pour l'élément en vigueur (TPB-PRE-004, lisible aussi sans couleur).
    int r = PBL_DISPLAY_WIDTH >= 200 ? 8 : 7;
    GPoint c = GPoint(PBL_IF_ROUND_ELSE(22, 6 + r + 2), b.size.h / 2);
    graphics_context_set_stroke_color(ctx, fg);
    graphics_context_set_stroke_width(ctx, 2);
    graphics_draw_circle(ctx, c, r);
    if (list->items[index->row].marked) {
      graphics_context_set_fill_color(ctx, fg);
      graphics_fill_circle(ctx, c, r - 4);
    }
    left = c.x + r + 8;
  }
  GTextAlignment align = PBL_IF_ROUND_ELSE(list->radio ? GTextAlignmentLeft : GTextAlignmentCenter, GTextAlignmentLeft);
  int width = b.size.w - left - PBL_IF_ROUND_ELSE(10, 6);
  if (list->two_line) {
    // Libellé puis légende, centrés verticalement ensemble.
    int sub_h = PBL_DISPLAY_WIDTH >= 200 ? 22 : 18;
    int top = (b.size.h - text_h - sub_h) / 2 - 2;
    ui_draw_text(ctx, list->items[index->row].label, F_NAME, GRect(left, top, width, text_h), align);
    graphics_context_set_text_color(ctx, selected ? GColorBlack : PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite));
    ui_draw_text(ctx, list->items[index->row].sub, F_SUB, GRect(left, top + text_h - 2, width, sub_h), align);
  } else {
    ui_draw_text(ctx, list->items[index->row].label, F_NAME,
                 GRect(left, (b.size.h - text_h) / 2 - 3, width, text_h), align);
  }
}

static void menu_select(MenuLayer *layer, MenuIndex *index, void *context) {
  ActionList *list = context;
  list->on_select(list->items[index->row].id);
}

// --- Tactile -----------------------------------------------------------------------------------

static ActionList *s_touch_list;

static void touch_step(int direction) {
  if (s_touch_list) {
    menu_layer_set_selected_next(s_touch_list->menu, direction < 0, MenuRowAlignCenter, true);
  }
}

static void touch_tap(int16_t x, int16_t y) {
  ActionList *list = s_touch_list;
  if (!list) {
    return;
  }
  Layer *menu_layer = menu_layer_get_layer(list->menu);
  int menu_y = y - layer_get_frame(menu_layer).origin.y;
  int row = gesture_row_rect(menu_y, scroll_layer_get_content_offset(menu_layer_get_scroll_layer(list->menu)).y,
                             row_height(list), list->count);
  if (row >= 0) {
    menu_layer_set_selected_index(list->menu, MenuIndex(0, row), MenuRowAlignCenter, false);
    list->on_select(list->items[row].id);
  }
}

static void build(ActionList *list);
static void unbuild(ActionList *list);

static void window_appear(Window *window) {
  s_touch_list = window_get_user_data(window);
  if (!s_touch_list->built) {
    build(s_touch_list);
  }
  if (s_touch_list->on_appear) {
    s_touch_list->on_appear();
  }
  touch_start(&(TouchHandlers){ .on_tap = touch_tap, .on_step = touch_step,
                                .step_px = row_height(s_touch_list), .one_step = false });
}

static void window_disappear(Window *window) {
  touch_stop();
  s_touch_list = NULL;
}

// --- Fenêtre -----------------------------------------------------------------------------------

static void relayout(ActionList *list) {
  if (!list->built) {
    return;
  }
  GRect b = layer_get_bounds(window_get_root_layer(list->window));
  bool header = HEADER_H > 0 && list->header[0] != '\0';
  int top = TITLE_H + (header ? HEADER_H : 0);
  layer_set_hidden(list->header_layer, !header);
  layer_set_frame(menu_layer_get_layer(list->menu), GRect(0, top, b.size.w, b.size.h - top));
  layer_mark_dirty(list->title_layer);
  layer_mark_dirty(list->header_layer);
}

static void build(ActionList *list) {
  Window *window = list->window;
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);
  list->title_layer = layer_create_with_data(GRect(0, 0, b.size.w, TITLE_H), sizeof(ActionList *));
  *(ActionList **)layer_get_data(list->title_layer) = list;
  layer_set_update_proc(list->title_layer, title_draw);
  list->header_layer = layer_create_with_data(GRect(0, TITLE_H, b.size.w, HEADER_H), sizeof(ActionList *));
  *(ActionList **)layer_get_data(list->header_layer) = list;
  layer_set_update_proc(list->header_layer, header_draw);
  list->menu = menu_layer_create(GRect(0, TITLE_H, b.size.w, b.size.h - TITLE_H));
  menu_layer_set_callbacks(list->menu, list, (MenuLayerCallbacks){
    .get_num_rows = menu_rows, .get_cell_height = menu_height, .draw_row = menu_draw,
    .select_click = menu_select
  });
  menu_layer_set_normal_colors(list->menu, GColorBlack, GColorWhite);
  menu_layer_set_highlight_colors(list->menu, GColorBlack, GColorWhite);
#ifdef PBL_ROUND
  menu_layer_set_center_focused(list->menu, true);
#endif
  menu_layer_set_click_config_onto_window(list->menu, window);
  layer_add_child(root, menu_layer_get_layer(list->menu));
  layer_add_child(root, list->header_layer);
  layer_add_child(root, list->title_layer);
  list->built = true;
  if (list->saved_row < list->count) {
    menu_layer_set_selected_index(list->menu, MenuIndex(0, list->saved_row), MenuRowAlignCenter, false);
  }
  relayout(list);
}

static void unbuild(ActionList *list) {
  if (!list->built) {
    return;
  }
  list->saved_row = menu_layer_get_selected_index(list->menu).row;
  menu_layer_destroy(list->menu);
  layer_destroy(list->header_layer);
  layer_destroy(list->title_layer);
  list->built = false;
}

static void window_load(Window *window) {
  window_set_background_color(window, GColorBlack);
  build(window_get_user_data(window));
}

static void window_unload(Window *window) {
  ActionList *list = window_get_user_data(window);
  unbuild(list);
  window_destroy(list->window);
  list->window = NULL;
}

ActionList *actions_create(ActionSelectHandler on_select, ActionAppearHandler on_appear) {
  if (s_pool_used >= POOL_SIZE) {
    return NULL;
  }
  ActionList *list = &s_pool[s_pool_used++];
  memset(list, 0, sizeof(*list));
  list->on_select = on_select;
  list->on_appear = on_appear;
  return list;
}

void actions_set_title(ActionList *list, const char *title) {
  snprintf(list->title, sizeof(list->title), "%s", title);
  if (list->built) {
    layer_mark_dirty(list->title_layer);
  }
}

void actions_set_header(ActionList *list, const char *header) {
  snprintf(list->header, sizeof(list->header), "%s", header ? header : "");
  if (list->built) {
    relayout(list);
  }
}

void actions_set_two_line(ActionList *list, bool two_line) {
  list->two_line = two_line;
}

void actions_set_radio(ActionList *list, bool radio) {
  list->radio = radio;
}

void actions_set_items(ActionList *list, const ActionItem *items, uint8_t count) {
  list->count = count > ACTION_MAX ? ACTION_MAX : count;
  memcpy(list->items, items, sizeof(ActionItem) * list->count);
  if (list->built) {
    menu_layer_reload_data(list->menu);
  }
}

void actions_push(ActionList *list) {
  if (list->window) {
    return;
  }
  list->window = window_create();
  window_set_user_data(list->window, list);
  window_set_window_handlers(list->window, (WindowHandlers){
    .load = window_load, .unload = window_unload, .appear = window_appear, .disappear = window_disappear });
  window_stack_push(list->window, true);
}

void actions_remove(ActionList *list) {
  if (list->window) {
    window_stack_remove(list->window, true);
  }
}

bool actions_is_open(const ActionList *list) {
  return list->window != NULL;
}
