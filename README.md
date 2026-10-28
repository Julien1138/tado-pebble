# Tado pour Pebble

<img src="resources/logo/icon-144.png" alt="Logo : une maison et trois traits de chaleur" width="96" align="right">

Application Pebble pour voir et piloter son chauffage Tado depuis la montre : la température et la
puissance de chauffe de chaque pièce, forcer une température, choisir la présence, agir sur toute la
maison en un geste.

La watchapp est écrite en C, la logique Tado en JavaScript (PebbleKit JS) sur le téléphone. Il n'y a pas
de serveur : le téléphone parle directement à Tado, et rien ne s'exécute application fermée.

> Projet personnel, non affilié à Tado. Il utilise l'API de Tado, qui n'est pas documentée pour les
> applications tierces : elle peut changer sans préavis.

## Ce que fait l'application

- **Liste des pièces** : une ligne par pièce avec la température mesurée, la température demandée, la
  puissance de chauffe (un à trois traits de chaleur et le pourcentage), le forçage éventuel. Couleur
  selon la température, motifs en noir et blanc.
- **Détail d'une pièce** : mode en cours et sa fin, prochain changement de la programmation, humidité,
  fenêtre ouverte. Haut et Bas passent d'une pièce à l'autre.
- **Pilotage** : forcer une température (30 min, 1 h, 2 h, jusqu'au prochain créneau, jusqu'à nouvel
  ordre), rejouer le dernier forçage, revenir à la programmation, éteindre le chauffage.
- **Menu** (appui long sur Sélection depuis la liste) :
  - **Historique** : grille des douze dernières heures (huit sur la Pebble Time Round) par pièce.
  - **Présence** : Présent, Absent, ou Auto (géolocalisation de Tado).
  - **Raccourcis** : Tout off, programmation partout, mode Absent, mode Géolocalisation, avec
    confirmation.
- **Tactile** (montres qui en ont) : faire défiler et toucher une ligne, en complément des boutons ;
  tout reste faisable aux quatre boutons.

Chaque commande annonce son résultat (« Pris en compte », « Refusé », « Échec », « Hors connexion ») et
n'est jamais présumée réussie : la montre affiche l'état relu chez Tado. Une commande n'est jamais
retentée ni mise en attente. Les écrans se rechargent à chaque affichage. Sans connexion, la montre
garde la dernière situation connue et en indique l'âge.

Langues : français et anglais, selon la langue de la montre. L'unité de température est celle du
compte Tado.

## Plateformes

basalt (Pebble Time, Time Steel), chalk (Time Round), diorite (Pebble 2), emery (Time 2),
flint (Pebble 2 Duo), gabbro (Round 2). La plateforme aplite (Pebble, Pebble Steel) n'est pas prise en
charge : sa mémoire de travail est trop étroite.

## Première utilisation

Au premier lancement, la montre affiche un code et l'adresse `login.tado.com/oauth2/device`. Saisissez le
code sur cette page avec votre compte Tado ; l'application s'en charge ensuite (jetons conservés sur le
téléphone, mot de passe jamais vu par l'application). Si la page ne s'ouvre pas toute seule sur le
téléphone, ouvrez les réglages de l'application dans l'application Pebble : la page de validation
s'ouvre.

## Compiler et essayer

Prérequis : le [SDK Pebble](https://developer.repebble.com) (`pebble`), Node.js 20 ou plus pour les tests.

```sh
pebble build                          # compile pour les six plateformes
pebble install --emulator basalt      # lance l'émulateur (basalt, chalk, diorite, emery, flint, gabbro)
pebble install --phone <adresse>      # installe sur une montre
npm test                              # tests du pkjs et de la reconnaissance de gestes
```

Les tests rejouent des réponses de Tado sans réseau. Celui des gestes compile `src/c/gesture.c` avec le
compilateur C de la machine et est ignoré s'il n'y en a pas.

## Organisation

| Dossier | Contenu |
|---|---|
| `src/c/` | watchapp : messagerie, magasin, fenêtres (liste, détail, pilotage, consigne, durée, menu, historique, présence, raccourcis, liaison, résultat), tactile |
| `src/pkjs/` | téléphone : liaison (J-02), client Tado (J-03), cache, maison, historique, commandes, vues, messagerie |
| `test/` | tests Node ; `test/c/` pour la reconnaissance de gestes |
| `docs/` | cahier des charges et document de conception (LaTeX) |
| `resources/` | icône du menu ; `logo/` : sources et exports du logo |
| `store/` | catalogue : fiche en français (`manuel-fr.md`) et en anglais (`manual-en.md`), captures d'écran de chaque plateforme dans `screenshots/{fr,en}/` (sept écrans, heure 13:36, maison d'essai) |

Le téléphone porte toute la connaissance de Tado et ne transmet à la montre que des vues prêtes à
afficher. Le protocole entre les deux est décrit dans le document de conception (section Protocole) ;
`src/c/protocol.h` et `src/pkjs/protocol.js` en sont les deux copies.

## Documentation

Sources LaTeX dans `docs/` (les PDF ne sont pas versionnés) :

- `docs/cahier-des-charges/` : spécification des exigences système (TPB-SyRS, ISO/IEC/IEEE 29148)
- `docs/conception/` : conception logicielle (décisions, composants, protocole, comportements,
  traçabilité), avec les maquettes des écrans de chaque plateforme

```sh
cd docs/cahier-des-charges && latexmk -pdf cahier-des-charges.tex
cd docs/conception && latexmk -pdf conception.tex
```

## Logo

`python3 resources/logo/make_logo.py` (Python 3 et Pillow) régénère le SVG, les icônes du catalogue
(48, 144 et 512 px) et l'icône du menu de la montre.
