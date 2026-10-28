#pragma once
#include <pebble.h>

// M-02 Messagerie : AppMessage avec le pkjs. La montre demande, le téléphone répond ; une
// réponse dont la séquence n'est plus la courante est ignorée.
typedef struct {
  void (*rooms_changed)(void);          // une nouvelle liste est en place
  void (*detail_changed)(void);         // le détail de la pièce demandée est arrivé
  void (*status_changed)(void);         // liaison, présence ou indicateurs ont changé
  void (*link_code)(const char *code, int seconds, uint8_t state);
} CommsHandlers;

void comms_init(const CommsHandlers *handlers);
void comms_deinit(void);
void comms_request_rooms(bool refresh);
void comms_request_detail(uint8_t index);
void comms_request_link(void);
void comms_request_unlink(void);
bool comms_ready(void);
