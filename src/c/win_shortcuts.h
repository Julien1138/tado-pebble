#pragma once
#include <pebble.h>

// Fenêtre 9 : raccourcis de toute la maison (TPB-RAC-001 à 007). Chaque raccourci demande une
// confirmation avant d'agir (TPB-RAC-006).
void win_shortcuts_push(void);
void win_shortcuts_close(void);
// Les raccourcis offerts sont arrivés.
void win_shortcuts_changed(void);
