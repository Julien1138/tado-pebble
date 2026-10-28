#pragma once
#include <pebble.h>

// Résultat d'une commande (TPB-PIL-009, PIL-010, PIL-011) : « Envoi… » pendant l'attente, puis
// « Pris en compte », « Refusé », « Échec » ou « Hors connexion ». Aucun succès n'est présumé.
// Envoie la commande ; sans connexion elle est refusée sur-le-champ, jamais mise en attente.
void win_result_send(uint8_t command, uint8_t room_index, int16_t temp, uint8_t duration);
// Accusé du téléphone.
void win_result_done(uint8_t result);
