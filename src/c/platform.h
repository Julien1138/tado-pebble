#pragma once
// M-04 Plateforme : constantes de présentation. Seul endroit où l'on teste la plateforme ;
// ailleurs on teste PBL_ROUND, PBL_COLOR et PBL_DISPLAY_WIDTH. Valeurs relevées sur les maquettes.

#if defined(PBL_PLATFORM_EMERY)
  #define TITLE_H 28
  #define ROW_H 52
  #define BANNER_H 22
#elif defined(PBL_PLATFORM_GABBRO)
  #define TITLE_H 44
  #define ROW_H 0
  #define SELECTED_H 104
  #define OTHER_H 58
  #define BANNER_H 0
#elif defined(PBL_PLATFORM_CHALK)
  #define TITLE_H 30
  #define ROW_H 0
  #define SELECTED_H 76
  #define OTHER_H 38
  #define BANNER_H 0
#else /* basalt, diorite, flint */
  #define TITLE_H 22
  #define ROW_H 38
  #define BANNER_H 18
#endif

// Colonnes de l'historique (TPB-PLT-007) : huit heures sur la Pebble Time Round, douze ailleurs.
#if defined(PBL_PLATFORM_CHALK)
  #define HISTORY_COLUMNS 8
#else
  #define HISTORY_COLUMNS 12
#endif
