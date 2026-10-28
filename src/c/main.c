#include <pebble.h>
#include "comms.h"
#include "store.h"
#include "text.h"
#include "win_detail.h"
#include "win_link.h"
#include "win_pieces.h"

// M-01 Application : affiche tout de suite la dernière situation connue (TPB-ACT-001), puis la
// remplace quand le téléphone répond.
static void on_rooms(void) {
  win_pieces_reload();
  win_detail_reload();
}

static void on_detail(void) {
  win_detail_changed();
}

static void on_status(void) {
  win_pieces_status_changed();
}

static void on_link_code(const char *code, int seconds, uint8_t state) {
  win_link_update(code, seconds, state);
  if (state == 1) {
    comms_request_rooms(false);
  }
}

int main(void) {
  text_init();
  store_init();
  comms_init(&(CommsHandlers){ .rooms_changed = on_rooms, .detail_changed = on_detail, .status_changed = on_status,
                               .link_code = on_link_code });
  win_pieces_push();
  app_event_loop();
  comms_deinit();
}
