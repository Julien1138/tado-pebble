#include "ui.h"
#include "protocol.h"
#include "text.h"

#ifdef PBL_COLOR
GColor ui_band_color(uint8_t band) {
  static const GColor colors[4] = {
    { .argb = GColorVividCeruleanARGB8 }, { .argb = GColorCelesteARGB8 },
    { .argb = GColorChromeYellowARGB8 }, { .argb = GColorOrangeARGB8 }
  };
  return colors[band > 3 ? 3 : band];
}
#endif

void ui_draw_text(GContext *ctx, const char *text, const char *font, GRect rect, GTextAlignment align) {
  graphics_draw_text(ctx, text, fonts_get_system_font(font), rect, GTextOverflowModeTrailingEllipsis,
                     align, NULL);
}

void ui_draw_title(GContext *ctx, GRect b, const char *text, bool show_clock) {
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorOrange, GColorBlack));
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  graphics_context_set_text_color(ctx, PBL_IF_COLOR_ELSE(GColorBlack, GColorWhite));
#ifdef PBL_ROUND
  ui_draw_text(ctx, text, FONT_KEY_GOTHIC_18_BOLD, GRect(0, PBL_DISPLAY_WIDTH > 200 ? 6 : 2, b.size.w, 24),
               GTextAlignmentCenter);
#else
  if (show_clock) {
    char clock[10];
    clock_copy_time_string(clock, sizeof(clock));
    ui_draw_text(ctx, text, F_TITLE, GRect(4, 0, b.size.w - 46, b.size.h), GTextAlignmentLeft);
    ui_draw_text(ctx, clock, F_TITLE, GRect(b.size.w - 46, 0, 42, b.size.h), GTextAlignmentRight);
  } else {
    ui_draw_text(ctx, text, F_TITLE, GRect(4, 0, b.size.w - 8, b.size.h), GTextAlignmentLeft);
  }
#endif
}

void ui_mode_line(const Room *room, uint8_t index, bool with_setpoint, char *out, size_t size) {
  char when[16], sp[16], head[28];
  if (room->flags & FLAG_OFFLINE) {
    snprintf(out, size, "%s", text_get(T_OFFLINE));
    return;
  }
  if (!g_detail.valid || g_detail.index != index) {
    out[0] = '\0';
    return;
  }
  sp[0] = '\0';
  if (with_setpoint) {
    if (room->flags & FLAG_OFF) {
      snprintf(sp, sizeof(sp), "%s", text_get(T_OFF_CAP));
    } else {
      text_setpoint(sp, sizeof(sp), room->setpoint, g_view.unit);
    }
  }
  switch (g_detail.mode) {
    case MODE_TIMER:
      text_duration(when, sizeof(when), g_detail.remaining);
      snprintf(head, sizeof(head), "%s%s%s", text_get(T_BOOST), sp[0] ? " " : "", sp);
      snprintf(out, size, "%s · %s %s", head, text_get(T_LEFT), when);
      break;
    case MODE_NEXT_BLOCK:
      text_time(when, sizeof(when), g_detail.end_time);
      snprintf(head, sizeof(head), "%s%s%s", text_get(T_BOOST), sp[0] ? " " : "", sp);
      snprintf(out, size, "%s · %s %s", head, text_get(T_UNTIL), when);
      break;
    case MODE_MANUAL:
      if (sp[0]) {
        snprintf(out, size, "%s · %s", sp, text_get(T_UNTIL_FURTHER));
      } else {
        snprintf(out, size, "%s", text_get(T_UNTIL_FURTHER));
      }
      break;
    default:
      snprintf(head, sizeof(head), "%s%s%s", text_get(T_SCHEDULE), sp[0] ? " " : "", sp);
      if (g_detail.end_time >= 0) {
        text_time(when, sizeof(when), g_detail.end_time);
        snprintf(out, size, "%s · %s", head, when);
      } else {
        snprintf(out, size, "%s", head);
      }
  }
}
