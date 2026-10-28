#pragma once
#include <stdbool.h>
#include <stdint.h>

// Reconnaissance de gestes tactiles, sans dépendance au SDK pour pouvoir être testée sur
// l'ordinateur (test/gesture.test.js). Le toucher est un complément des boutons (TPB-NAV-007).
#define GESTURE_TAP_SLOP 12

typedef enum { GESTURE_NONE, GESTURE_STEP_NEXT, GESTURE_STEP_PREV, GESTURE_TAP } GestureEvent;

typedef struct {
  bool active;
  bool moved;
  bool stepped;
  bool one_step;
  int16_t step_px;
  int16_t x0, y0;
  int16_t anchor_y;
} Gesture;

// step_px : distance de glissement qui vaut un pas. one_step : un seul pas par geste.
void gesture_init(Gesture *g, int16_t step_px, bool one_step);
void gesture_down(Gesture *g, int16_t x, int16_t y);
// Glisser le doigt vers le haut donne GESTURE_STEP_NEXT (le contenu monte, on va vers la suite).
GestureEvent gesture_move(Gesture *g, int16_t x, int16_t y);
// Fin du geste : GESTURE_TAP si le doigt n'a pas bougé.
GestureEvent gesture_up(Gesture *g, int16_t x, int16_t y);

// Ligne touchée dans une liste de lignes de même hauteur ; offset_y : décalage du contenu
// (négatif quand la liste a défilé). -1 si hors liste.
int gesture_row_rect(int y, int offset_y, int row_h, int count);
// Ligne touchée dans une liste à sélection centrée : la ligne sélectionnée (sel_h) occupe le
// centre de la hauteur menu_h, les autres ont other_h. -1 si hors liste.
int gesture_row_round(int y, int menu_h, int selected, int count, int sel_h, int other_h);
