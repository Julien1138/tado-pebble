#pragma once
#include <pebble.h>

// Tactile (TPB-NAV-007) : complément facultatif des boutons, sur les montres qui ont un écran
// tactile. Sans écran tactile, ces fonctions ne font rien et les boutons suffisent (TPB-NAV-006).
typedef struct {
  void (*on_tap)(int16_t x, int16_t y);   // coordonnées d'écran
  void (*on_step)(int direction);         // +1 : suivant (doigt vers le haut), -1 : précédent
  int16_t step_px;                        // glissement qui vaut un pas
  bool one_step;                          // un seul pas par geste
} TouchHandlers;

// À appeler quand la fenêtre apparaît ; touch_stop quand elle disparaît.
void touch_start(const TouchHandlers *handlers);
void touch_stop(void);
