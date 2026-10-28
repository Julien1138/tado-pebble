#pragma once
#include <pebble.h>

// Fenêtre 7 : historique de chauffe (TPB-HIS-001 à 008). Une rangée par pièce, une colonne par heure
// (douze, huit sur la Pebble Time Round), la dernière étant l'heure en cours.
void win_history_push(void);
// Une rangée est arrivée.
void win_history_changed(void);
