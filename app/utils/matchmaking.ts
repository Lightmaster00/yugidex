import type { TournamentState } from '~/types/tournament'
import { seededShuffle } from '~/utils/state'

/** Clé normalisée pour une paire (ordre alphabétique). */
export function matchKey (a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Phase 1 couverture (phase2Threshold === 0) : 2 archétypes,
 * priorité à ceux qui ont le moins joué pour maximiser la couverture.
 */
function getNextMatchCoverage (state: TournamentState): [string, string] | null {
  const names = Object.keys(state.archetypes)
  if (names.length < 2) return null

  const games = (n: string) => (state.archetypes[n]?.wins ?? 0) + (state.archetypes[n]?.losses ?? 0)
  const byGames = [...names].sort((a, b) => games(a) - games(b))
  const minGames = games(byGames[0]!)
  const leastSeen = byGames.filter(n => games(n) <= minGames + 1)
  const pool = leastSeen.length >= 2 ? leastSeen : names
  const shuffled = seededShuffle(pool, state.seed + state.round * 7919)
  const a = shuffled[0]!
  let b = shuffled[1]
  if (b === a) b = shuffled.find(x => x !== a) ?? shuffled[1]!
  return [a, b]
}

/**
 * Pairing type Suisse : remainingNames triés par score puis Elo, paires de niveau proche, pas de re-match.
 */
function getNextMatchSwiss (state: TournamentState): [string, string] | null {
  const names = state.remainingNames.filter(
    n => !state.archetypes[n]?.eliminated
  )
  if (names.length < 2) return null

  const playedSet = new Set(state.matchesPlayed)
  const sorted = [...names].sort((a, b) => {
    const entryA = state.archetypes[a]
    const entryB = state.archetypes[b]
    const scoreA = (entryA?.wins ?? 0) - (entryA?.losses ?? 0)
    const scoreB = (entryB?.wins ?? 0) - (entryB?.losses ?? 0)
    if (scoreB !== scoreA) return scoreB - scoreA
    return (entryB?.elo ?? 1000) - (entryA?.elo ?? 1000)
  })

  const tolerances = [0, 1, 2, 3, 10, Infinity]
  for (const scoreTol of tolerances) {
    for (let i = 0; i < sorted.length; i++) {
      const scoreI = (state.archetypes[sorted[i]]?.wins ?? 0) - (state.archetypes[sorted[i]]?.losses ?? 0)
      for (let j = i + 1; j < sorted.length; j++) {
        const scoreJ = (state.archetypes[sorted[j]]?.wins ?? 0) - (state.archetypes[sorted[j]]?.losses ?? 0)
        if (Math.abs(scoreI - scoreJ) > scoreTol) continue
        const key = matchKey(sorted[i], sorted[j])
        if (!playedSet.has(key)) return [sorted[i], sorted[j]]
      }
    }
  }
  return null
}

/**
 * Phase 1 couverture (phase2Threshold===0) ou phase 3 Suisse. Phase 2 en mode 4→3→2 = 3-way (getNextMatchPhase2_3way dans state).
 */
export function getNextMatch (state: TournamentState): [string, string] | null {
  if (state.phase2Threshold === 0 && state.phase === 'phase1') return getNextMatchCoverage(state)
  if (state.phase === 'phase2' && state.phase2Threshold === 0) return null
  if (state.phase === 'phase2' || state.phase === 'phase3') return getNextMatchSwiss(state)
  return null
}
