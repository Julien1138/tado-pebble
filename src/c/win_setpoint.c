#include "win_setpoint.h"
#include "comms.h"
#include "gesture.h"
#include "platform.h"
#include "protocol.h"
#include "store.h"
#include "text.h"
#include "touch.h"
#include "ui.h"
#include "win_pilot.h"

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
static bool s_built;   // composants graphiques créés
static int16_t s_value;     // dixièmes, dans l'unité du compte
static int16_t s_min, s_max, s_step;

static void default_range(void) {
  if (g_view.unit == UNIT_F) {
    s_min = 410; s_max = 770; s_step = 10;
  } else {
    s_min = 50; s_max = 250; s_step = 5;
  }
}

// Ramène une valeur dans la plage acceptée, sur la grille des pas (TPB-PIL-002).
static int16_t snap(int16_t v) {
  if (v < s_min) {
    v = s_min;
  }
  if (v > s_max) {
    v = s_max;
  }
  return s_min + ((v - s_min + s_step / 2) / s_step) * s_step > s_max
             ? s_max : s_min + ((v - s_min + s_step / 2) / s_step) * s_step;
}

static void change(int steps) {
  s_value = snap(s_value + steps * s_step);
  if (s_built) {
    layer_mark_dirty(s_content);
  }
}

// --- Dessin ----------------------------------------------------------------------------------

static void content_draw(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  const Room *room = &g_view.rooms[s_index];
  char text[24];
  int w = b.size.w;
  graphics_context_set_text_color(ctx, GColorWhite);

  ui_draw_text(ctx, text_get(T_SETPOINT), F_SUB, GRect(0, 0, w, 20), GTextAlignmentCenter);
  text_temp(text, sizeof(text), s_value, g_view.unit);
  ui_draw_text(ctx, text, PBL_DISPLAY_WIDTH >= 200 ? FONT_KEY_BITHAM_42_BOLD : FONT_KEY_GOTHIC_28_BOLD,
               GRect(0, b.size.h * 20 / 100, w, 50), GTextAlignmentCenter);

  if (!(room->flags & FLAG_NO_MEASURE)) {
    char current[16];
    text_temp(current, sizeof(current), room->temp, g_view.unit);
    snprintf(text, sizeof(text), "%s %s", text_get(T_CURRENT), current);
    ui_draw_text(ctx, text, F_NAME, GRect(0, b.size.h * 60 / 100, w, 28), GTextAlignmentCenter);
  }

  // Curseur de 5° à 25° : rempli jusqu'à la valeur choisie, repère blanc à la température actuelle.
  int x0 = PBL_IF_ROUND_ELSE(w / 6, 10), x1 = w - x0, y = b.size.h * PBL_IF_ROUND_ELSE(79, 84) / 100;
  int span = s_max - s_min;
  int xv = x0 + (x1 - x0) * (s_value - s_min) / (span > 0 ? span : 1);
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkGray, GColorBlack));
  graphics_fill_rect(ctx, GRect(x0, y, x1 - x0, 5), 0, GCornerNone);
  graphics_context_set_stroke_color(ctx, GColorWhite);
  graphics_draw_rect(ctx, GRect(x0, y, x1 - x0, 5));
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorOrange, GColorWhite));
  graphics_fill_rect(ctx, GRect(x0, y, xv - x0, 5), 0, GCornerNone);
  if (!(room->flags & FLAG_NO_MEASURE) && room->temp >= s_min && room->temp <= s_max) {
    int xc = x0 + (x1 - x0) * (room->temp - s_min) / (span > 0 ? span : 1);
    graphics_context_set_fill_color(ctx, GColorWhite);
    graphics_fill_rect(ctx, GRect(xc - 1, y - 4, 3, 13), 0, GCornerNone);
  }
#ifndef PBL_ROUND
  // Bornes de la plage ; sur écran rond elles sortiraient du cercle.
  text_temp(text, sizeof(text), s_min, g_view.unit);
  ui_draw_text(ctx, text, F_SUB, GRect(x0 - 4, y + 6, 50, 20), GTextAlignmentLeft);
  text_temp(text, sizeof(text), s_max, g_view.unit);
  ui_draw_text(ctx, text, F_SUB, GRect(x1 - 46, y + 6, 50, 20), GTextAlignmentRight);
#endif
}

static void title_draw(Layer *layer, GContext *ctx) {
  char title[32];
#ifdef PBL_ROUND
  snprintf(title, sizeof(title), "%s", g_view.rooms[s_index].name);
#else
  snprintf(title, sizeof(title), "%s · %s", text_get(T_FORCE_SHORT), g_view.rooms[s_index].name);
#endif
  ui_draw_title(ctx, layer_get_bounds(layer), title, true);
}

// Barre d'actions : « + », « validé », « − ».
static void bar_draw(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  int cx = b.size.w / 2;
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkGray, GColorWhite));
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  graphics_context_set_stroke_color(ctx, PBL_IF_COLOR_ELSE(GColorWhite, GColorBlack));
  graphics_context_set_stroke_width(ctx, 3);
  int top = b.size.h / 6;
  int bottom = b.size.h - top;
  graphics_draw_line(ctx, GPoint(cx - 6, top), GPoint(cx + 6, top));
  graphics_draw_line(ctx, GPoint(cx, top - 6), GPoint(cx, top + 6));
  graphics_draw_line(ctx, GPoint(cx - 6, bottom), GPoint(cx + 6, bottom));
  graphics_context_set_stroke_color(ctx, PBL_IF_COLOR_ELSE(GColorGreen, GColorBlack));
  int mid = b.size.h / 2;
  graphics_draw_line(ctx, GPoint(cx - 7, mid), GPoint(cx - 2, mid + 5));
  graphics_draw_line(ctx, GPoint(cx - 2, mid + 5), GPoint(cx + 7, mid - 6));
}

// --- Commandes ---------------------------------------------------------------------------------

static void on_up(ClickRecognizerRef recognizer, void *context) {
  change(1);
}

static void on_down(ClickRecognizerRef recognizer, void *context) {
  change(-1);
}

static void on_select(ClickRecognizerRef recognizer, void *context) {
  win_pilot_choose_duration(s_index, s_value);
}

static void click_config(void *context) {
  window_single_repeating_click_subscribe(BUTTON_ID_UP, 150, on_up);
  window_single_repeating_click_subscribe(BUTTON_ID_DOWN, 150, on_down);
  window_single_click_subscribe(BUTTON_ID_SELECT, on_select);
}

// --- Tactile ------------------------------------------------------------------------------------

static void touch_step(int direction) {
  change(direction);   // doigt vers le haut : plus chaud
}

static void touch_tap(int16_t x, int16_t y) {
  if (y < TITLE_H) {
    return;
  }
  int content_h = PBL_DISPLAY_HEIGHT - TITLE_H;
  int third = (y - TITLE_H) * 3 / content_h;
  if (BAR_W > 0 && x < PBL_DISPLAY_WIDTH - BAR_W) {
    return;   // rectangulaire : seules les trois zones de la barre d'actions sont tactiles
  }
  if (third == 0) {
    change(1);
  } else if (third == 2) {
    change(-1);
  } else {
    win_pilot_choose_duration(s_index, s_value);
  }
}

static void build(Window *window);
static void unbuild(void);

static void window_appear(Window *window) {
  if (!s_built) {
    build(window);
  }
  // Plage de consigne, et pièces relues pour afficher la température actuelle.
  comms_request_caps(s_index, true);
  touch_start(&(TouchHandlers){ .on_tap = touch_tap, .on_step = touch_step,
                                .step_px = 22, .one_step = false });
}

static void window_disappear(Window *window) {
  touch_stop();
}

static void build(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);
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
  s_built = true;
}

static void unbuild(void) {
  if (!s_built) {
    return;
  }
  if (s_bar) {
    layer_destroy(s_bar);
    s_bar = NULL;
  }
  layer_destroy(s_content);
  layer_destroy(s_title);
  s_built = false;
}

static void window_load(Window *window) {
  window_set_background_color(window, GColorBlack);
  build(window);
  window_set_click_config_provider(window, click_config);
}

static void window_unload(Window *window) {
  unbuild();
  window_destroy(s_window);
  s_window = NULL;
}

void win_setpoint_push(uint8_t room_index) {
  if (s_window || room_index >= g_view.count) {
    return;
  }
  s_index = room_index;
  default_range();
  // La température proposée au départ est la température demandée en ce moment (TPB-PIL-002).
  const Room *room = &g_view.rooms[s_index];
  s_value = snap((room->flags & FLAG_OFF) ? (g_view.unit == UNIT_F ? 680 : 200) : room->setpoint);
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){
    .load = window_load, .unload = window_unload, .appear = window_appear, .disappear = window_disappear });
  window_stack_push(s_window, true);
}

void win_setpoint_close(void) {
  if (s_window) {
    window_stack_remove(s_window, true);
  }
}

void win_setpoint_caps_changed(void) {
  if (!s_window || !g_caps.valid || g_caps.index != s_index || g_caps.step <= 0) {
    return;
  }
  s_min = g_caps.min;
  s_max = g_caps.max;
  s_step = g_caps.step;
  s_value = snap(s_value);
  if (s_built) {
    layer_mark_dirty(s_content);
  }
}
