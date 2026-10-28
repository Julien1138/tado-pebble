# Tado — mini manual (English)

## Short text (store)

See and control your Tado heating from your wrist: temperature and heating power of every room, boost, presence, shortcuts.

## Description

**Tado** shows the state of your Tado heating on your Pebble and lets you control it without taking out your phone.

- The **room list**: measured temperature, target temperature, heating power and any boost, colored by temperature.
- The room **detail**: current mode and when it ends, the next scheduled change, humidity, open window.
- **Control**: boost a room to a temperature for a chosen time, replay your last setting, go back to the schedule, turn a room off.
- The **history** of the last twelve hours of heating, room by room.
- **Presence**: Home, Away, or Auto (Tado's geolocation).
- Whole-house **shortcuts**: All off, schedule everywhere, Away mode, Geolocation mode.

Works on Pebble Time, Time Steel, Time Round, Time 2, Round 2 and Pebble 2 / 2 Duo, in English and French, in °C or °F according to your Tado account. Touchscreen watches can also be used by touch; the buttons always remain enough.

You need a Tado account with a Tado heating system (radiator valves or thermostat). Independent app, not affiliated with Tado: it uses Tado's API, which is not documented for third-party apps and may change without notice. No server: your phone talks directly to Tado, and your credentials stay on the phone.

## First launch

1. Open the app. The watch shows a six-character **code**.
2. On your phone, open `login.tado.com/oauth2/device`. If the page does not open by itself, open the app's settings in the Pebble app: it opens there.
3. Sign in with your Tado account and enter the code. You have five minutes.
4. The room list appears. Your password is never seen by the app.

## Buttons

| Where | Up / Down | Select | Long press on Select | Back |
|---|---|---|---|---|
| Room list | Choose a room | Open the detail | Open the menu | Quit |
| Detail | Previous / next room | Open control | — | Back to the list |
| Control | Choose an action | Run it | — | Back to the detail |
| Setpoint | Warmer / cooler (0.5 °C or 1 °F) | Choose the duration | — | Abandon |
| Duration | Choose | Send | — | Back to the setpoint |
| Menu | Choose | Open | — | Back to the list |

On a touchscreen watch: swipe to scroll, tap a row to open it, tap the arrows or the + and − signs of the side bar.

## Reading the room list

- The **title** shows the house presence state and the time.
- A row's **color** follows the temperature: blue below 18 °C, cyan from 18 to 19.5 °C, amber from 19.5 to 21 °C, orange above. On black and white watches, a room that is heating is shown inverted.
- **One to three heat lines** and a percentage show the heating power; "idle" means it is not heating.
- "→ 21°" is the target temperature; "boost" marks a boost; "off" a heating that is switched off.
- A banner appears when data is more than two minutes old, or when the watch is "Offline": it then keeps the last known situation.

## Controlling a room

From the detail, press **Select** to open control:

- **Set temp.**: choose the temperature, then the duration (30 min, 1 h, 2 h, until the next period, until changed).
- The room's **last setting**, replayed with one press.
- **Back to schedule** (if the room is boosted) and **Turn heating off** (until the next period).

The watch then announces "Done", "Refused", "Failed" or "Offline", and shows the state read back from Tado. Nothing is ever assumed to have worked, and a failed command is not replayed on its own.

## The menu

Long press on **Select** from the room list.

- **History**: one row per room, one column per hour (twelve, eight on the Time Round), the last one being the current hour (outlined). From yellow to dark red (dots, checkerboard, then solid on black and white watches), heating gets stronger; a crossed-out cell is an unknown hour, not an hour without heating. Up and Down scroll.
- **Presence**: **Home** or **Away** (set by you), or **Auto**, where Tado decides from the position of your phones ("Auto (1/2)": one tracked device out of two is at home). If Tado refuses the return to Auto for your account, Auto is no longer offered.
- **Shortcuts**: "All off" turns the whole house off until changed. Only the shortcuts that make sense now are offered ("Schedule" only if a room is boosted, for instance). Each one asks for confirmation. If a room could not be changed, the watch names it.

## If something is wrong

- **Offline**: the watch is away from the phone, or Tado is unreachable. Bring it closer; commands are refused rather than queued.
- **Link lost**: the authorization expired (watch unused for more than 30 days) or was withdrawn. A new code appears: link again.
- **Auto unavailable**: Tado refuses the return to Auto mode for your account.
- **A room shown "offline"**: its thermostat no longer answers to Tado.

The app handles neither hot water nor cooling, nor schedules (set in the Tado app).
