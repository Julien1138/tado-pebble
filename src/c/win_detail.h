#pragma once
#include <pebble.h>

// Fenêtre 2 : détail d'une pièce (TPB-DET-001 à 008). Haut/Bas : pièce précédente/suivante.
void win_detail_push(uint8_t room_index);
// La liste des pièces a changé : le détail se met à jour (ou se ferme si la pièce a disparu).
void win_detail_reload(void);
// Le téléphone a envoyé le détail de la pièce demandée.
void win_detail_changed(void);
