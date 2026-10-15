# Recette vocale — condition de mise en service

## Objectif

Mesurer les erreurs sur votre terrain et vérifier qu’aucune erreur de reconnaissance ne se transforme en information financière ou technique confirmée sans relecture. Ne jamais annoncer 100 % de précision sur la seule base d’une démonstration.

## Corpus représentatif

Constituer au moins 50 dictées avec données fictives, deux téléphones et un ordinateur, plusieurs locuteurs et les situations réellement rencontrées : bureau calme, atelier, vent et distance au microphone. Inclure des marques rares, anciennes et inconnues, et des accents variés.

| Cas                      | Exemple à dicter                                        | Résultat attendu                                   |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------- |
| Référence alphanumérique | « Rapido huit cent neuf six DF »                        | Référence à relire sans modèle voisin inventé      |
| Cylindrée                | « Fiat Ducato deux litres deux, cent quarante chevaux » | 2.2 conservé, jamais remplacé par 2.3              |
| Puissance hors catalogue | « Ford Transit deux litres, cent trente-six chevaux »   | 136 ch conservé, aucune substitution               |
| Marque inconnue          | Nom d’un aménageur local                                | Aucune marque imposée                              |
| Centimes                 | « Pare-chocs, cent vingt-trois euros quarante-cinq »    | 123,45 € dans proposition, synthèse et Excel       |
| Milliers                 | « Réfrigérateur, mille deux cent cinquante euros »      | 1 250,00 €, aucune perte de zéro                   |
| Montant absent           | « Réparer le chauffage »                                | Montant à préciser, export bloqué                  |
| Négation                 | « Pas de batterie moteur à changer »                    | NON explicite, autres postes inchangés             |
| Cellule / moteur         | « Remplacer la batterie cellule »                       | Travail cellule, pas batterie moteur               |
| Correction               | « 130 chevaux, non je corrige, 140 chevaux »            | Dernière correction explicite proposée et signalée |
| Date partielle           | « Mise en circulation avril 2023 »                      | Complément demandé, jour non inventé               |
| Plaque                   | Plaque fictive épelée lettre par lettre                 | Relecture obligatoire, pas de complément inventé   |
| Ajout                    | Deux dictées successives de travaux différents          | Travaux précédents conservés                       |
| Six pneus                | « Six pneus sur un montage jumelé »                     | Avertissement, aucun forfait de deux trains deviné |
| Longue dictée            | Plus de six travaux carrosserie                         | Toutes les lignes dans Excel et somme correcte     |
| Silence / bruit          | Enregistrement sans parole                              | Aucun champ confirmé automatiquement               |
| Panne réseau             | Couper la connexion après enregistrement                | Réécoute et texte conservés, relance possible      |
| Refus micro              | Refuser l’autorisation                                  | Explication claire, saisie manuelle disponible     |

## Mesure et validation

Pour chaque cas, conserver la transcription attendue, celle reçue, les propositions, les corrections faites et les valeurs exportées. Compter séparément erreurs de mots, erreurs de références, erreurs numériques et pertes de lignes. Mesurer le temps jusqu’à une fiche corrigée et exploitable.

Critère bloquant : un montant erroné accepté sans relecture, une référence inventée, une ligne perdue, une donnée précédente effacée sans demande explicite, ou un désaccord entre l’écran et Excel. Corriger et rejouer le cas, puis les cas voisins. Faire approuver les forfaits par le responsable métier.

Effectuer la recette avec la clé et les modèles configurés sur l’environnement de recette, sans utiliser de données personnelles ou commerciales réelles pour les premiers essais. Tester aussi les limites de session et les plafonds de dépenses. Si une précision insuffisante persiste, ajuster les modèles et les consignes puis mesurer à nouveau ; ne pas masquer les alertes pour améliorer artificiellement les résultats.
