#pragma once
#include <pebble.h>

// Fenêtre 1 : liste des pièces, une ligne par pièce (TPB-PIE-001 à 011).
void win_pieces_push(void);
void win_pieces_reload(void);
void win_pieces_status_changed(void);
// Sélectionne une pièce (retour du détail, TPB-PIE-011).
void win_pieces_select(uint8_t row);
// La fenêtre de liaison a été quittée sans aboutir.
void win_pieces_link_dismissed(void);
