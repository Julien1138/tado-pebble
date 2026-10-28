#pragma once
#include <pebble.h>

// Fenêtre 4 : choix de la température à imposer (TPB-PIL-001, PIL-002, PIL-008). Haut/Bas : un pas
// de 0,5 °C (1 °F), Sélection : choisir la durée, Retour : abandonner sans effet.
void win_setpoint_push(uint8_t room_index);
void win_setpoint_close(void);
// La plage de consigne de la pièce est arrivée.
void win_setpoint_caps_changed(void);
