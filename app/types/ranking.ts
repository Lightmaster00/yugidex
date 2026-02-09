/**
 * Types pour le classement par préférence esthétique (artworks uniquement).
 * Pas de puissance compétitive, meta, popularité ou cohérence mécanique.
 */

/** Politique Extra Deck de l'archétype (pour matchmaking et tag affichage). */
export type ExtraPolicy = 'none' | 'fusion' | 'synchro' | 'xyz' | 'link' | 'mixed'

/** Un vote brut : A préféré à B (visuellement). */
export interface Vote {
  winnerId: string
  loserId: string
  timestamp: string
}

/** État du classement personnel (stockage local). */
export interface PersonalRankingState {
  userId: string
  votes: Vote[]
}

/** Profil esthétique d'un archétype (pas d'ATK/DEF, date, popularité, meta). */
export interface ArchetypeProfile {
  /** IDs des 5 monstres Main Deck représentatifs (ordre stable). */
  topMainIds: number[]
  /** IDs des 5 monstres Extra Deck (vide si noExtra). */
  topExtraIds: number[]
  noExtra: boolean
  raceHistogram: Record<string, number>
  attributeHistogram: Record<string, number>
  nameTokens: string[]
}
