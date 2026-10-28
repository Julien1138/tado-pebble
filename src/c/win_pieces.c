#include "win_pieces.h"
#include "comms.h"
#include "platform.h"
#include "protocol.h"
#include "store.h"
#include "text.h"
#include "ui.h"
#include "win_detail.h"
#include "win_link.h"

#define REFRESH_MS (5 * 60 * 1000)
#define AGE_SHOWN_SECONDS 120

static Window *s_window;
static Layer *s_title;
static Layer *s_banner;
static MenuLayer *s_menu;
static TextLayer *s_empty;
static AppTimer *s_timer;
static bool s_link_dismissed;
static char s_banner_text[32];

#ifndef PBL_ROUND
static GPath *s_flame;
static const GPathInfo FLAME_INFO = {
  .num_points = 3, .points = (GPoint[]){ {0, -7}, {4, -1}, {-4, -1} }
};
#endif

// --- Couleurs (M-05) --------------------------------------------------------------------

// --- Contenu de la ligne ------------------------------------------------------------------

static void sub_text(const Room *room, char *out, size_t size) {
  char setpoint[12];
  if (room->flags & FLAG_OFFLINE) {
    snprintf(out, size, "%s", text_get(T_OFFLINE));
  } else if (room->flags & FLAG_OFF) {
    snprintf(out, size, "%s", text_get(T_OFF));
  } else {
    text_setpoint(setpoint, sizeof(setpoint), room->setpoint, g_view.unit);
    snprintf(out, size, "%s%s%s%s", ARROW, setpoint, (room->flags & FLAG_FORCED) ? " · " : "",
             (room->flags & FLAG_FORCED) ? text_get(T_FORCED) : "");
  }
}

static void temp_text(const Room *room, char *out, size_t size) {
  if (room->flags & FLAG_NO_MEASURE) {
    snprintf(out, size, "%s", text_get(T_NO_MEASURE));
  } else {
    text_temp(out, size, room->temp, g_view.unit);
  }
}

#ifndef PBL_ROUND
static void draw_flame(GContext *ctx, GPoint at, GColor color) {
  graphics_context_set_fill_color(ctx, color);
  gpath_move_to(s_flame, at);
  gpath_draw_filled(ctx, s_flame);
  graphics_fill_circle(ctx, GPoint(at.x, at.y + 2), 4);
}

// Ligne rectangulaire : nom et consigne à gauche, température et puissance à droite.
static void draw_row_rect(GContext *ctx, GRect b, const Room *room, GColor fg) {
  char temp[16], sub[32], power[12];
  int temp_w = PBL_DISPLAY_WIDTH >= 200 ? 76 : 62;
  int name_h = PBL_DISPLAY_WIDTH >= 200 ? 28 : 22;
  temp_text(room, temp, sizeof(temp));
  sub_text(room, sub, sizeof(sub));

  graphics_context_set_text_color(ctx, fg);
  ui_draw_text(ctx, room->name, F_NAME, GRect(4, -3, b.size.w - temp_w - 4, name_h), GTextAlignmentLeft);
  ui_draw_text(ctx, sub, F_SUB, GRect(4, name_h - 4, b.size.w - temp_w - 4, name_h), GTextAlignmentLeft);
  if (room->flags & FLAG_NO_MEASURE) {
    ui_draw_text(ctx, temp, F_SUB, GRect(b.size.w - temp_w - 2, 2, temp_w, name_h), GTextAlignmentRight);
  } else {
    ui_draw_text(ctx, temp, F_TEMP, GRect(b.size.w - temp_w - 2, -5, temp_w, name_h + 8), GTextAlignmentRight);
  }
  if (room->flags & FLAG_HEATING) {
    snprintf(power, sizeof(power), "%d %%", room->power);
    ui_draw_text(ctx, power, F_SUB, GRect(b.size.w - temp_w - 2, name_h - 4, temp_w, name_h), GTextAlignmentRight);
    draw_flame(ctx, GPoint(b.size.w - temp_w + 4, b.size.h - 13), fg);
  } else if (!(room->flags & (FLAG_OFF | FLAG_OFFLINE))) {
    ui_draw_text(ctx, text_get(T_IDLE), F_SUB, GRect(b.size.w - temp_w - 2, name_h - 4, temp_w, name_h), GTextAlignmentRight);
  }
}

#else
// Écran rond : la ligne sélectionnée est grande et centrée, les autres tiennent sur une ligne.
static void draw_row_round(GContext *ctx, GRect b, const Room *room, GColor fg, bool selected) {
  char temp[16], sub[32], line[48], power[12];
  graphics_context_set_text_color(ctx, fg);
  temp_text(room, temp, sizeof(temp));
  if (!selected) {
    snprintf(line, sizeof(line), "%s %s", room->name, temp);
    ui_draw_text(ctx, line, FONT_KEY_GOTHIC_18_BOLD, GRect(0, (b.size.h - 22) / 2 - 2, b.size.w, 24),
              GTextAlignmentCenter);
    return;
  }
  sub_text(room, sub, sizeof(sub));
  if (room->flags & FLAG_HEATING) {
    snprintf(power, sizeof(power), " · %d %%", room->power);
    strncat(sub, power, sizeof(sub) - strlen(sub) - 1);
  }
  int unit = b.size.h / 4;
  ui_draw_text(ctx, room->name, FONT_KEY_GOTHIC_24_BOLD, GRect(10, 0, b.size.w - 20, unit + 6), GTextAlignmentCenter);
  ui_draw_text(ctx, temp, FONT_KEY_GOTHIC_28_BOLD, GRect(0, unit - 2, b.size.w, unit + 14), GTextAlignmentCenter);
  ui_draw_text(ctx, sub, FONT_KEY_GOTHIC_18, GRect(10, b.size.h - unit - 2, b.size.w - 20, unit), GTextAlignmentCenter);
}

#endif

// --- Menu (M-06, via MenuLayer) -------------------------------------------------------------

static void menu_select(MenuLayer *layer, MenuIndex *index, void *context) {
  win_detail_push(index->row);
}

static uint16_t menu_rows(MenuLayer *layer, uint16_t section, void *context) {
  return g_view.count;
}

static int16_t menu_height(MenuLayer *layer, MenuIndex *index, void *context) {
#ifdef PBL_ROUND
  return menu_layer_is_index_selected(layer, index) ? SELECTED_H : OTHER_H;
#else
  return ROW_H;
#endif
}

static void menu_draw(GContext *ctx, const Layer *cell, MenuIndex *index, void *context) {
  const Room *room = &g_view.rooms[index->row];
  GRect b = layer_get_bounds(cell);
  bool selected = menu_layer_is_index_selected(s_menu, index);
#ifdef PBL_COLOR
  GColor bg = ui_band_color(room->band);
  GColor fg = GColorBlack;
#else
  // Noir et blanc : une pièce qui chauffe est en vidéo inversée (TPB-PLT-003).
  bool heating = (room->flags & FLAG_HEATING) != 0;
  GColor bg = heating ? GColorBlack : GColorWhite;
  GColor fg = heating ? GColorWhite : GColorBlack;
#endif

  graphics_context_set_fill_color(ctx, bg);
  graphics_fill_rect(ctx, b, 0, GCornerNone);
#ifdef PBL_ROUND
  draw_row_round(ctx, b, room, fg, selected);
#else
  draw_row_rect(ctx, b, room, fg);
#endif
  if (selected) {
    // Sélection : cadre épais, blanc sur couleur, de la couleur du texte en noir et blanc.
    graphics_context_set_stroke_color(ctx, PBL_IF_COLOR_ELSE(GColorWhite, fg));
    graphics_context_set_stroke_width(ctx, 3);
    graphics_draw_rect(ctx, grect_inset(b, GEdgeInsets(1)));
  }
}

// --- Titre et bandeau (M-10) --------------------------------------------------------------

static void age_text(char *out, size_t size, int age) {
  int minutes = age / 60;
  if (minutes >= 60) {
    snprintf(out, size, "%d h", minutes / 60);
  } else {
    snprintf(out, size, "%d min", minutes);
  }
}

// Texte du bandeau ; vide si les données sont fraîches.
static void banner_text(char *out, size_t size) {
  char age[16];
  out[0] = '\0';
  if (g_view.count == 0) {
    if (g_view.indicators & IND_OFFLINE) {
      snprintf(out, size, "%s", text_get(T_DISCONNECTED));
    }
    return;
  }
  age_text(age, sizeof(age), store_age_seconds());
  if (g_view.indicators & IND_OFFLINE) {
    snprintf(out, size, "%s · %s", text_get(T_DISCONNECTED), age);
  } else if (store_age_seconds() >= AGE_SHOWN_SECONDS) {
    snprintf(out, size, "%s %s", text_get(T_AGO), age);
  }
}

static void title_draw(Layer *layer, GContext *ctx) {
  char title[40];
#ifdef PBL_ROUND
  banner_text(title, sizeof(title));
  if (title[0] == '\0') {
    snprintf(title, sizeof(title), "%s", text_get(T_HOUSE));
  }
#else
  snprintf(title, sizeof(title), "%s · %s", text_get(T_HOUSE),
           text_get(g_view.presence_state == PRESENCE_AWAY ? T_ABSENT : T_PRESENT));
#endif
  ui_draw_title(ctx, layer_get_bounds(layer), title, true);
}

static void banner_draw(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkCandyAppleRed, GColorBlack));
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  graphics_context_set_text_color(ctx, GColorWhite);
  ui_draw_text(ctx, s_banner_text, F_SUB, GRect(4, -2, b.size.w - 8, b.size.h + 2), GTextAlignmentLeft);
}

// Place le bandeau, la liste et le message « Chargement » selon l'état.
static void relayout(void) {
  GRect b = layer_get_bounds(window_get_root_layer(s_window));
  banner_text(s_banner_text, sizeof(s_banner_text));
  bool show_banner = BANNER_H > 0 && s_banner_text[0] != '\0';
  int top = TITLE_H + (show_banner ? BANNER_H : 0);
  layer_set_hidden(s_banner, !show_banner);
  layer_set_frame(s_banner, GRect(0, TITLE_H, b.size.w, BANNER_H));
  layer_set_frame(menu_layer_get_layer(s_menu), GRect(0, top, b.size.w, b.size.h - top));
  layer_set_hidden(text_layer_get_layer(s_empty), g_view.count != 0);
  text_layer_set_text(s_empty, text_get((g_view.indicators & IND_OFFLINE) ? T_NO_ROOM : T_LOADING));
  layer_mark_dirty(s_title);
  layer_mark_dirty(s_banner);
}

// --- Cycle de vie ------------------------------------------------------------------------

static void on_minute(struct tm *tick_time, TimeUnits units) {
  if (s_window) {
    relayout();
  }
}

static void on_refresh_timer(void *data) {
  s_timer = app_timer_register(REFRESH_MS, on_refresh_timer, NULL);
  comms_request_rooms(true);
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);
  window_set_background_color(window, GColorBlack);

  s_title = layer_create(GRect(0, 0, b.size.w, TITLE_H));
  layer_set_update_proc(s_title, title_draw);
  s_banner = layer_create(GRect(0, TITLE_H, b.size.w, BANNER_H));
  layer_set_update_proc(s_banner, banner_draw);
  s_menu = menu_layer_create(GRect(0, TITLE_H, b.size.w, b.size.h - TITLE_H));
  menu_layer_set_callbacks(s_menu, NULL, (MenuLayerCallbacks){
    .get_num_rows = menu_rows, .get_cell_height = menu_height, .draw_row = menu_draw,
    .select_click = menu_select
  });
  menu_layer_set_normal_colors(s_menu, GColorBlack, GColorWhite);
  menu_layer_set_highlight_colors(s_menu, GColorBlack, GColorWhite);
#ifdef PBL_ROUND
  menu_layer_set_center_focused(s_menu, true);
#endif
  menu_layer_set_click_config_onto_window(s_menu, window);
  s_empty = text_layer_create(GRect(0, TITLE_H + b.size.h / 4, b.size.w, 30));
  text_layer_set_text_alignment(s_empty, GTextAlignmentCenter);
  text_layer_set_font(s_empty, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_text_color(s_empty, GColorWhite);
  text_layer_set_background_color(s_empty, GColorClear);

  layer_add_child(root, menu_layer_get_layer(s_menu));
  layer_add_child(root, s_banner);
  layer_add_child(root, s_title);
  layer_add_child(root, text_layer_get_layer(s_empty));
#ifndef PBL_ROUND
  s_flame = gpath_create(&FLAME_INFO);
#endif
  tick_timer_service_subscribe(MINUTE_UNIT, on_minute);
  s_timer = app_timer_register(REFRESH_MS, on_refresh_timer, NULL);
  relayout();
}

static void window_unload(Window *window) {
  tick_timer_service_unsubscribe();
  if (s_timer) {
    app_timer_cancel(s_timer);
    s_timer = NULL;
  }
#ifndef PBL_ROUND
  gpath_destroy(s_flame);
#endif
  text_layer_destroy(s_empty);
  menu_layer_destroy(s_menu);
  layer_destroy(s_banner);
  layer_destroy(s_title);
  window_destroy(s_window);
  s_window = NULL;
}

void win_pieces_push(void) {
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
  window_stack_push(s_window, true);
}

void win_pieces_reload(void) {
  if (!s_window) {
    return;
  }
  menu_layer_reload_data(s_menu);
  relayout();
}

void win_pieces_select(uint8_t row) {
  if (s_window && row < g_view.count) {
    menu_layer_set_selected_index(s_menu, MenuIndex(0, row), MenuRowAlignCenter, false);
  }
}

void win_pieces_status_changed(void) {
  if (!s_window) {
    return;
  }
  win_link_set_lost(g_view.link == LINK_LOST);
  if (g_view.link != LINK_ACTIVE) {
    if (!win_link_is_open() && !s_link_dismissed) {
      win_link_push();
    }
  }
  relayout();
}
