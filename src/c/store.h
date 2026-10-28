#pragma once
#include <pebble.h>

// M-03 Magasin : la vue de l'écran courant en mémoire, et la dernière liste des pièces dans le
// stockage persistant (DEC-07). Rien d'autre n'est écrit : ni jeton, ni identifiant Tado.
#define MAX_ROOMS 16

typedef struct {
  char name[21];
  char abbrev[5];
  int16_t temp;
  int16_t setpoint;
  uint8_t power;
  uint8_t flags;
  uint8_t band;
  uint8_t mode;
  uint16_t remaining;
} Room;

typedef struct {
  uint8_t count;
  uint8_t unit;
  uint8_t presence_state;
  uint8_t presence_mode;
  uint8_t link;
  uint8_t indicators;
  time_t obtained;
  Room rooms[MAX_ROOMS];
} View;

extern View g_view;

void store_init(void);
// Réception d'une liste : begin, puis chaque pièce ; commit quand toutes sont arrivées.
void store_begin_rooms(uint8_t count, uint8_t unit);
void store_set_room(uint8_t index, const Room *room);
bool store_rooms_complete(void);
void store_commit_rooms(void);
void store_set_status(uint8_t link, uint8_t indicators, uint8_t presence_mode,
                      uint8_t presence_state, uint16_t age_seconds);
// Âge en secondes de la liste affichée (0 si elle est vide).
int store_age_seconds(void);
