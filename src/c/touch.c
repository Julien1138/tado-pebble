#include "touch.h"
#include "gesture.h"

#ifdef _PBL_API_EXISTS_touch_service_subscribe

static TouchHandlers s_handlers;
static Gesture s_gesture;
static bool s_subscribed;

static void on_touch(const TouchEvent *event, void *context) {
  if (event->non_navigational) {
    return;
  }
  GestureEvent result = GESTURE_NONE;
  switch (event->type) {
    case TouchEvent_Touchdown:
      gesture_down(&s_gesture, event->x, event->y);
      break;
    case TouchEvent_PositionUpdate:
      result = gesture_move(&s_gesture, event->x, event->y);
      break;
    case TouchEvent_Liftoff:
      result = gesture_up(&s_gesture, event->x, event->y);
      break;
  }
  if (result == GESTURE_TAP && s_handlers.on_tap) {
    s_handlers.on_tap(event->x, event->y);
  } else if (result == GESTURE_STEP_NEXT && s_handlers.on_step) {
    s_handlers.on_step(1);
  } else if (result == GESTURE_STEP_PREV && s_handlers.on_step) {
    s_handlers.on_step(-1);
  }
}

void touch_start(const TouchHandlers *handlers) {
  if (!touch_service_is_enabled()) {
    return;
  }
  s_handlers = *handlers;
  gesture_init(&s_gesture, handlers->step_px, handlers->one_step);
  if (!s_subscribed) {
    touch_service_subscribe(on_touch, NULL);
    s_subscribed = true;
  }
}

void touch_stop(void) {
  if (s_subscribed) {
    touch_service_unsubscribe();
    s_subscribed = false;
  }
}

#else

void touch_start(const TouchHandlers *handlers) {}
void touch_stop(void) {}

#endif
