/** Card category in the representative slot (monsters only for 5+5). */
export type RepresentativeCategory = 'extra' | 'main' | 'spell' | 'trap'

/** A representative card — artwork display only (image_url_cropped). */
export interface RepresentativeCard {
  id: number
  /** Cropped image URL (artwork only, no frame or stats). */
  imageUrl: string
  /** Category: main / extra for the 5+5 grid. */
  category?: 'main' | 'extra'
  /** Type displayed under the name (Fusion, Synchro, Xyz, Link, Main, Pendulum, etc.). */
  displayType?: string
}

import type { ExtraPolicy, ArchetypeProfile } from '~/types/ranking'
export type { ExtraPolicy, ArchetypeProfile } from '~/types/ranking'

/** Archetype data in tournament state (aesthetic preference). */
export interface ArchetypeState {
  elo: number
  wins: number
  losses: number
  /** 5 Main + 5 Extra (artworks only), stable order. */
  representativeCards?: RepresentativeCard[]
  /** Index of the card currently displayed (cycle when not in match). */
  representativeIndex?: number
  /** Extra Deck tag: No Extra / Fusion / Synchro / Xyz / Link. */
  extraPolicy?: ExtraPolicy
  /** Aesthetic profile (race, attribute, nameTokens) for similarity. */
  profile?: ArchetypeProfile
  /** Backward compat */
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
  /** All archetype names in the tournament */
  remainingNames: string[]
  /** Pairs already played (Phase 3 Swiss). Key "A|B" with A < B. */
  matchesPlayed: string[]
  /** Current match: 4-way [n1..n4] or 1v1 [n1,n2] */
  currentMatch: string[] | null
  /** Global round (incremented on each choice) */
  round: number
  /** Pool size at start */
  initialPoolSize?: number

  /** Sub-round in current phase (0-indexed) */
  phaseRound: number
  /** Number of groups resolved in the current round */
  groupsCompleted: number
  /** Total number of groups in the current round */
  groupsTotal: number
  /** Pre-computed groups for the current round (phase 1/2) */
  currentRoundGroups: string[][] | null
  /** Archetype pool for the current phase (subset of remainingNames) */
  phasePool: string[]

  /** Last choice (for undo) */
  lastMatchResult?: {
    phase: 'phase1' | 'phase2' | 'phase3'
    match: string[]
    winner: string
    losers?: string[]
    loser?: string
    /** Elo deltas applied (for exact undo) */
    eloDelta?: { name: string; delta: number }[]
    /** Snapshot for restore on phase transition undo */
    prevGroups?: string[][] | null
    prevPhasePool?: string[]
    prevGroupsTotal?: number
    prevPhaseRound?: number
  }
}

/** Elo initial */
export const INITIAL_ELO = 1000

/** Phase 1: 2 coverage rounds (groups of 4, full pool) */
export const COVERAGE_ROUND_COUNT = 2
/** Phase 2: fraction of pool retained (top 50%) */
export const REFINEMENT_POOL_FRACTION = 0.5
/** Phase 3: Swiss pool size (24 finalists) */
export const SWISS_POOL_SIZE = 24
/** Phase 3: number of Swiss rounds */
export const SWISS_ROUND_COUNT = 3

/** K-factor for phase 1 groups (dampened: K=32 × 0.5) */
export const K_GROUP_DAMPENED = 16
/** K-factor for phase 2 groups (full) */
export const K_GROUP_FULL = 32
/** K-factor for phase 3 1v1 duels */
export const K_SWISS = 32
