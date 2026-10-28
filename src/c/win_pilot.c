#include "win_pilot.h"
#include "comms.h"
#include "protocol.h"
#include "store.h"
#include "text.h"
#include "ui.h"
#include "win_actions.h"
#include "win_result.h"
#include "win_setpoint.h"

enum { ACT_FORCE = 1, ACT_REPLAY, ACT_SCHEDULE, ACT_OFF };

static ActionList *s_pilot;
static ActionList *s_duration;
static uint8_t s_index;
static int16_t s_temp;      // température choisie, en dixièmes

static const TextId DURATION_TEXT[] = { 0, T_DUR_30, T_DUR_60, T_DUR_120, T_DUR_NEXT, T_DUR_MANUAL };

static void build_pilot(void) {
  const Room *room = &g_view.rooms[s_index];
  ActionItem items[ACTION_MAX];
  uint8_t n = 0;
  char header[48], temp[12];

  snprintf(items[n].label, sizeof(items[n].label), "%s", text_get(T_FORCE_TEMP));
  items[n++].id = ACT_FORCE;
  // Le dernier forçage de la pièce, applicable en un seul geste (TPB-PIL-004).
  if (g_detail.valid && g_detail.index == s_index && g_detail.last_duration >= DUR_30 &&
      g_detail.last_duration <= DUR_MANUAL) {
    text_setpoint(temp, sizeof(temp), g_detail.last_temp, g_view.unit);
    if (g_detail.last_duration <= DUR_120) {
      snprintf(items[n].label, sizeof(items[n].label), "%s %s %s", temp, text_get(T_FOR),
               text_get(DURATION_TEXT[g_detail.last_duration]));
    } else {
      snprintf(items[n].label, sizeof(items[n].label), "%s · %s", temp,
               text_get(DURATION_TEXT[g_detail.last_duration]));
    }
    items[n++].id = ACT_REPLAY;
  }
  if (room->flags & FLAG_FORCED) {
    snprintf(items[n].label, sizeof(items[n].label), "%s", text_get(T_BACK_SCHEDULE));
    items[n++].id = ACT_SCHEDULE;
  }
  if (!(room->flags & FLAG_OFF)) {
    snprintf(items[n].label, sizeof(items[n].label), "%s", text_get(T_TURN_OFF));
    items[n++].id = ACT_OFF;
  }
  actions_set_items(s_pilot, items, n);

  // Mode en cours et température qu'il impose (TPB-PIL-006).
  ui_mode_line(room, s_index, true, header, sizeof(header));
  actions_set_header(s_pilot, header);
  char title[32];
#ifdef PBL_ROUND
  snprintf(title, sizeof(title), "%s", text_get(T_PILOT));
#else
  snprintf(title, sizeof(title), "%s · %s", text_get(T_PILOT), room->name);
#endif
  actions_set_title(s_pilot, title);
}

static void on_pilot_select(int id) {
  switch (id) {
    case ACT_FORCE:
      win_setpoint_push(s_index);
      break;
    case ACT_REPLAY:
      win_result_send(CMD_FORCE, s_index, g_detail.last_temp, g_detail.last_duration);
      break;
    case ACT_SCHEDULE:
      win_result_send(CMD_SCHEDULE, s_index, 0, 0);
      break;
    case ACT_OFF:
      win_result_send(CMD_OFF, s_index, 0, 0);
      break;
  }
}

// Les données du pilotage (mode en cours, dernier forçage) sont rechargées à chaque affichage.
static void on_pilot_appear(void) {
  comms_request_detail(s_index, true);
}

static void on_duration_select(int id) {
  win_result_send(CMD_FORCE, s_index, s_temp, id);
}

void win_pilot_push(uint8_t room_index) {
  if (!s_pilot) {
    s_pilot = actions_create(on_pilot_select, on_pilot_appear);
    s_duration = actions_create(on_duration_select, NULL);
  }
  if (!s_pilot || actions_is_open(s_pilot) || room_index >= g_view.count) {
    return;
  }
  s_index = room_index;
  build_pilot();
  actions_push(s_pilot);
}

void win_pilot_refresh(void) {
  if (s_pilot && actions_is_open(s_pilot) && s_index < g_view.count) {
    build_pilot();
  }
}

void win_pilot_close_all(void) {
  if (!s_pilot) {
    return;
  }
  actions_remove(s_duration);
  win_setpoint_close();
  actions_remove(s_pilot);
}

void win_pilot_choose_duration(uint8_t room_index, int16_t temp) {
  ActionItem items[5];
  char temp_text[12], title[32];
  s_index = room_index;
  s_temp = temp;
  for (int i = 0; i < 5; i++) {
    snprintf(items[i].label, sizeof(items[i].label), "%s", text_get(DURATION_TEXT[i + 1]));
    items[i].id = DUR_30 + i;
  }
  actions_set_items(s_duration, items, 5);
  text_setpoint(temp_text, sizeof(temp_text), temp, g_view.unit);
  snprintf(title, sizeof(title), "%s %s…", temp_text, text_get(T_FOR));
  actions_set_title(s_duration, title);
  actions_set_header(s_duration, NULL);
  actions_push(s_duration);
}
