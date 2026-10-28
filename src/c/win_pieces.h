#pragma once
#include <pebble.h>

// Fenêtre 1 : liste des pièces, une ligne par pièce (TPB-PIE-001 à 011).
void win_pieces_push(void);
void win_pieces_reload(void);
void win_pieces_status_changed(void);
