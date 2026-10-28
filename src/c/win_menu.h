#pragma once
#include <pebble.h>

// Fenêtre 6 : menu général (TPB-NAV-003), ouvert par un appui long sur Sélection depuis la liste des
// pièces. Donne accès à l'historique, à la présence et aux raccourcis.
void win_menu_push(void);
// Ferme le menu et les écrans ouverts depuis lui (une commande a réussi).
void win_menu_close_all(void);
