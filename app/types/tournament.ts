/** Catégorie de carte dans le slot de représentants (monstres uniquement pour 5+5). */
export type RepresentativeCategory = 'extra' | 'main' | 'spell' | 'trap'

/** Une carte représentative — affichage artwork uniquement (image_url_cropped). */
export interface RepresentativeCard {
  id: number
  /** URL image cropped (artwork uniquement, pas de cadre ni stats). */
  imageUrl: string
  /** Catégorie : main / extra pour la grille 5+5. */
  category?: 'main' | 'extra'
  /** Type affiché sous le nom (Fusion, Synchro, Xyz, Link, Main, Pendulum, etc.). */
  displayType?: string
}

import type { ExtraPolicy, ArchetypeProfile } from '~/types/ranking'
export type { ExtraPolicy, ArchetypeProfile } from '~/types/ranking'

/** Données d'un archétype dans l'état du tournoi (préférence esthétique). */
export interface ArchetypeState {
  elo: number
  wins: number
  losses: number
  /** 5 Main + 5 Extra (artworks uniquement), ordre stable. */
  representativeCards?: RepresentativeCard[]
  /** Index de la carte actuellement affichée (cycle hors match). */
  representativeIndex?: number
  /** Tag Extra Deck : No Extra / Fusion / Synchro / Xyz / Link. */
  extraPolicy?: ExtraPolicy
  /** Profil esthétique (race, attribute, nameTokens) pour similarité. */
  profile?: ArchetypeProfile
  /** Rétrocompat */
  imageUrl?: string
  representativeCardId?: number
  dominantAttribute?: string
  dominantRace?: string
}

/** Phase du tournoi : Sieve + Swiss */
export type TournamentPhase = 'phase1' | 'phase2' | 'phase3' | 'finished'

export interface TournamentState {
  runId: string
  createdAt: string
  seed: number
  phase: TournamentPhase
  archetypes: Record<string, ArchetypeState>
  /** Tous les noms d'archétypes du tournoi */
  remainingNames: string[]
  /** Paires déjà jouées (phase 3 Suisse). Clé "A|B" avec A < B. */
  matchesPlayed: string[]
  /** Match en cours : 4-way [n1..n4] ou 1v1 [n1,n2] */
  currentMatch: string[] | null
  /** Round global (incrémenté à chaque choix) */
  round: number
  /** Taille du pool au démarrage */
  initialPoolSize?: number

  /** Sous-round dans la phase courante (0-indexed) */
  phaseRound: number
  /** Nombre de groupes résolus dans le round courant */
  groupsCompleted: number
  /** Nombre total de groupes dans le round courant */
  groupsTotal: number
  /** Groupes pré-calculés pour le round courant (phase 1/2) */
  currentRoundGroups: string[][] | null
  /** Pool d'archétypes pour la phase courante (sous-ensemble de remainingNames) */
  phasePool: string[]

  /** Dernier choix (pour undo) */
  lastMatchResult?: {
    phase: 'phase1' | 'phase2' | 'phase3'
    match: string[]
    winner: string
    losers?: string[]
    loser?: string
    /** Deltas Elo appliqués (pour undo exact) */
    eloDelta?: { name: string; delta: number }[]
    /** Snapshot pour restauration lors d'un undo de transition de phase */
    prevGroups?: string[][] | null
    prevPhasePool?: string[]
    prevGroupsTotal?: number
    prevPhaseRound?: number
  }
}

/** Elo initial */
export const INITIAL_ELO = 1000

/** Phase 1 : 2 rounds de couverture (groupes de 4, tout le pool) */
export const COVERAGE_ROUND_COUNT = 2
/** Phase 2 : fraction du pool retenue (top 50%) */
export const REFINEMENT_POOL_FRACTION = 0.5
/** Phase 3 : taille du pool suisse (24 finalistes) */
export const SWISS_POOL_SIZE = 24
/** Phase 3 : nombre de rounds suisses */
export const SWISS_ROUND_COUNT = 3

/** K-factor pour groupes phase 1 (dampened : K=32 × 0.5) */
export const K_GROUP_DAMPENED = 16
/** K-factor pour groupes phase 2 (full) */
export const K_GROUP_FULL = 32
/** K-factor pour duels 1v1 phase 3 */
export const K_SWISS = 32
