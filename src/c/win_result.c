#include "win_result.h"
#include "comms.h"
#include "protocol.h"
#include "store.h"
#include "text.h"
#include "ui.h"
#include "win_menu.h"
#include "win_pilot.h"

#define ANSWER_TIMEOUT_MS 12000
#define SHOW_MS 1600

static Window *s_window;
static Layer *s_layer;
static AppTimer *s_timer;
static const char *s_text;
static bool s_waiting;
static bool s_success;
static char s_partial[96];

static void close_window(void) {
  if (s_window) {
    window_stack_remove(s_window, true);
  }
}

static void on_timer(void *data) {
  s_timer = NULL;
  if (s_waiting) {
    // Le téléphone n'a pas répondu : la commande n'est pas présumée réussie.
    win_result_done(RES_OFFLINE);
    return;
  }
  close_window();
}

static void arm(uint32_t ms) {
  if (s_timer) {
    app_timer_cancel(s_timer);
  }
  s_timer = app_timer_register(ms, on_timer, NULL);
}

static void layer_draw(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  graphics_context_set_text_color(ctx, s_waiting ? GColorWhite
                                  : (s_success ? PBL_IF_COLOR_ELSE(GColorGreen, GColorWhite)
                                               : PBL_IF_COLOR_ELSE(GColorChromeYellow, GColorWhite)));
  // Le texte d'un résultat partiel peut tenir sur plusieurs lignes : police plus petite et zone plus haute.
  bool long_text = strlen(s_text) > 18;
  ui_draw_text(ctx, s_text, long_text ? F_NAME : F_TEMP,
               long_text ? GRect(8, b.size.h / 2 - 50, b.size.w - 16, 100) : GRect(8, b.size.h / 2 - 28, b.size.w - 16, 60),
               GTextAlignmentCenter);
}

static void on_button(ClickRecognizerRef recognizer, void *context) {
  // Pendant l'attente, seul Retour ferme ; ensuite tout bouton ferme.
  if (!s_waiting) {
    close_window();
  }
}

static void click_config(void *context) {
  window_single_click_subscribe(BUTTON_ID_UP, on_button);
  window_single_click_subscribe(BUTTON_ID_SELECT, on_button);
  window_single_click_subscribe(BUTTON_ID_DOWN, on_button);
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_layer = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_layer, layer_draw);
  layer_add_child(root, s_layer);
  window_set_click_config_provider(window, click_config);
}

static void window_unload(Window *window) {
  if (s_timer) {
    app_timer_cancel(s_timer);
    s_timer = NULL;
  }
  s_waiting = false;
  layer_destroy(s_layer);
  window_destroy(s_window);
  s_window = NULL;
}

static void show(const char *text, bool waiting) {
  s_text = text;
  s_waiting = waiting;
  if (!s_window) {
    s_window = window_create();
    window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
    window_stack_push(s_window, false);
  } else {
    layer_mark_dirty(s_layer);
  }
}

void win_result_done(uint8_t result) {
  if (!s_window) {
    return;   // abandonnée par l'utilisateur : l'accusé n'intéresse plus personne
  }
  s_success = result == RES_OK;
  switch (result) {
    case RES_OK: show(text_get(T_RES_OK), false); break;
    case RES_REFUSED: show(text_get(T_RES_REFUSED), false); break;
    case RES_OFFLINE: show(text_get(T_DISCONNECTED), false); break;
    case RES_AUTO_UNAVAILABLE: show(text_get(T_AUTO_UNAVAILABLE), false); break;
    case RES_PARTIAL: {
      // Les pièces que le raccourci n'a pas modifiées, nommées (TPB-RAC-007).
      size_t used = snprintf(s_partial, sizeof(s_partial), "%s", text_get(T_RES_PARTIAL));
      for (uint8_t i = 0; i < g_view.count && used < sizeof(s_partial) - 2; i++) {
        if (g_failed_mask & (1 << i)) {
          used += snprintf(s_partial + used, sizeof(s_partial) - used, "%s%s", used > strlen(text_get(T_RES_PARTIAL)) ? ", " : " ",
                           g_view.rooms[i].name);
        }
      }
      show(s_partial, false);
      break;
    }
    default: show(text_get(T_RES_FAILED), false); break;
  }
  if (s_success) {
    win_pilot_close_all();
    win_menu_close_all();
  }
  arm(result == RES_PARTIAL ? 5000 : SHOW_MS);
}

void win_result_send(uint8_t command, uint8_t room_index, int16_t temp, uint8_t duration) {
  s_success = false;
  show(text_get(T_SENDING), true);
  if ((g_view.indicators & IND_OFFLINE) || !comms_send_command(command, room_index, temp, duration)) {
    s_waiting = true;
    win_result_done(RES_OFFLINE);
    return;
  }
  arm(ANSWER_TIMEOUT_MS);
}
