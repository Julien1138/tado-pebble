#include "gesture.h"

static int16_t abs16(int16_t v) {
  return v < 0 ? -v : v;
}

void gesture_init(Gesture *g, int16_t step_px, bool one_step) {
  g->active = false;
  g->moved = false;
  g->stepped = false;
  g->one_step = one_step;
  g->step_px = step_px;
}

void gesture_down(Gesture *g, int16_t x, int16_t y) {
  g->active = true;
  g->moved = false;
  g->stepped = false;
  g->x0 = x;
  g->y0 = y;
  g->anchor_y = y;
}

GestureEvent gesture_move(Gesture *g, int16_t x, int16_t y) {
  if (!g->active) {
    return GESTURE_NONE;
  }
  if (abs16(x - g->x0) > GESTURE_TAP_SLOP || abs16(y - g->y0) > GESTURE_TAP_SLOP) {
    g->moved = true;
  }
  if (g->one_step && g->stepped) {
    return GESTURE_NONE;
  }
  int16_t dy = y - g->anchor_y;
  if (dy <= -g->step_px) {
    g->anchor_y -= g->step_px;
    g->stepped = true;
    return GESTURE_STEP_NEXT;
  }
  if (dy >= g->step_px) {
    g->anchor_y += g->step_px;
    g->stepped = true;
    return GESTURE_STEP_PREV;
  }
  return GESTURE_NONE;
}

GestureEvent gesture_up(Gesture *g, int16_t x, int16_t y) {
  bool tap = g->active && !g->moved && abs16(x - g->x0) <= GESTURE_TAP_SLOP &&
             abs16(y - g->y0) <= GESTURE_TAP_SLOP;
  g->active = false;
  return tap ? GESTURE_TAP : GESTURE_NONE;
}

int gesture_row_rect(int y, int offset_y, int row_h, int count) {
  int content_y = y - offset_y;
  if (content_y < 0 || row_h <= 0) {
    return -1;
  }
  int row = content_y / row_h;
  return row < count ? row : -1;
}

int gesture_row_round(int y, int menu_h, int selected, int count, int sel_h, int other_h) {
  int top = (menu_h - sel_h) / 2;
  int row;
  if (y < top) {
    row = selected - 1 - (top - y - 1) / other_h;
  } else if (y < top + sel_h) {
    row = selected;
  } else {
    row = selected + 1 + (y - top - sel_h) / other_h;
  }
  return row >= 0 && row < count ? row : -1;
}
