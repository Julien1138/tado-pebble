# Tado — mini-manuel (français)

## Texte court (catalogue)

Voyez et pilotez votre chauffage Tado depuis votre poignet : température et puissance de chaque pièce, forçage, présence, raccourcis.

## Description

**Tado** affiche l'état de votre chauffage Tado sur votre montre Pebble et vous laisse le piloter sans sortir le téléphone.

- La **liste des pièces** : température mesurée, température demandée, puissance de chauffe et forçage en cours, avec une couleur selon la température.
- Le **détail** d'une pièce : mode en cours et sa fin, prochain changement de la programmation, humidité, fenêtre ouverte.
- Le **pilotage** : forcer une température pour une durée, rejouer votre dernier réglage, revenir à la programmation, éteindre une pièce.
- L'**historique** des douze dernières heures de chauffe, pièce par pièce.
- La **présence** : Présent, Absent, ou Auto (géolocalisation de Tado).
- Les **raccourcis** de toute la maison : Tout off, programmation partout, mode Absent, mode Géolocalisation.

Fonctionne sur Pebble Time, Time Steel, Time Round, Time 2, Round 2 et Pebble 2 / 2 Duo, en français et en anglais, en °C ou °F selon votre compte Tado. Les montres tactiles peuvent aussi se manipuler au doigt ; les boutons suffisent toujours.

Il faut un compte Tado avec un chauffage Tado (têtes thermostatiques ou thermostat). Application indépendante, non affiliée à Tado : elle utilise l'API de Tado, non documentée pour les applications tierces, qui peut changer sans préavis. Aucun serveur : votre téléphone parle directement à Tado, et vos identifiants restent sur le téléphone.

## Premier lancement

1. Ouvrez l'application. La montre affiche un **code** de six caractères.
2. Sur votre téléphone, ouvrez `login.tado.com/oauth2/device`. Si la page ne s'ouvre pas toute seule, ouvrez les réglages de l'application dans l'application Pebble : elle s'ouvre.
3. Connectez-vous avec votre compte Tado et saisissez le code. Vous avez cinq minutes.
4. La liste des pièces apparaît. Votre mot de passe n'est jamais vu par l'application.

## Les boutons

| Où | Haut / Bas | Sélection | Appui long sur Sélection | Retour |
|---|---|---|---|---|
| Liste des pièces | Choisir une pièce | Ouvrir le détail | Ouvrir le menu | Quitter |
| Détail | Pièce précédente / suivante | Ouvrir le pilotage | — | Retour à la liste |
| Pilotage | Choisir une action | Exécuter | — | Retour au détail |
| Consigne | Plus chaud / moins chaud (0,5 °C ou 1 °F) | Choisir la durée | — | Abandonner |
| Durée | Choisir | Envoyer | — | Retour à la consigne |
| Menu | Choisir | Ouvrir | — | Retour à la liste |

Sur une montre tactile : faites glisser le doigt pour défiler, touchez une ligne pour l'ouvrir, touchez les flèches ou les signes + et − de la barre latérale.

## Lire la liste des pièces

- Le **titre** donne l'état de présence de la maison et l'heure.
- La **couleur** d'une ligne suit la température : bleu sous 18 °C, cyan de 18 à 19,5 °C, ambre de 19,5 à 21 °C, orange au-dessus. Sur les montres noir et blanc, une pièce qui chauffe est en vidéo inversée.
- **Un à trois traits de chaleur** et un pourcentage indiquent la puissance de chauffe ; « repos » veut dire qu'elle ne chauffe pas.
- « → 21° » est la température demandée ; « forcé » signale un forçage ; « éteint » un chauffage coupé.
- Un bandeau apparaît quand les données ont plus de deux minutes, ou quand la montre est « Hors connexion » : elle garde alors la dernière situation connue.

## Piloter une pièce

Depuis le détail, **Sélection** ouvre le pilotage :

- **Forcer temp.** : choisissez la température, puis la durée (30 min, 1 h, 2 h, jusqu'au prochain créneau, jusqu'à nouvel ordre).
- Le **dernier réglage** de la pièce, rejoué d'un seul geste.
- **Retour programme** (si la pièce est forcée) et **Éteindre chauffage** (jusqu'au prochain créneau).

La montre annonce ensuite « Pris en compte », « Refusé », « Échec » ou « Hors connexion », et affiche l'état relu chez Tado. Rien n'est jamais présumé réussi, et une commande échouée n'est pas rejouée toute seule.

## Le menu

Appui long sur **Sélection** depuis la liste des pièces.

- **Historique** : une rangée par pièce, une colonne par heure (douze, huit sur la Time Round), la dernière étant l'heure en cours (cerclée). Du jaune au rouge sombre (points, damier puis plein sur les montres noir et blanc), la chauffe est de plus en plus forte ; une case barrée est une heure inconnue, pas une heure sans chauffe. Haut et Bas font défiler.
- **Présence** : **Présent** ou **Absent** (imposés), ou **Auto**, où Tado décide d'après la position de vos téléphones (« Auto (1/2) » : un appareil suivi sur deux est à la maison). Si Tado refuse le retour à Auto pour votre compte, Auto n'est plus proposé.
- **Raccourcis** : « Tout off » éteint toute la maison jusqu'à nouvel ordre. Seuls ceux qui ont un sens maintenant sont proposés (« Programmation » seulement si une pièce est forcée, par exemple). Chacun demande une confirmation. Si une pièce n'a pas pu être modifiée, la montre la nomme.

## Si quelque chose ne va pas

- **Hors connexion** : la montre est loin du téléphone, ou Tado est injoignable. Rapprochez-la ; les commandes sont refusées plutôt que mises en attente.
- **Liaison perdue** : l'autorisation a expiré (montre inutilisée plus de 30 jours) ou a été retirée. Un nouveau code s'affiche : recommencez la liaison.
- **Auto indisponible** : Tado refuse le retour au mode Auto pour votre compte.
- **Une pièce « hors ligne »** : son thermostat ne répond plus à Tado.

L'application ne gère ni l'eau chaude ni la climatisation, ni les programmations (réglées dans l'application Tado).
