#include "ui.h"

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
