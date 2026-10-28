#include "win_detail.h"
#include "comms.h"
#include "platform.h"
#include "protocol.h"
#include "store.h"
#include "text.h"
#include "ui.h"
#include "win_pieces.h"

#ifdef PBL_ROUND
  #define BAR_W 0
#elif PBL_DISPLAY_WIDTH >= 200
  #define BAR_W 30
#else
  #define BAR_W 24
#endif

static Window *s_window;
static Layer *s_title;
static Layer *s_content;
static Layer *s_bar;
static uint8_t s_index;

// --- Contenu ------------------------------------------------------------------------------

static void mode_line(const Room *room, char *out, size_t size) {
  char when[16];
  if (room->flags & FLAG_OFFLINE) {
    snprintf(out, size, "%s", text_get(T_OFFLINE));
    return;
  }
  if (!g_detail.valid || g_detail.index != s_index) {
    out[0] = '\0';
    return;
  }
  switch (g_detail.mode) {
    case MODE_TIMER:
      text_duration(when, sizeof(when), g_detail.remaining);
      snprintf(out, size, "%s · %s %s", text_get(T_BOOST), text_get(T_LEFT), when);
      break;
    case MODE_NEXT_BLOCK:
      text_time(when, sizeof(when), g_detail.end_time);
      snprintf(out, size, "%s · %s %s", text_get(T_BOOST), text_get(T_UNTIL), when);
      break;
    case MODE_MANUAL:
      snprintf(out, size, "%s", text_get(T_UNTIL_FURTHER));
      break;
    default:
      if (g_detail.end_time >= 0) {
        text_time(when, sizeof(when), g_detail.end_time);
        snprintf(out, size, "%s · %s", text_get(T_SCHEDULE), when);
      } else {
        snprintf(out, size, "%s", text_get(T_SCHEDULE));
      }
  }
}

static void next_line(char *out, size_t size) {
  char when[16], temp[12];
  out[0] = '\0';
  if (!g_detail.valid || g_detail.index != s_index || g_detail.next_time < 0) {
    return;
  }
  text_time(when, sizeof(when), g_detail.next_time);
  if (g_detail.next_temp == DETAIL_NO_TEMP) {
    snprintf(out, size, "%s %s %s %s", text_get(T_THEN), text_get(T_OFF), text_get(T_AT), when);
  } else {
    text_temp(temp, sizeof(temp), g_detail.next_temp, g_view.unit);
    snprintf(out, size, "%s %s %s %s", text_get(T_THEN), temp, text_get(T_AT), when);
  }
}

// Barre de puissance : dix segments (TPB-AFF-003 : le pourcentage est aussi écrit).
static void draw_power_bar(GContext *ctx, GRect rect, uint8_t power) {
  int filled = (power + 9) / 10;
  int seg = rect.size.w / 10;
  for (int i = 0; i < 10; i++) {
    GRect r = GRect(rect.origin.x + i * seg, rect.origin.y, seg - 1, rect.size.h);
    graphics_context_set_fill_color(ctx, i < filled ? PBL_IF_COLOR_ELSE(GColorOrange, GColorWhite)
                                                    : PBL_IF_COLOR_ELSE(GColorDarkGray, GColorBlack));
    graphics_fill_rect(ctx, r, 0, GCornerNone);
    graphics_context_set_stroke_color(ctx, GColorWhite);
    if (i >= filled) {
      graphics_draw_rect(ctx, r);
    }
  }
}

static void content_draw(Layer *layer, GContext *ctx) {
  const Room *room = &g_view.rooms[s_index];
  GRect b = layer_get_bounds(layer);
  GTextAlignment align = PBL_IF_ROUND_ELSE(GTextAlignmentCenter, GTextAlignmentLeft);
  int x = PBL_IF_ROUND_ELSE(b.size.w / 8, 4);
  int w = b.size.w - 2 * x;
  char line[40], temp[16];
#ifdef PBL_ROUND
  static const int Y[] = { 0, 215, 335, 440, 640, 755, 755 };
#else
  static const int Y[] = { 20, 230, 345, 465, 665, 790, 905 };
#endif
  #define SLOT(n) (b.size.h * Y[n] / 1000)
  int tile_h = b.size.h * 200 / 1000;

  graphics_context_set_text_color(ctx, GColorWhite);

  // Température mesurée, sur une tuile de la couleur de sa tranche.
  if (room->flags & FLAG_NO_MEASURE) {
    ui_draw_text(ctx, text_get(T_NO_MEASURE), F_NAME, GRect(x, SLOT(0), w, tile_h), align);
  } else {
    text_temp(temp, sizeof(temp), room->temp, g_view.unit);
    int tile_w = w * 62 / 100;
    int tile_x = PBL_IF_ROUND_ELSE((b.size.w - tile_w) / 2, x);
    graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(ui_band_color(room->band), GColorWhite));
    graphics_fill_rect(ctx, GRect(tile_x, SLOT(0), tile_w, tile_h), 0, GCornerNone);
    graphics_context_set_text_color(ctx, GColorBlack);
    ui_draw_text(ctx, temp, F_TEMP, GRect(tile_x, SLOT(0) + (tile_h - 30) / 2 - 2, tile_w, 34),
                 GTextAlignmentCenter);
    graphics_context_set_text_color(ctx, GColorWhite);
  }

  // Température demandée, ou chauffage éteint (TPB-PIE-006).
  if (room->flags & FLAG_OFF) {
    snprintf(line, sizeof(line), "%s", text_get(T_OFF_CAP));
  } else {
    text_temp(temp, sizeof(temp), room->setpoint, g_view.unit);
    snprintf(line, sizeof(line), "%s %s", text_get(T_SETPOINT), temp);
  }
  ui_draw_text(ctx, line, F_NAME, GRect(x, SLOT(1), w, 26), align);

  mode_line(room, line, sizeof(line));
  ui_draw_text(ctx, line, F_SUB, GRect(x, SLOT(2), w, 22), align);

  // Chauffe en cours : texte, pourcentage et barre.
  if (room->flags & FLAG_HEATING) {
    snprintf(line, sizeof(line), "%s %d %%", text_get(T_HEATING), room->power);
    graphics_context_set_text_color(ctx, PBL_IF_COLOR_ELSE(GColorOrange, GColorWhite));
    ui_draw_text(ctx, line, F_NAME, GRect(x, SLOT(3), w, 26), align);
    int bar_w = w * 7 / 10;
    draw_power_bar(ctx, GRect(PBL_IF_ROUND_ELSE((b.size.w - bar_w) / 2, x),
                              SLOT(3) + (PBL_DISPLAY_WIDTH >= 200 ? 31 : 24), bar_w, 6), room->power);
    graphics_context_set_text_color(ctx, GColorWhite);
  } else {
    ui_draw_text(ctx, text_get(T_NOT_HEATING), F_NAME, GRect(x, SLOT(3), w, 26), align);
  }

  if (g_detail.valid && g_detail.index == s_index && g_detail.humidity >= 0) {
    snprintf(line, sizeof(line), "%s %d %%", text_get(T_HUMIDITY), g_detail.humidity);
    ui_draw_text(ctx, line, F_SUB, GRect(x, SLOT(4), w, 22), align);
  }

#ifdef PBL_ROUND
  // Écran rond : une seule ligne en bas ; la fenêtre ouverte, plus urgente, prend la place.
  bool show_next = !(room->flags & FLAG_WINDOW);
#else
  bool show_next = true;
#endif
  if (show_next) {
    next_line(line, sizeof(line));
    ui_draw_text(ctx, line, F_SUB, GRect(x, SLOT(5), w, 22), align);
  }

  // Fenêtre ouverte : le chauffage est coupé depuis N minutes (TPB-DET-008).
  if (room->flags & FLAG_WINDOW) {
    if (g_detail.valid && g_detail.index == s_index) {
      snprintf(line, sizeof(line), "%s · %d min", text_get(T_WINDOW_OPEN), g_detail.window_minutes);
    } else {
      snprintf(line, sizeof(line), "%s", text_get(T_WINDOW_OPEN));
    }
    graphics_context_set_text_color(ctx, PBL_IF_COLOR_ELSE(GColorChromeYellow, GColorWhite));
    ui_draw_text(ctx, line, F_SUB, GRect(x, SLOT(6), w, 22), align);
  }
  #undef SLOT
}

static void title_draw(Layer *layer, GContext *ctx) {
  ui_draw_title(ctx, layer_get_bounds(layer), g_view.rooms[s_index].name, true);
}

// --- Barre d'actions (M-09) ----------------------------------------------------------------

static void bar_draw(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  int cx = b.size.w / 2;
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkGray, GColorWhite));
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  graphics_context_set_stroke_color(ctx, PBL_IF_COLOR_ELSE(GColorWhite, GColorBlack));
  graphics_context_set_stroke_width(ctx, 2);
  int top = b.size.h / 7;
  int bottom = b.size.h - top;
  graphics_draw_line(ctx, GPoint(cx - 5, top + 3), GPoint(cx, top - 2));
  graphics_draw_line(ctx, GPoint(cx, top - 2), GPoint(cx + 5, top + 3));
  graphics_draw_line(ctx, GPoint(cx - 5, bottom - 3), GPoint(cx, bottom + 2));
  graphics_draw_line(ctx, GPoint(cx, bottom + 2), GPoint(cx + 5, bottom - 3));
  // Curseurs : l'accès au pilotage.
  int mid = b.size.h / 2;
  graphics_draw_line(ctx, GPoint(cx - 7, mid - 4), GPoint(cx + 7, mid - 4));
  graphics_draw_line(ctx, GPoint(cx - 7, mid + 4), GPoint(cx + 7, mid + 4));
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorOrange, GColorBlack));
  graphics_fill_circle(ctx, GPoint(cx + 2, mid - 4), 3);
  graphics_fill_circle(ctx, GPoint(cx - 2, mid + 4), 3);
}

// --- Navigation -----------------------------------------------------------------------------

static void show_room(uint8_t index) {
  s_index = index;
  comms_request_detail(s_index);
  layer_mark_dirty(s_title);
  layer_mark_dirty(s_content);
}

static void on_up(ClickRecognizerRef recognizer, void *context) {
  show_room((s_index + g_view.count - 1) % g_view.count);
}

static void on_down(ClickRecognizerRef recognizer, void *context) {
  show_room((s_index + 1) % g_view.count);
}

static void click_config(void *context) {
  window_single_click_subscribe(BUTTON_ID_UP, on_up);
  window_single_click_subscribe(BUTTON_ID_DOWN, on_down);
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);
  window_set_background_color(window, GColorBlack);
  s_title = layer_create(GRect(0, 0, b.size.w, TITLE_H));
  layer_set_update_proc(s_title, title_draw);
  s_content = layer_create(GRect(0, TITLE_H, b.size.w - BAR_W, b.size.h - TITLE_H));
  layer_set_update_proc(s_content, content_draw);
  layer_add_child(root, s_content);
  layer_add_child(root, s_title);
  if (BAR_W > 0) {
    s_bar = layer_create(GRect(b.size.w - BAR_W, TITLE_H, BAR_W, b.size.h - TITLE_H));
    layer_set_update_proc(s_bar, bar_draw);
    layer_add_child(root, s_bar);
  }
  window_set_click_config_provider(window, click_config);
  comms_request_detail(s_index);
}

static void window_unload(Window *window) {
  if (s_bar) {
    layer_destroy(s_bar);
    s_bar = NULL;
  }
  layer_destroy(s_content);
  layer_destroy(s_title);
  window_destroy(s_window);
  s_window = NULL;
  g_detail.valid = false;
  win_pieces_select(s_index);
}

void win_detail_push(uint8_t room_index) {
  if (s_window || room_index >= g_view.count) {
    return;
  }
  s_index = room_index;
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
  window_stack_push(s_window, true);
}

void win_detail_reload(void) {
  if (!s_window) {
    return;
  }
  if (s_index >= g_view.count) {
    window_stack_remove(s_window, true);
    return;
  }
  comms_request_detail(s_index);
  layer_mark_dirty(s_title);
  layer_mark_dirty(s_content);
}

void win_detail_changed(void) {
  if (s_window && g_detail.index == s_index) {
    layer_mark_dirty(s_content);
  }
}
