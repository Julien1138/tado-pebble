#pragma once
#include <pebble.h>

// Fenêtres 3 et 5 : Pilotage d'une pièce (TPB-PIL-001 à 007) et choix de la durée d'un forçage.
// La fenêtre 4 (consigne) est dans win_setpoint.
void win_pilot_push(uint8_t room_index);
// Un détail ou une liste de pièces vient d'arriver : le pilotage met ses lignes à jour.
void win_pilot_refresh(void);
// Ferme Pilotage, Consigne et Durée (une commande a réussi).
void win_pilot_close_all(void);
// Choix de la durée d'un forçage à la température donnée (appelé depuis la fenêtre Consigne).
void win_pilot_choose_duration(uint8_t room_index, int16_t temp);
