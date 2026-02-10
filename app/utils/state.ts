import type { TournamentState, ArchetypeState } from '~/types/tournament'
import {
  INITIAL_ELO,
  COVERAGE_ROUND_COUNT,
  REFINEMENT_POOL_FRACTION,
  SWISS_POOL_SIZE,
  SWISS_ROUND_COUNT,
  K_GROUP_DAMPENED,
  K_GROUP_FULL,
  K_SWISS
} from '~/types/tournament'
import { applyElo, applyGroupElo } from '~/utils/elo'
import { matchKey, buildCoverageGroups, buildEloProximityGroups, getNextMatchSwiss } from '~/utils/matchmaking'

const STORAGE_KEY = 'yugidex-tournament'

function uuid (): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/x/g, () =>
    ((Math.random() * 16) | 0).toString(16)
  )
}

/** Fisher-Yates shuffle with seed (for reproducibility). */
export function seededShuffle<T> (arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Creates initial state and pre-computes groups for the first round of Phase 1.
 */
export function createInitialState (
  archetypeNames: string[],
  seed: number
): TournamentState {
  const archetypes: Record<string, ArchetypeState> = {}
  for (const name of archetypeNames) {
    archetypes[name] = {
      elo: INITIAL_ELO,
      wins: 0,
      losses: 0
    }
  }
  const pool = [...archetypeNames]
  const groups = buildCoverageGroups(pool, archetypes, seed)
  return {
    runId: uuid(),
    createdAt: new Date().toISOString(),
    seed,
    phase: 'phase1',
    archetypes,
    remainingNames: pool,
    matchesPlayed: [],
    currentMatch: null,
    round: 0,
    initialPoolSize: archetypeNames.length,
    phaseRound: 0,
    groupsCompleted: 0,
    groupsTotal: groups.length,
    currentRoundGroups: groups,
    phasePool: pool
  }
}

/** Returns the top N archetypes sorted by Elo desc. */
export function getTopByElo (
  archetypes: Record<string, ArchetypeState>,
  pool: string[],
  count: number
): string[] {
  return [...pool]
    .sort((a, b) => (archetypes[b]?.elo ?? 0) - (archetypes[a]?.elo ?? 0))
    .slice(0, count)
}

/**
 * Applies the result of a group (phase 1 or 2).
 * Returns the new state with phase/round transition if needed.
 */
export function applyGroupResult (
  state: TournamentState,
  winner: string,
  losers: string[]
): TournamentState {
  const K = state.phase === 'phase1' ? K_GROUP_DAMPENED : K_GROUP_FULL
  const winnerEntry = state.archetypes[winner]!
  const loserElos = losers.map(l => state.archetypes[l]?.elo ?? INITIAL_ELO)
  const { newWinner, newLosers } = applyGroupElo(winnerEntry.elo, loserElos, K)

  const nextArchetypes = { ...state.archetypes }
  const eloDelta: { name: string; delta: number }[] = []

  nextArchetypes[winner] = {
    ...winnerEntry,
    elo: newWinner,
    wins: winnerEntry.wins + 1
  }
  eloDelta.push({ name: winner, delta: newWinner - winnerEntry.elo })

  for (let i = 0; i < losers.length; i++) {
    const l = losers[i]!
    const entry = state.archetypes[l]!
    nextArchetypes[l] = {
      ...entry,
      elo: newLosers[i]!,
      losses: entry.losses + 1
    }
    eloDelta.push({ name: l, delta: newLosers[i]! - entry.elo })
  }

  const groupsCompleted = state.groupsCompleted + 1
  const willAdvance = groupsCompleted >= state.groupsTotal
  const next: TournamentState = {
    ...state,
    archetypes: nextArchetypes,
    round: state.round + 1,
    groupsCompleted,
    currentMatch: null,
    lastMatchResult: {
      phase: state.phase as 'phase1' | 'phase2',
      match: [...(state.currentMatch ?? [])],
      winner,
      losers: [...losers],
      eloDelta,
      // Snapshot for restore on phase/round transition undo
      ...(willAdvance ? {
        prevGroups: state.currentRoundGroups,
        prevPhasePool: [...state.phasePool],
        prevGroupsTotal: state.groupsTotal,
        prevPhaseRound: state.phaseRound
      } : {})
    }
  }

  // Round finished?
  if (willAdvance) {
    return advanceToNextPhaseRound(next)
  }
  return next
}

/**
 * Advances to the next round or next phase when the current round is finished.
 */
export function advanceToNextPhaseRound (state: TournamentState): TournamentState {
  const next = { ...state }

  if (state.phase === 'phase1') {
    const nextPhaseRound = state.phaseRound + 1
    if (nextPhaseRound >= COVERAGE_ROUND_COUNT) {
      // → Phase 2: top 50%, groups of 3 (theme / Elo proximity)
      const poolSize = Math.max(4, Math.ceil(state.remainingNames.length * REFINEMENT_POOL_FRACTION))
      const pool = getTopByElo(state.archetypes, state.remainingNames, poolSize)
      const groups = buildEloProximityGroups(pool, state.archetypes, state.seed + 5000, 3)
      next.phase = 'phase2'
      next.phaseRound = 0
      next.groupsCompleted = 0
      next.groupsTotal = groups.length
      next.currentRoundGroups = groups
      next.phasePool = pool
      return next
    }
    // Next round in phase 1: groups by Elo proximity
    const groups = buildEloProximityGroups(
      state.remainingNames,
      state.archetypes,
      state.seed + nextPhaseRound * 1000
    )
    next.phaseRound = nextPhaseRound
    next.groupsCompleted = 0
    next.groupsTotal = groups.length
    next.currentRoundGroups = groups
    return next
  }

  if (state.phase === 'phase2') {
    // → Phase 3: top 24 Swiss
    const poolSize = Math.min(SWISS_POOL_SIZE, state.phasePool.length)
    const pool = getTopByElo(state.archetypes, state.phasePool, poolSize)
    next.phase = 'phase3'
    next.phaseRound = 0
    next.groupsCompleted = 0
    next.groupsTotal = 0
    next.currentRoundGroups = null
    next.phasePool = pool
    next.matchesPlayed = []
    return next
  }

  return state
}

/** Applies the result of a 1v1 duel (Phase 3 Swiss). */
export function applyEloResult (
  state: TournamentState,
  winner: string,
  loser: string
): TournamentState {
  const w = state.archetypes[winner] ?? { elo: INITIAL_ELO, wins: 0, losses: 0 }
  const l = state.archetypes[loser] ?? { elo: INITIAL_ELO, wins: 0, losses: 0 }
  const { newWinner, newLoser } = applyElo(w.elo, l.elo, K_SWISS)

  const nextArchetypes = { ...state.archetypes }
  nextArchetypes[winner] = { ...w, elo: newWinner, wins: w.wins + 1 }
  nextArchetypes[loser] = { ...l, elo: newLoser, losses: l.losses + 1 }

  const eloDelta = [
    { name: winner, delta: newWinner - w.elo },
    { name: loser, delta: newLoser - l.elo }
  ]

  return {
    ...state,
    archetypes: nextArchetypes,
    matchesPlayed: [...state.matchesPlayed, matchKey(winner, loser)],
    round: state.round + 1,
    currentMatch: null,
    lastMatchResult: {
      phase: 'phase3',
      match: [...(state.currentMatch ?? [])],
      winner,
      loser,
      eloDelta
    }
  }
}

/** Checks if Phase 3 is done (Swiss round count reached). */
export function isPhase3Done (state: TournamentState): boolean {
  if (state.phase !== 'phase3') return false
  const pool = state.phasePool
  const matchesPerRound = Math.floor(pool.length / 2)
  if (matchesPerRound === 0) return true
  const totalSwissMatches = matchesPerRound * SWISS_ROUND_COUNT
  return state.matchesPlayed.length >= totalSwissMatches
}

/** Cancels the last choice. Returns the reverted state or null if nothing to undo. */
export function undoLastResult (state: TournamentState): TournamentState | null {
  const last = state.lastMatchResult
  if (!last) return null

  const prev: TournamentState = {
    ...state,
    archetypes: { ...state.archetypes },
    lastMatchResult: undefined,
    round: Math.max(0, state.round - 1)
  }

  // Restore Elo via saved deltas
  if (last.eloDelta) {
    for (const { name, delta } of last.eloDelta) {
      const entry = state.archetypes[name]
      if (entry) {
        prev.archetypes[name] = { ...entry, elo: entry.elo - delta }
      }
    }
  }

  if ((last.phase === 'phase1' || last.phase === 'phase2') && last.losers) {
    // Undo group result
    prev.archetypes[last.winner] = {
      ...prev.archetypes[last.winner]!,
      wins: Math.max(0, prev.archetypes[last.winner]!.wins - 1)
    }
    for (const l of last.losers) {
      prev.archetypes[l] = {
        ...prev.archetypes[l]!,
        losses: Math.max(0, prev.archetypes[l]!.losses - 1)
      }
    }
    // Restore current match and decrement groupsCompleted
    prev.currentMatch = last.match
    // If we had moved to the next phase, restore from snapshot
    if (state.phase !== last.phase && last.prevGroups !== undefined) {
      prev.phase = last.phase
      prev.currentRoundGroups = last.prevGroups
      prev.phasePool = last.prevPhasePool ?? state.phasePool
      prev.groupsTotal = last.prevGroupsTotal ?? state.groupsTotal
      prev.phaseRound = last.prevPhaseRound ?? 0
      prev.groupsCompleted = (last.prevGroupsTotal ?? 1) - 1
    } else if (state.phase !== last.phase) {
      // Fallback : pas de snapshot (ancien format localStorage)
      prev.phase = last.phase
      prev.phasePool = state.phase === 'phase2' ? state.remainingNames : state.phasePool
      prev.groupsCompleted = Math.max(0, state.groupsCompleted - 1)
      if (last.phase === 'phase1') {
        prev.phaseRound = Math.max(0, (state.phase === 'phase2' ? COVERAGE_ROUND_COUNT : state.phaseRound) - 1)
      }
    } else {
      prev.groupsCompleted = Math.max(0, state.groupsCompleted - 1)
    }
    return prev
  }

  if (last.phase === 'phase3' && last.loser) {
    // Undo 1v1 Swiss
    prev.archetypes[last.winner] = {
      ...prev.archetypes[last.winner]!,
      wins: Math.max(0, prev.archetypes[last.winner]!.wins - 1)
    }
    prev.archetypes[last.loser] = {
      ...prev.archetypes[last.loser]!,
      losses: Math.max(0, prev.archetypes[last.loser]!.losses - 1)
    }
    prev.matchesPlayed = state.matchesPlayed.slice(0, -1)
    prev.currentMatch = last.match
    // If we had moved to 'finished', go back to phase3
    if (state.phase === 'finished') {
      prev.phase = 'phase3'
    }
    return prev
  }

  return null
}

export function saveState (state: TournamentState): void {
  if (import.meta.client) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }
}

export function loadState (): TournamentState | null {
  if (import.meta.client) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as TournamentState
    } catch {
      return null
    }
  }
  return null
}

export function clearState (): void {
  if (import.meta.client) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }
}
