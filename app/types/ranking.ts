/**
 * Types for aesthetic preference ranking (artworks only).
 * No competitive power, meta, popularity or mechanical coherence.
 */

/** Extra Deck policy of the archetype (for matchmaking and display tag). */
export type ExtraPolicy = 'none' | 'fusion' | 'synchro' | 'xyz' | 'link' | 'mixed'

/** A raw vote: A preferred over B (visually). */
export interface Vote {
  winnerId: string
  loserId: string
  timestamp: string
}

/** Personal ranking state (local storage). */
export interface PersonalRankingState {
  userId: string
  votes: Vote[]
}

/** Aesthetic profile of an archetype (no ATK/DEF, date, popularity, meta). */
export interface ArchetypeProfile {
  /** IDs of the 5 representative Main Deck monsters (stable order). */
  topMainIds: number[]
  /** IDs of the 5 Extra Deck monsters (empty if noExtra). */
  topExtraIds: number[]
  noExtra: boolean
  raceHistogram: Record<string, number>
  attributeHistogram: Record<string, number>
  nameTokens: string[]
}
