#include "win_link.h"
#include "comms.h"
#include "platform.h"
#include "protocol.h"
#include "text.h"

static Window *s_window;
static TextLayer *s_title;
static TextLayer *s_code;
static TextLayer *s_help;
static TextLayer *s_wait;
static char s_code_text[8];
static char s_wait_text[32];
static int s_seconds;
static uint8_t s_state;
static bool s_lost;

static void refresh_texts(void) {
  if (!s_window) {
    return;
  }
  text_layer_set_text(s_code, s_code_text);
  if (s_state == CODE_EXPIRED) {
    text_layer_set_text(s_wait, text_get(T_LINK_EXPIRED));
  } else if (s_state == CODE_DENIED) {
    text_layer_set_text(s_wait, text_get(T_LINK_DENIED));
  } else if (s_code_text[0] == '\0') {
    text_layer_set_text(s_wait, text_get(T_LOADING));
  } else {
    snprintf(s_wait_text, sizeof(s_wait_text), "%s %d:%02d", text_get(T_LINK_WAIT),
             s_seconds / 60, s_seconds % 60);
    text_layer_set_text(s_wait, s_wait_text);
  }
  text_layer_set_text(s_title, s_lost ? text_get(T_LINK_LOST) : text_get(T_LINK_TITLE));
}

static void on_tick(struct tm *tick_time, TimeUnits units) {
  if (s_state == CODE_WAITING && s_seconds > 0) {
    s_seconds--;
    refresh_texts();
  }
}

static TextLayer *make_layer(Layer *root, GRect frame, const char *font, GTextAlignment align,
                             GColor fg, GColor bg) {
  TextLayer *layer = text_layer_create(frame);
  text_layer_set_font(layer, fonts_get_system_font(font));
  text_layer_set_text_alignment(layer, align);
  text_layer_set_text_color(layer, fg);
  text_layer_set_background_color(layer, bg);
  layer_add_child(root, text_layer_get_layer(layer));
  return layer;
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);
  GColor title_bg = PBL_IF_COLOR_ELSE(GColorOrange, GColorBlack);
  GColor title_fg = PBL_IF_COLOR_ELSE(GColorBlack, GColorWhite);
  GTextAlignment align = PBL_IF_ROUND_ELSE(GTextAlignmentCenter, GTextAlignmentLeft);
  int pad = PBL_IF_ROUND_ELSE(b.size.w / 8, 6);
  int w = b.size.w - 2 * pad;

  window_set_background_color(window, GColorBlack);
  s_title = make_layer(root, GRect(PBL_IF_ROUND_ELSE(0, 0), 0, b.size.w, TITLE_H),
                       FONT_KEY_GOTHIC_18_BOLD, PBL_IF_ROUND_ELSE(GTextAlignmentCenter, GTextAlignmentLeft),
                       title_fg, title_bg);
  s_code = make_layer(root, GRect(pad, TITLE_H + 6, w, 36), FONT_KEY_GOTHIC_28_BOLD, align,
                      PBL_IF_COLOR_ELSE(GColorChromeYellow, GColorWhite), GColorClear);
  s_help = make_layer(root, GRect(pad, TITLE_H + 42, w, 72), FONT_KEY_GOTHIC_14, align,
                      GColorWhite, GColorClear);
  s_wait = make_layer(root, GRect(pad, TITLE_H + 114, w, 26), FONT_KEY_GOTHIC_18_BOLD, align,
                      GColorWhite, GColorClear);
  text_layer_set_text(s_help, text_get(T_LINK_HELP));
  tick_timer_service_subscribe(SECOND_UNIT, on_tick);
  refresh_texts();
}

static void window_unload(Window *window) {
  tick_timer_service_unsubscribe();
  text_layer_destroy(s_title);
  text_layer_destroy(s_code);
  text_layer_destroy(s_help);
  text_layer_destroy(s_wait);
  window_destroy(s_window);
  s_window = NULL;
}

void win_link_push(void) {
  if (s_window) {
    return;
  }
  s_code_text[0] = '\0';
  s_state = CODE_WAITING;
  s_seconds = 0;
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
  window_stack_push(s_window, true);
  comms_request_link();
}

bool win_link_is_open(void) {
  return s_window != NULL;
}

void win_link_update(const char *code, int seconds, uint8_t state) {
  if (state == CODE_VALID) {
    if (s_window) {
      window_stack_remove(s_window, true);
    }
    return;
  }
  if (code[0]) {
    strncpy(s_code_text, code, sizeof(s_code_text) - 1);
  }
  s_seconds = seconds ? seconds : s_seconds;
  s_state = state;
  refresh_texts();
}

void win_link_set_lost(bool lost) {
  s_lost = lost;
}
