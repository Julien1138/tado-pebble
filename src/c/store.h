#pragma once
#include <pebble.h>

// M-03 Magasin : la vue de l'écran courant en mémoire, et la dernière liste des pièces dans le
// stockage persistant (DEC-07). Rien d'autre n'est écrit : ni jeton, ni identifiant Tado.
#define MAX_ROOMS 16

typedef struct {
  char name[21];
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

// Détail de la pièce ouverte (MSG-14), valable tant que valid est vrai.
typedef struct {
  bool valid;
  uint8_t index;
  uint8_t mode;
  uint16_t remaining;      // minutes de forçage restantes
  int16_t end_time;        // minutes depuis minuit, DETAIL_NONE si indéfini
  int16_t next_time;       // prochain changement de la programmation
  int16_t next_temp;       // dixièmes, DETAIL_NO_TEMP si éteint
  int16_t humidity;        // %, DETAIL_NONE si pas de capteur
  uint16_t window_minutes;
  int16_t last_temp;       // dernier forçage de la pièce (dixièmes), 0 si aucun
  uint8_t last_duration;   // code de durée (DUR_*), 0 si aucun
} Detail;

// Plage de consigne de la pièce (MSG-20), en dixièmes dans l'unité du compte.
typedef struct {
  bool valid;
  uint8_t index;
  int16_t min;
  int16_t max;
  int16_t step;
} Caps;

// Présence de la maison (MSG-18) : mode en vigueur, état et appareils mobiles suivis.
typedef struct {
  bool valid;
  uint8_t mode;               // PRESENCE_AUTO, PRESENCE_HOME ou PRESENCE_AWAY (imposé)
  uint8_t state;              // PRESENCE_HOME ou PRESENCE_AWAY
  uint8_t devices_home;
  uint8_t devices_tracked;
  bool auto_unavailable;      // Tado a refusé le retour à Auto : il n'est plus offert
} Presence;

// Raccourcis offerts (MSG-19) : bit n-1 du masque pour le raccourci n, et pièces forcées.
typedef struct {
  bool valid;
  uint16_t mask;
  uint8_t forced;
} Shortcuts;

extern View g_view;
extern Detail g_detail;
extern Caps g_caps;
extern Presence g_presence;
extern Shortcuts g_shortcuts;
// Pièces que le dernier raccourci n'a pas modifiées (bit i : i-ième pièce de la liste).
extern uint16_t g_failed_mask;

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
