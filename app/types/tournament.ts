/** Catégorie de carte dans le slot de représentants */
export type RepresentativeCategory = 'extra' | 'main' | 'spell' | 'trap'

/** Une carte représentative (pour affichage, cadre type Yu-Gi-Oh!) */
export interface RepresentativeCard {
  id: number
  /** URL image cropped (art seulement) */
  imageUrl: string
  /** URL image complète de la carte (design officiel YGOPRODeck) */
  imageUrlFull?: string
  name?: string
  frameType?: string
  attribute?: string
  level?: number
  race?: string
  atk?: number
  def?: number
  /** Catégorie : extra / main / spell / trap */
  category?: RepresentativeCategory
}

/** Données d'un archétype dans l'état du tournoi */
export interface ArchetypeState {
  elo: number
  wins: number
  losses: number
  /** 8 cartes représentatives (2 Extra + 2 Main + 2 Spell + 2 Trap) ; certaines entrées peuvent être undefined si le pool était trop petit. */
  representativeCards?: (RepresentativeCard | undefined)[]
  /** Index de la carte actuellement affichée dans representativeCards */
  representativeIndex?: number
  /** Rétrocompat: URL et id de la carte affichée (dérivés si representativeCards existe) */
  imageUrl?: string
  representativeCardId?: number
  /** Attribut dominant de l'archétype (DARK, LIGHT, FIRE…) pour le groupement thématique */
  dominantAttribute?: string
  /** Race/type dominant de l'archétype (Dragon, Warrior, Spellcaster…) pour le groupement thématique */
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
