# Yu-Gi-Oh! Archetype Tournament (Elo Ranking)

Application web **Nuxt 4** pour classer les archétypes Yu-Gi-Oh! via des duels 1v1 et par élimination (4-way), avec système Elo et export CSV.

## Fonctionnalités

- **Phase 1** : duels à 4 archétypes → vous choisissez le gagnant, les 3 autres sont éliminés. Réduit le nombre d’archétypes jusqu’à un seuil (32 par défaut).
- **Phase 2** : duels 1v1 avec **Elo** (K=24, initial 1000). Matchmaking par Elo proche, sans re-match.
- **Fin** : détection de **convergence** (variation moyenne des Elo faible) ou bouton « Terminer ».
- **Top 10** + **export CSV** (UTF-8) et **sauvegarde** en `localStorage`.

Données via [YGOPRODeck API](https://db.ygoprodeck.com/api-guide/) (liste d’archétypes + cartes par archétype). Conformément au guide, les images sont téléchargées puis stockées en local dans IndexedDB (navigateur) : une requête par carte, puis lecture depuis le cache.

## Setup

```bash
npm install
```

## Dev

```bash
npm run dev
```

Ouvrir `http://localhost:3000`.

## Build / Preview

```bash
npm run build
npm run preview
```

## Structure

- `app/composables/` : `useYgoApi`, `useTournament`, `useTournamentState`
- `app/utils/` : Elo, matchmaking, sélection de la carte représentative, état, CSV, **cache d'images IndexedDB** (`imageCache.ts`)
- `app/types/` : types Tournoi et API
- `app/pages/index.vue` : page unique (phase 1, phase 2, Top 10)

La carte représentative par archétype est choisie automatiquement (nom, type, rareté, date, ATK) selon le cahier des charges.

### Pourquoi IndexedDB et pas SQLite ?

- **Frontend uniquement** : pas de serveur, donc pas de SQLite côté serveur.
- **IndexedDB** est l’API de stockage persistante du navigateur (clé/valeur, blobs). Idéal pour mettre en cache des images sans backend.
- SQLite dans le navigateur (ex. sql.js) existe mais est surtout utile pour des données structurées ; pour des binaires (images), IndexedDB est plus adapté et mieux supporté.
- Si tu ajoutes plus tard un **backend** (Node, etc.), tu pourrais alors utiliser SQLite ou un dossier de fichiers pour centraliser le cache et le servir à tous les clients.
