#pragma once
#include <pebble.h>

// Liste d'actions à une colonne, commune aux fenêtres Pilotage et Durée : lignes de même hauteur,
// sélection ambrée (inversée en noir et blanc), sélection centrée sur les écrans ronds. Boutons
// Haut/Bas/Sélection, et toucher : glisser pour défiler, toucher une ligne = Sélection.
#define ACTION_MAX 5

typedef struct {
  char label[40];
  int id;
  bool marked;     // liste à puces : l'élément en vigueur
} ActionItem;

typedef struct ActionList ActionList;
typedef void (*ActionSelectHandler)(int id);
// Appelé chaque fois que la fenêtre apparaît (ouverture, retour d'une fenêtre qui la recouvrait).
typedef void (*ActionAppearHandler)(void);

// Quatre listes au plus (Pilotage, Durée, Menu, Présence).
ActionList *actions_create(ActionSelectHandler on_select, ActionAppearHandler on_appear);
void actions_set_title(ActionList *list, const char *title);
// Bandeau sous le titre (écrans rectangulaires) ; NULL ou vide pour l'omettre.
void actions_set_header(ActionList *list, const char *header);
// Liste à puces (choix du mode de présence) : une puce devant chaque ligne, pleine pour l'élément marqué.
void actions_set_radio(ActionList *list, bool radio);
void actions_set_items(ActionList *list, const ActionItem *items, uint8_t count);
void actions_push(ActionList *list);
void actions_remove(ActionList *list);
bool actions_is_open(const ActionList *list);
