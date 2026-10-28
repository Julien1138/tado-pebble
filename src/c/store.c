#include "store.h"
#include "protocol.h"

#define STORE_VERSION 1
#define KEY_HEADER 1
#define KEY_ROOM_BASE 100

typedef struct {
  uint8_t version;
  uint8_t count;
  uint8_t unit;
  uint8_t presence_state;
  uint8_t presence_mode;
  time_t obtained;
} Header;

View g_view;
static Room s_staging[MAX_ROOMS];
static uint8_t s_staging_count;
static uint8_t s_staging_unit;
static uint8_t s_staging_received;
static uint16_t s_pending_age;

void store_init(void) {
  memset(&g_view, 0, sizeof(g_view));
  g_view.link = LINK_ACTIVE;
  g_view.presence_state = PRESENCE_HOME;
  Header header;
  if (persist_read_data(KEY_HEADER, &header, sizeof(header)) != (int)sizeof(header) ||
      header.version != STORE_VERSION || header.count > MAX_ROOMS) {
    return;
  }
  for (uint8_t i = 0; i < header.count; i++) {
    if (persist_read_data(KEY_ROOM_BASE + i, &g_view.rooms[i], sizeof(Room)) != (int)sizeof(Room)) {
      memset(&g_view, 0, sizeof(g_view));
      g_view.link = LINK_ACTIVE;
      return;
    }
  }
  g_view.count = header.count;
  g_view.unit = header.unit;
  g_view.presence_state = header.presence_state;
  g_view.presence_mode = header.presence_mode;
  g_view.obtained = header.obtained;
}

void store_begin_rooms(uint8_t count, uint8_t unit) {
  s_staging_count = count > MAX_ROOMS ? MAX_ROOMS : count;
  s_staging_unit = unit;
  s_staging_received = 0;
}

void store_set_room(uint8_t index, const Room *room) {
  if (index < s_staging_count) {
    s_staging[index] = *room;
    s_staging_received++;
  }
}

bool store_rooms_complete(void) {
  return s_staging_received >= s_staging_count;
}

void store_commit_rooms(void) {
  memcpy(g_view.rooms, s_staging, sizeof(Room) * s_staging_count);
  g_view.count = s_staging_count;
  g_view.unit = s_staging_unit;
  g_view.obtained = time(NULL) - s_pending_age;
  Header header = {
    .version = STORE_VERSION, .count = g_view.count, .unit = g_view.unit,
    .presence_state = g_view.presence_state, .presence_mode = g_view.presence_mode,
    .obtained = g_view.obtained
  };
  persist_write_data(KEY_HEADER, &header, sizeof(header));
  for (uint8_t i = 0; i < g_view.count; i++) {
    persist_write_data(KEY_ROOM_BASE + i, &g_view.rooms[i], sizeof(Room));
  }
}

void store_set_status(uint8_t link, uint8_t indicators, uint8_t presence_mode,
                      uint8_t presence_state, uint16_t age_seconds) {
  g_view.link = link;
  g_view.indicators = indicators;
  g_view.presence_mode = presence_mode;
  g_view.presence_state = presence_state;
  s_pending_age = age_seconds;
}

int store_age_seconds(void) {
  if (g_view.count == 0 || g_view.obtained == 0) {
    return 0;
  }
  int age = (int)(time(NULL) - g_view.obtained);
  return age < 0 ? 0 : age;
}
