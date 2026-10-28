#pragma once
#include <pebble.h>

// M-02 Messagerie : AppMessage avec le pkjs. La montre demande, le téléphone répond ; une
// réponse dont la séquence n'est plus la courante est ignorée.
typedef struct {
  void (*rooms_changed)(void);          // une nouvelle liste est en place
  void (*detail_changed)(void);         // le détail de la pièce demandée est arrivé
  void (*caps_changed)(void);           // la plage de consigne de la pièce demandée est arrivée
  void (*status_changed)(void);         // liaison, présence ou indicateurs ont changé
  void (*command_result)(uint8_t result);  // accusé de la dernière commande (RES_*)
  void (*link_code)(const char *code, int seconds, uint8_t state);
} CommsHandlers;

void comms_init(const CommsHandlers *handlers);
void comms_deinit(void);
void comms_request_rooms(bool refresh);
// refresh : le téléphone relit d'abord les pièces chez Tado et les renvoie avec la réponse
// (rechargement à l'affichage d'un écran) ; sinon il répond depuis ses données.
void comms_request_detail(uint8_t index, bool refresh);
void comms_request_caps(uint8_t index, bool refresh);
// Commande sur une pièce : CMD_FORCE (température en dixièmes, durée DUR_*), CMD_SCHEDULE, CMD_OFF.
// Renvoie faux si le téléphone n'est pas prêt : rien n'est mis en attente (TPB-PIL-011).
bool comms_send_command(uint8_t command, uint8_t index, int16_t temp, uint8_t duration);
void comms_request_link(void);
void comms_request_unlink(void);
bool comms_ready(void);
