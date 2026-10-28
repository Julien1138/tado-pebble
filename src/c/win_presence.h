#pragma once
#include <pebble.h>

// Fenêtre 8 : présence de la maison (TPB-PRE-001 à 005). Trois modes à puces : Présent, Absent
// (imposés) et Auto (géolocalisation de Tado) ; la puce pleine marque le mode en vigueur.
void win_presence_push(void);
void win_presence_close(void);
// La présence demandée est arrivée.
void win_presence_changed(void);
