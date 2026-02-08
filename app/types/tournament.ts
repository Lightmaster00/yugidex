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
}

/** Données d'un archétype dans l'état du tournoi */
export interface ArchetypeState {
  elo: number
  wins: number
  losses: number
  /** 3–4 cartes les plus emblématiques (pour affichage aléatoire + cycle) */
  representativeCards?: RepresentativeCard[]
  /** Index de la carte actuellement affichée dans representativeCards */
  representativeIndex?: number
  /** Rétrocompat: URL et id de la carte affichée (dérivés si representativeCards existe) */
  imageUrl?: string
  representativeCardId?: number
  /** En phase 1 : true si l'archétype a été éliminé */
  eliminated?: boolean
}

/** Phase du tournoi */
export type TournamentPhase = 'phase1' | 'phase2' | 'phase3' | 'finished'

export interface TournamentState {
  runId: string
  createdAt: string
  seed: number
  phase: TournamentPhase
  /** 0 = mode 4→3→2 (tous passent). Sinon seuil phase1→phase2 ancien mode. */
  phase2Threshold: number
  archetypes: Record<string, ArchetypeState>
  /** Phase 1 : pool restant. Phase 2 (3-way) : perdants phase 1. Phase 3 : finalistes (Suisse). */
  remainingNames: string[]
  /** Mode 4→3→2 : gagnants des duels 4 (phase 1). */
  winnersPhase1?: string[]
  /** Mode 4→3→2 : perdants des duels 4 (affrontés en 3 en phase 2). */
  losersPhase1?: string[]
  /** Mode 4→3→2 : gagnants des duels 3 (phase 2). */
  winnersPhase2?: string[]
  /** Paires déjà jouées (phase 3 Suisse). Clé "A|B" avec A < B. */
  matchesPlayed: string[]
  /** Match en cours : 4-way [n1..n4], 3-way [n1,n2,n3], ou 1v1 [n1,n2] */
  currentMatch: string[] | null
  round: number
  initialPoolSize?: number
  eloHistory?: number[][]
  convergenceRounds?: number
  /** Dernier choix (pour undo). */
  lastMatchResult?: {
    phase: 'phase1' | 'phase2' | 'phase2_3way'
    match: string[]
    winner: string
    losers?: string[]
    loser?: string
  }
}

export const INITIAL_ELO = 1000
export const K_FACTOR = 24
/** Nombre de duels 1v1 avant d’afficher le Top 10. Mode unique : tout le pool, duels aléatoires. */
/** Phase 1 (couverture) : duels 1v1 pour maximiser la couverture du pool. */
export const COVERAGE_ROUNDS = 60
/** Phase 2 (Suisse) : top N par Elo pour le tournoi suisse. */
export const SWISS_POOL_SIZE = 24
/** Nombre de rounds suisses. */
export const SWISS_ROUNDS = 4
/** Dernier round de la phase 2 (Suisse). */
export const SWISS_PHASE2_END_ROUND =
  COVERAGE_ROUNDS + (SWISS_POOL_SIZE * SWISS_ROUNDS) / 2
/** Seuil pour l’ancien mode phase1→phase2 (si réutilisé). */
export const PHASE2_THRESHOLD_DEFAULT = 8
export const CONVERGENCE_WINDOW = 20
export const CONVERGENCE_MAX_AVG_CHANGE = 2
