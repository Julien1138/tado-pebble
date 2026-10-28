#pragma once
#include <pebble.h>

// Fenêtre 12 : liaison au compte Tado. Affiche le code à saisir et le temps restant.
void win_link_push(void);
bool win_link_is_open(void);
// Le téléphone a envoyé le code (ou son nouvel état).
void win_link_update(const char *code, int seconds, uint8_t state);
void win_link_set_lost(bool lost);
