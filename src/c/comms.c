#include "comms.h"
#include "protocol.h"
#include "store.h"
#include "text.h"

#define INBOX_SIZE 256
#define OUTBOX_SIZE 64

static CommsHandlers s_handlers;
static uint32_t s_seq;
static bool s_ready;

// Les entiers de PebbleKit JS arrivent sur 1, 2 ou 4 octets selon leur valeur.
static int32_t int_of(DictionaryIterator *iter, uint32_t key, int32_t fallback) {
  Tuple *t = dict_find(iter, key);
  if (!t) {
    return fallback;
  }
  switch (t->length) {
    case 1: return t->type == TUPLE_INT ? t->value->int8 : t->value->uint8;
    case 2: return t->type == TUPLE_INT ? t->value->int16 : t->value->uint16;
    default: return t->value->int32;
  }
}

static void copy_string(char *out, size_t size, DictionaryIterator *iter, uint32_t key) {
  Tuple *t = dict_find(iter, key);
  strncpy(out, t ? t->value->cstring : "", size - 1);
  out[size - 1] = '\0';
}

// File d'envoi : AppMessage n'accepte qu'un message en vol, le suivant part à l'accusé.
typedef struct {
  int32_t type;
  int32_t arg;
  bool refresh;
  uint8_t index;
} Request;

#define QUEUE_SIZE 6
static Request s_queue[QUEUE_SIZE];
static uint8_t s_queue_len;
static bool s_in_flight;

static void send_next(void) {
  if (s_in_flight || s_queue_len == 0) {
    return;
  }
  Request req = s_queue[0];
  memmove(&s_queue[0], &s_queue[1], sizeof(Request) * (--s_queue_len));
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) != APP_MSG_OK) {
    return;
  }
  dict_write_int32(iter, MESSAGE_KEY_MsgType, req.type);
  if (req.type == MSG_HELLO) {
    dict_write_int32(iter, MESSAGE_KEY_Lang, req.arg);
  } else {
    dict_write_int32(iter, MESSAGE_KEY_Seq, req.arg);
    if (req.type == MSG_GET) {
      dict_write_int32(iter, MESSAGE_KEY_Object, req.index == 0xFF ? OBJ_ROOMS : OBJ_DETAIL);
      dict_write_int32(iter, MESSAGE_KEY_Refresh, req.refresh ? 1 : 0);
      if (req.index != 0xFF) {
        dict_write_int32(iter, MESSAGE_KEY_Index, req.index);
      }
    } else {
      dict_write_int32(iter, MESSAGE_KEY_Command, req.refresh ? CMD_UNLINK : CMD_LINK);
    }
  }
  s_in_flight = true;
  app_message_outbox_send();
}

static void enqueue(int32_t type, int32_t arg, bool flag, uint8_t index) {
  if (s_queue_len < QUEUE_SIZE) {
    s_queue[s_queue_len++] = (Request){ .type = type, .arg = arg, .refresh = flag, .index = index };
  }
  send_next();
}

static void on_outbox_done(DictionaryIterator *iter, void *context) {
  s_in_flight = false;
  send_next();
}

static void on_outbox_failed(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  s_in_flight = false;
  send_next();
}

static void on_inbox(DictionaryIterator *iter, void *context) {
  int32_t type = int_of(iter, MESSAGE_KEY_MsgType, 0);
  if (type == MSG_READY) {
    s_ready = true;
    enqueue(MSG_HELLO, text_is_french() ? 1 : 0, false, 0xFF);
    comms_request_rooms(false);
    return;
  }
  if ((uint32_t)int_of(iter, MESSAGE_KEY_Seq, 0) != s_seq) {
    return;
  }
  switch (type) {
    case MSG_STATUS:
      store_set_status(int_of(iter, MESSAGE_KEY_Link, LINK_ACTIVE),
                       int_of(iter, MESSAGE_KEY_Indicators, 0),
                       int_of(iter, MESSAGE_KEY_PresenceMode, PRESENCE_AUTO),
                       int_of(iter, MESSAGE_KEY_PresenceState, PRESENCE_HOME),
                       int_of(iter, MESSAGE_KEY_Age, 0));
      s_handlers.status_changed();
      break;
    case MSG_ROOMS_HEAD:
      store_begin_rooms(int_of(iter, MESSAGE_KEY_Count, 0), int_of(iter, MESSAGE_KEY_Unit, UNIT_C));
      if (store_rooms_complete()) {
        store_commit_rooms();
        s_handlers.rooms_changed();
      }
      break;
    case MSG_ROOM: {
      Room room;
      memset(&room, 0, sizeof(room));
      copy_string(room.name, sizeof(room.name), iter, MESSAGE_KEY_Name);
      copy_string(room.abbrev, sizeof(room.abbrev), iter, MESSAGE_KEY_Abbrev);
      room.temp = int_of(iter, MESSAGE_KEY_Temp, 0);
      room.setpoint = int_of(iter, MESSAGE_KEY_Setpoint, 0);
      room.power = int_of(iter, MESSAGE_KEY_Power, 0);
      room.band = int_of(iter, MESSAGE_KEY_Band, 0);
      room.flags = int_of(iter, MESSAGE_KEY_Flags, 0);
      room.mode = int_of(iter, MESSAGE_KEY_Mode, 0);
      room.remaining = int_of(iter, MESSAGE_KEY_Remaining, 0);
      store_set_room(int_of(iter, MESSAGE_KEY_Index, 0), &room);
      if (store_rooms_complete()) {
        store_commit_rooms();
        s_handlers.rooms_changed();
      }
      break;
    }
    case MSG_DETAIL:
      g_detail.valid = true;
      g_detail.index = int_of(iter, MESSAGE_KEY_Index, 0);
      g_detail.mode = int_of(iter, MESSAGE_KEY_Mode, MODE_SCHEDULE);
      g_detail.remaining = int_of(iter, MESSAGE_KEY_Remaining, 0);
      g_detail.end_time = int_of(iter, MESSAGE_KEY_EndTime, DETAIL_NONE);
      g_detail.next_time = int_of(iter, MESSAGE_KEY_NextTime, DETAIL_NONE);
      g_detail.next_temp = int_of(iter, MESSAGE_KEY_NextTemp, DETAIL_NO_TEMP);
      g_detail.humidity = int_of(iter, MESSAGE_KEY_Humidity, DETAIL_NONE);
      g_detail.window_minutes = int_of(iter, MESSAGE_KEY_WindowMin, 0);
      s_handlers.detail_changed();
      break;
    case MSG_LINK_CODE: {
      char code[8];
      copy_string(code, sizeof(code), iter, MESSAGE_KEY_LinkCode);
      s_handlers.link_code(code, int_of(iter, MESSAGE_KEY_LinkSeconds, 0),
                           int_of(iter, MESSAGE_KEY_LinkState, CODE_WAITING));
      break;
    }
  }
}

void comms_init(const CommsHandlers *handlers) {
  s_handlers = *handlers;
  app_message_register_inbox_received(on_inbox);
  app_message_register_outbox_sent(on_outbox_done);
  app_message_register_outbox_failed(on_outbox_failed);
  app_message_open(INBOX_SIZE, OUTBOX_SIZE);
}

void comms_deinit(void) {
  app_message_deregister_callbacks();
}

bool comms_ready(void) {
  return s_ready;
}

void comms_request_rooms(bool refresh) {
  if (s_ready) {
    enqueue(MSG_GET, ++s_seq, refresh, 0xFF);
  }
}

void comms_request_detail(uint8_t index) {
  g_detail.valid = false;
  if (s_ready) {
    enqueue(MSG_GET, ++s_seq, false, index);
  }
}

void comms_request_link(void) {
  if (s_ready) {
    enqueue(MSG_DO, ++s_seq, false, 0xFF);
  }
}

void comms_request_unlink(void) {
  if (s_ready) {
    enqueue(MSG_DO, ++s_seq, true, 0xFF);
  }
}
