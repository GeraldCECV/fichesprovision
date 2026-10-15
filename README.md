# Provision VO — YpoCamp

Inspection et chiffrage des véhicules d’occasion : saisie manuelle, dictée relue, contrôles métier et export du modèle Excel historique avec détail exhaustif.

## Garanties de fonctionnement

- Aucune substitution de marque, modèle, référence ou motorisation. Toutes les saisies sont autorisées ; les suggestions orthographiques ne constituent pas une base de données constructeur exhaustive ou homologuée.
- Dictée en trois étapes : transcription avec réécoute → texte corrigible → proposition structurée à confirmer. Aucune analyse ne modifie directement la fiche.
- Nouvelle dictée partielle : les champs non mentionnés sont préservés. Les travaux sont ajoutés par défaut ; le remplacement est explicite, l’application immédiatement annulable.
- Absence de montant ≠ zéro. Chaque montant manquant, contrôle incomplet ou incohérence bloque l’export côté interface ET serveur.
- Calcul en centimes, date calendaire stricte, alternatives mécaniques exclusives, forfaits visibles et montants exclusivement HT. Aucune conversion de TVA implicite.
- Jusqu’à 200 travaux dans chaque rubrique. Au-delà de la capacité de la fiche historique, le total est lié à l’onglet **Travaux** contenant toutes les lignes. Aucun dépassement silencieux.
- Brouillon sauvegardé dans l’onglet (`sessionStorage`). Conservation après fermeture uniquement sur choix explicite (`localStorage`) ; aucune archive serveur ni synchronisation entre utilisateurs.

## Installation locale

Node.js 20 minimum (version LTS maintenue recommandée).

```sh
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run dev -w backend
# Dans un second terminal :
npm run dev -w frontend
```

Ouvrir `http://localhost:5173`. Sans clé OpenAI, le formulaire et l’export fonctionnent ; les commandes vocales signalent leur indisponibilité.
La clé `OPENAI_API_KEY` reste exclusivement dans l’environnement du serveur. Ne jamais la placer dans une variable `VITE_*` ou la committer.

## Déploiement — configuration obligatoire avant mise en service

### Serveur (Node)

- Installer depuis la racine du dépôt avec `npm ci` ; démarrer avec `npm start -w backend`. Si la plateforme a pour répertoire de travail `backend`, utiliser `cd .. && npm ci` comme commande de construction et `npm start` comme commande de démarrage.
- Définir `NODE_ENV=production`, `OPENAI_API_KEY`, `APP_PASSWORD` (12 caractères minimum) et `APP_SESSION_SECRET` (32 caractères minimum, aléatoire).
- Définir `FRONTEND_ORIGIN` avec l’origine exacte du frontend, sans slash final. Plusieurs origines explicites sont séparées par des virgules ; les URL de preview doivent être ajoutées explicitement.
- Définir `TRUST_PROXY_HOPS` seulement après vérification du nombre de reverse proxies. Ne pas utiliser une confiance illimitée : cela permettrait de contourner les limites par IP.
- Le serveur refuse de démarrer en production si les secrets d’accès ne sont pas configurés. Ce choix évite de publier par accident des appels IA payants sans protection.
- Définir les plafonds de dépenses et les alertes du projet OpenAI, ainsi que les limites réseau de l’hébergeur. La limitation en mémoire de cette version concerne une instance : plusieurs réplicas nécessitent un store partagé ou une limite au niveau de la passerelle.
- Session signée de 8 heures, jeton conservé uniquement en mémoire du navigateur. Une actualisation nécessite une reconnexion ; le brouillon reste présent. L’accès équipe partagé ne remplace pas une authentification individuelle ni une piste d’audit nominative.

### Frontend (Vercel ou hébergement statique)

- Racine Vercel : `frontend` avec accès aux fichiers du dépôt hors de cette racine activé (le domaine métier partagé est dans `backend/src/domain.js`). Alternative : racine du dépôt, commande `npm run build`, sortie `frontend/dist`, et reprendre les en-têtes de `frontend/vercel.json`.
- Installation : `npm ci` depuis la racine du dépôt. Construction : `npm run build -w frontend`.
- Définir `VITE_API_URL` avec l’URL HTTPS du serveur. Reconstruire après tout changement de cette valeur.
- Les en-têtes de sécurité se trouvent dans `frontend/vercel.json`. `connect-src https:` permet une API distincte configurée au build ; pour une politique plus stricte, remplacer par son origine exacte.
- Déployer d’abord sur une URL de recette et vérifier connexion, microphone, export et restauration du brouillon avant la bascule.

## Dictée et limites

Transcription : `gpt-4o-transcribe` par défaut (`TRANSCRIPTION_MODEL`). Analyse : `gpt-4.1` par défaut (`ANALYSIS_MODEL`), schéma JSON strict, sortie complète obligatoire. Les modèles peuvent être configurés ; vérifier leur disponibilité sur le projet OpenAI et leur compatibilité avec les paramètres.

Les fragments présentant une faible probabilité de transcription peuvent être signalés pour réécoute. Le seuil est une aide de relecture, **pas une mesure de précision calibrée**. L’absence de signal ne certifie rien.

Les documents constructeur, la carte grise et l’inspection humaine restent la référence. Il n’existe pas ici de référentiel exhaustif vérifié de tous les modèles, années et moteurs : compléter automatiquement une référence depuis un catalogue incomplet serait dangereux. Une intégration future d’un référentiel licencié doit proposer des correspondances confirmées, jamais écraser la saisie.

L’audio est enregistré localement puis transmis au serveur et à OpenAI. Le serveur utilise la mémoire, sans fichier temporaire ; le buffer est effacé après traitement. La réécoute reste dans l’onglet. Le texte n’est analysé qu’à la demande après correction. Aucun service vocal natif du navigateur n’est utilisé. La conservation chez les prestataires dépend des conditions du projet OpenAI et de l’hébergeur ; ne pas promettre une absence totale de conservation sans vérifier ces paramètres.

Documentation utilisée : [transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [sorties structurées](https://developers.openai.com/api/docs/guides/structured-outputs).

## Règles financières conservées et rendues explicites

Forfaits issus du classeur historique : administration/livraison 1 025 €, esthétique 230 €, CT 80 €, vidange simple 150 €, complète 350 €, distribution seule 600 €, distribution + pompe 850 €, train de pneus 400 €, batterie moteur 180 €. Les frais supplémentaires sont éditables ; les forfaits mécaniques doivent être validés métier avant production. Tous les montants sont exclusivement HT, sans sélecteur ni conversion de TVA.

Provision mauvaises surprises : 250 € jusqu’au quatrième anniversaire inclus, 500 € jusqu’au huitième inclus, 750 € au-delà (date métier Europe/Paris). Les dates partielles ou futures sont bloquées. Prix de revient = achat + provision ; cession Odoo affichée et exportée séparément, selon le modèle historique.

La formule historique « autres mécanique » a été corrigée (`E25=D25`). Des résultats calculés sont enregistrés dans le classeur pour les lecteurs sans moteur de calcul, avec recalcul demandé à l’ouverture. Les formules métier restent modifiables dans Excel. Les confirmations de la fiche sont une déclaration utilisateur, pas une signature électronique inviolable.

## Vérifications

```sh
npm test
npm run build
npm run format:check
npm audit
```

Les tests couvrent les centimes, dates, seuils, alternatives, propositions partielles, réponses IA tronquées/refusées, accès, origines, limites de charge et aller-retour Excel de 400 travaux. Les appels IA y sont simulés, sans dépense ni données réelles. Le contrôle navigateur couvre saisie, restauration après actualisation, exclusivité des vidanges, relecture et annulation d’une proposition simulée, export et affichage à 390 px.

**Avant production :** exécuter la recette vocale réelle décrite dans `docs/RECETTE_VOCALE.md`. La compilation et les mocks ne mesurent pas la reconnaissance acoustique. Tester le fichier dans les versions d’Excel/LibreOffice réellement utilisées et vérifier la mise en page imprimée ; les tests de sérialisation seuls ne garantissent pas ces comportements natifs.

## Accès sans mot de passe

`ALLOW_PUBLIC_ACCESS=true` désactive explicitement l’authentification pour le service concerné, même si `APP_PASSWORD` reste configuré. Les limites de fréquence et de concurrence restent actives ; toute personne disposant du lien peut utiliser les appels OpenAI payants. Sans ce réglage, l’accès protégé demeure obligatoire en production. Le serveur de recette utilise cette option à la demande de son propriétaire ; elle ne modifie pas le service de production.
