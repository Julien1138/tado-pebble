#include <assert.h>
#include <stdio.h>
#include "gesture.h"

int main(void) {
  Gesture g;

  // Toucher sans bouger : tap.
  gesture_init(&g, 40, false);
  gesture_down(&g, 50, 100);
  assert(gesture_move(&g, 52, 103) == GESTURE_NONE);
  assert(gesture_up(&g, 52, 103) == GESTURE_TAP);

  // Glisser vers le haut de deux pas : deux pas « suivant », puis pas de tap.
  gesture_init(&g, 40, false);
  gesture_down(&g, 50, 200);
  assert(gesture_move(&g, 50, 170) == GESTURE_NONE);
  assert(gesture_move(&g, 50, 158) == GESTURE_STEP_NEXT);
  assert(gesture_move(&g, 50, 130) == GESTURE_NONE);
  assert(gesture_move(&g, 50, 118) == GESTURE_STEP_NEXT);
  assert(gesture_up(&g, 50, 118) == GESTURE_NONE);

  // Glisser vers le bas : pas « précédent ».
  gesture_init(&g, 40, false);
  gesture_down(&g, 50, 100);
  assert(gesture_move(&g, 50, 142) == GESTURE_STEP_PREV);

  // Un seul pas par geste.
  gesture_init(&g, 30, true);
  gesture_down(&g, 50, 200);
  assert(gesture_move(&g, 50, 160) == GESTURE_STEP_NEXT);
  assert(gesture_move(&g, 50, 100) == GESTURE_NONE);
  assert(gesture_up(&g, 50, 100) == GESTURE_NONE);

  // Un nouveau geste repart de zéro.
  gesture_down(&g, 50, 200);
  assert(gesture_move(&g, 50, 160) == GESTURE_STEP_NEXT);

  // Petit mouvement : ni pas ni tap perdu ; un glissement léger qui revient reste un non-tap.
  gesture_init(&g, 40, false);
  gesture_down(&g, 50, 100);
  assert(gesture_move(&g, 50, 125) == GESTURE_NONE);
  assert(gesture_move(&g, 50, 100) == GESTURE_NONE);
  assert(gesture_up(&g, 50, 100) == GESTURE_NONE);

  // Mouvement sans toucher préalable.
  gesture_init(&g, 40, false);
  assert(gesture_move(&g, 0, 0) == GESTURE_NONE);
  assert(gesture_up(&g, 0, 0) == GESTURE_NONE);

  // Lignes rectangulaires : hauteur 38, liste non défilée puis défilée de 60 px.
  assert(gesture_row_rect(0, 0, 38, 6) == 0);
  assert(gesture_row_rect(37, 0, 38, 6) == 0);
  assert(gesture_row_rect(38, 0, 38, 6) == 1);
  assert(gesture_row_rect(100, -60, 38, 6) == 4);
  assert(gesture_row_rect(500, 0, 38, 6) == -1);
  assert(gesture_row_rect(-5, 0, 38, 6) == -1);

  // Lignes rondes : menu 150 px, sélectionnée 76 px au centre (37 à 113), autres 38 px.
  assert(gesture_row_round(75, 150, 2, 6, 76, 38) == 2);
  assert(gesture_row_round(36, 150, 2, 6, 76, 38) == 1);
  assert(gesture_row_round(0, 150, 2, 6, 76, 38) == 1);
  assert(gesture_row_round(114, 150, 2, 6, 76, 38) == 3);
  assert(gesture_row_round(149, 150, 2, 6, 76, 38) == 3);
  assert(gesture_row_round(149, 150, 2, 4, 76, 38) == 3);
  assert(gesture_row_round(149, 150, 3, 4, 76, 38) == -1);
  assert(gesture_row_round(5, 150, 0, 6, 76, 38) == -1);
  assert(gesture_row_round(145, 150, 5, 6, 76, 38) == -1);

  puts("ok");
  return 0;
}
