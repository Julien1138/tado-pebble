#include "win_history.h"
#include "comms.h"
#include "gesture.h"
#include "platform.h"
#include "protocol.h"
#include "store.h"
#include "text.h"
#include "touch.h"
#include "ui.h"

#if defined(PBL_ROUND)
  #define ROW_H_HISTORY 18
  #define AXIS_H 16
#elif PBL_DISPLAY_WIDTH >= 200
  #define ROW_H_HISTORY 22
  #define AXIS_H 20
#else
  #define ROW_H_HISTORY 16
  #define AXIS_H 16
#endif

static Window *s_window;
static Layer *s_title;
static Layer *s_grid;
static uint8_t s_first;      // première rangée visible

static int visible_rows(int height) {
  int n = (height - AXIS_H) / ROW_H_HISTORY;
  return n < 1 ? 1 : n;
}

// Niveau 1 à 3 : teintes du thème (marron, orange, ambre) ; en noir et blanc, trois motifs distincts.
static void draw_cell(GContext *ctx, GRect r, int level, bool unknown, bool current) {
  if (unknown) {
    // Inconnue, non nulle (TPB-HIS-008) : case grisée barrée d'une diagonale.
    graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkGray, GColorBlack));
    graphics_fill_rect(ctx, r, 0, GCornerNone);
    graphics_context_set_stroke_color(ctx, GColorLightGray);
    graphics_context_set_stroke_width(ctx, 1);
    graphics_draw_line(ctx, GPoint(r.origin.x, r.origin.y + r.size.h - 1), GPoint(r.origin.x + r.size.w - 1, r.origin.y));
  } else if (level > 0) {
#ifdef PBL_COLOR
    static const GColor SHADES[3] = { { .argb = GColorWindsorTanARGB8 }, { .argb = GColorOrangeARGB8 },
                                      { .argb = GColorChromeYellowARGB8 } };
    graphics_context_set_fill_color(ctx, SHADES[level - 1]);
    graphics_fill_rect(ctx, r, 0, GCornerNone);
#else
    graphics_context_set_fill_color(ctx, GColorWhite);
    if (level == 3) {
      graphics_fill_rect(ctx, r, 0, GCornerNone);
    } else {
      // Motifs : points (faible), damier (moyenne).
      for (int y = 0; y < r.size.h; y++) {
        for (int x = 0; x < r.size.w; x++) {
          bool on = level == 1 ? ((x % 3 == 1) && (y % 3 == 1)) : (((x + y) % 2) == 0);
          if (on) {
            graphics_draw_pixel(ctx, GPoint(r.origin.x + x, r.origin.y + y));
          }
        }
      }
    }
#endif
  }
  graphics_context_set_stroke_color(ctx, current ? GColorWhite : PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite));
  graphics_context_set_stroke_width(ctx, current ? 2 : 1);
  graphics_draw_rect(ctx, r);
}

static void grid_draw(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  int columns = g_history.columns ? g_history.columns : HISTORY_COLUMNS;
  int label_w = PBL_DISPLAY_WIDTH >= 200 ? 40 : 30;
  int margin = PBL_IF_ROUND_ELSE(b.size.w / 8, 3);
  int cell_w = (b.size.w - 2 * margin - label_w) / columns;
  int x0 = margin + label_w;
  int rows = visible_rows(b.size.h);

  graphics_context_set_text_color(ctx, GColorWhite);
  for (int r = 0; r < rows && s_first + r < g_view.count; r++) {
    int index = s_first + r;
    int y = r * ROW_H_HISTORY + 1;
    const HistoryRow *row = &g_history.rows[index];
    // Nom abrégé, distinct d'une pièce à l'autre (TPB-PLT-006) ; avant l'arrivée de la rangée, le début du nom.
    char name[5];
    if (row->received && row->abbrev[0]) {
      snprintf(name, sizeof(name), "%s", row->abbrev);
    } else {
      snprintf(name, sizeof(name), "%.3s", g_view.rooms[index].name);
    }
    ui_draw_text(ctx, name, F_TITLE, GRect(margin, y - 2, label_w, ROW_H_HISTORY), GTextAlignmentLeft);
    for (int c = 0; c < columns; c++) {
      GRect cell = GRect(x0 + c * cell_w, y, cell_w - 1, ROW_H_HISTORY - 3);
      bool unknown = row->received ? ((row->unknown >> c) & 1) : false;
      int level = row->received ? (int)((row->levels >> (2 * c)) & 3) : 0;
      draw_cell(ctx, cell, level, unknown, c == columns - 1);
    }
  }

  // Repères de temps (TPB-HIS-004) : ancienneté de la première colonne, du milieu, et « maintenant ».
  // Les repères suivent la dernière rangée affichée.
  int shown = g_view.count - s_first < rows ? g_view.count - s_first : rows;
  int axis_y = shown * ROW_H_HISTORY + 3;
  char text[12];
  snprintf(text, sizeof(text), "-%d h", columns);
  ui_draw_text(ctx, text, F_SUB, GRect(x0 - 2, axis_y - 2, 44, AXIS_H), GTextAlignmentLeft);
  snprintf(text, sizeof(text), "-%d h", columns / 2);
  ui_draw_text(ctx, text, F_SUB, GRect(x0 + cell_w * (columns / 2) - 22, axis_y - 2, 44, AXIS_H), GTextAlignmentCenter);
  ui_draw_text(ctx, text_get(T_NOW_SHORT), F_SUB, GRect(x0 + cell_w * columns - 46, axis_y - 2, 48, AXIS_H), GTextAlignmentRight);
}

static void title_draw(Layer *layer, GContext *ctx) {
  char title[24];
#ifdef PBL_ROUND
  snprintf(title, sizeof(title), "%s", text_get(T_HISTORY));
#else
  snprintf(title, sizeof(title), "%s · %d h", text_get(T_HISTORY), g_history.columns ? g_history.columns : HISTORY_COLUMNS);
#endif
  ui_draw_title(ctx, layer_get_bounds(layer), title, true);
}

// --- Défilement : boutons et toucher -----------------------------------------------------------

static void scroll(int direction) {
  int rows = visible_rows(layer_get_bounds(s_grid).size.h);
  int max_first = g_view.count > rows ? g_view.count - rows : 0;
  int next = (int)s_first + direction;
  if (next < 0) {
    next = 0;
  }
  if (next > max_first) {
    next = max_first;
  }
  s_first = next;
  layer_mark_dirty(s_grid);
}

static void on_up(ClickRecognizerRef recognizer, void *context) {
  scroll(-1);
}

static void on_down(ClickRecognizerRef recognizer, void *context) {
  scroll(1);
}

static void click_config(void *context) {
  window_single_repeating_click_subscribe(BUTTON_ID_UP, 200, on_up);
  window_single_repeating_click_subscribe(BUTTON_ID_DOWN, 200, on_down);
}

static void touch_step(int direction) {
  scroll(direction);
}

static void window_appear(Window *window) {
  touch_start(&(TouchHandlers){ .on_tap = NULL, .on_step = touch_step, .step_px = ROW_H_HISTORY, .one_step = false });
  // L'historique est rechargé à chaque affichage de l'écran.
  comms_request_history(HISTORY_COLUMNS, true);
}

static void window_disappear(Window *window) {
  touch_stop();
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect b = layer_get_bounds(root);
  window_set_background_color(window, GColorBlack);
  s_title = layer_create(GRect(0, 0, b.size.w, TITLE_H));
  layer_set_update_proc(s_title, title_draw);
  s_grid = layer_create(GRect(0, TITLE_H + 2, b.size.w, b.size.h - TITLE_H - 2));
  layer_set_update_proc(s_grid, grid_draw);
  layer_add_child(root, s_grid);
  layer_add_child(root, s_title);
  window_set_click_config_provider(window, click_config);
  s_first = 0;
}

static void window_unload(Window *window) {
  layer_destroy(s_grid);
  layer_destroy(s_title);
  window_destroy(s_window);
  s_window = NULL;
}

void win_history_push(void) {
  if (s_window) {
    return;
  }
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){
    .load = window_load, .unload = window_unload, .appear = window_appear, .disappear = window_disappear });
  window_stack_push(s_window, true);
}

void win_history_changed(void) {
  if (s_window) {
    layer_mark_dirty(s_grid);
  }
}
