#pragma once
#include <pebble.h>

// Éléments de dessin communs aux fenêtres : polices, couleurs de tranche, titre, texte.

// La flèche n'existe pas dans les polices des montres noir et blanc de première génération.
#ifdef PBL_COLOR
  #define ARROW "→ "
#else
  #define ARROW "> "
#endif

#if PBL_DISPLAY_WIDTH >= 200
  #define F_NAME FONT_KEY_GOTHIC_24_BOLD
  #define F_SUB FONT_KEY_GOTHIC_18
  #define F_TEMP FONT_KEY_GOTHIC_28_BOLD
  #define F_TITLE FONT_KEY_GOTHIC_18_BOLD
#else
  #define F_NAME FONT_KEY_GOTHIC_18_BOLD
  #define F_SUB FONT_KEY_GOTHIC_14
  #define F_TEMP FONT_KEY_GOTHIC_24_BOLD
  #define F_TITLE FONT_KEY_GOTHIC_14_BOLD
#endif

#ifdef PBL_COLOR
GColor ui_band_color(uint8_t band);
#endif
void ui_draw_text(GContext *ctx, const char *text, const char *font, GRect rect, GTextAlignment align);
// Titre : fond orange (bandeau noir en noir et blanc). show_clock : heure à droite (écrans rectangulaires).
void ui_draw_title(GContext *ctx, GRect bounds, const char *text, bool show_clock);
