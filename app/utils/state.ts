import type { TournamentState, ArchetypeState } from '~/types/tournament'
import {
  INITIAL_ELO,
  PHASE2_THRESHOLD_DEFAULT,
  CONVERGENCE_WINDOW,
  CONVERGENCE_MAX_AVG_CHANGE
} from '~/types/tournament'
import { applyElo } from '~/utils/elo'
import { getNextMatch as getNextMatch1v1, matchKey } from '~/utils/matchmaking'

const STORAGE_KEY = 'yugidex-tournament'

function uuid (): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/x/g, () =>
    ((Math.random() * 16) | 0).toString(16)
  )
}

/**
 * Crée l'état initial.
 * Si phase2Threshold === 0 : mode unique (duels 1v1 fixe, pool complet), phase = 'phase2' dès le départ.
 */
export function createInitialState (
  archetypeNames: string[],
  seed: number,
  phase2Threshold: number = PHASE2_THRESHOLD_DEFAULT
): TournamentState {
  const archetypes: Record<string, ArchetypeState> = {}
  for (const name of archetypeNames) {
    archetypes[name] = {
      elo: INITIAL_ELO,
      wins: 0,
      losses: 0,
      eliminated: false
    }
  }
  const base: TournamentState = {
    runId: uuid(),
    createdAt: new Date().toISOString(),
    seed,
    phase: 'phase1',
    phase2Threshold,
    archetypes,
    remainingNames: [...archetypeNames],
    matchesPlayed: [],
    currentMatch: null,
    round: 0,
    initialPoolSize: archetypeNames.length,
    eloHistory: [],
    convergenceRounds: CONVERGENCE_WINDOW
  }
  if (phase2Threshold === 0) {
    base.winnersPhase1 = []
    base.losersPhase1 = []
    base.winnersPhase2 = []
  }
  return base
}

/** Mélange Fisher-Yates avec seed (pour reproductibilité). */
export function seededShuffle<T> (arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Prochain match phase 1 : 4 archétypes (ou 3 en mode 4→3→2 si reste 3). Si <3 restants, null. */
export function getNextMatchPhase1 (state: TournamentState): string[] | null {
  const pool = state.remainingNames.filter(
    n => !state.archetypes[n]?.eliminated
  )
  if (pool.length < 3) return null
  if (state.phase2Threshold !== 0 && pool.length <= 4) return null
  const shuffled = seededShuffle(pool, state.seed + state.round)
  const size = state.phase2Threshold === 0 && pool.length === 3 ? 3 : 4
  return shuffled.slice(0, size)
}

/** Phase 2 en mode 4→3→2 : 3 archétypes (perdants phase 1) tirés au sort. */
export function getNextMatchPhase2_3way (state: TournamentState): string[] | null {
  const pool = state.remainingNames
  if (pool.length < 3) return null
  const shuffled = seededShuffle(pool, state.seed + state.round + 10000)
  return shuffled.slice(0, 3)
}

/** Après un duel 4-way : 1 gagnant, 3 éliminés (ou en mode 4→3→2 : 3 vont en phase 2). */
export function applyPhase1Result (
  state: TournamentState,
  winner: string,
  losers: string[]
): TournamentState {
  const next = { ...state }
  next.archetypes = { ...state.archetypes }
  next.lastMatchResult = {
    phase: 'phase1',
    match: [...(state.currentMatch ?? [])],
    winner,
    losers: [...losers]
  }
  next.round = state.round + 1
  next.currentMatch = null

  if (state.phase2Threshold === 0) {
    next.winnersPhase1 = [...(state.winnersPhase1 ?? []), winner]
    next.losersPhase1 = [...(state.losersPhase1 ?? []), ...losers]
    const toRemove = [winner, ...losers]
    next.remainingNames = state.remainingNames.filter(n => !toRemove.includes(n))
    next.archetypes[winner] = {
      ...state.archetypes[winner],
      wins: (state.archetypes[winner]?.wins ?? 0) + 1
    }
    for (const l of losers) {
      next.archetypes[l] = {
        ...state.archetypes[l],
        losses: (state.archetypes[l]?.losses ?? 0) + 1
      }
    }
    if (next.remainingNames.length === 0 || next.remainingNames.length <= 3) {
      if (next.remainingNames.length > 0) {
        next.losersPhase1 = [...(next.losersPhase1 ?? []), ...next.remainingNames]
        next.remainingNames = []
      }
      next.phase = 'phase2'
      next.remainingNames = [...(next.losersPhase1 ?? [])]
    }
    return next
  }

  next.remainingNames = state.remainingNames.filter(
    n => n !== losers[0] && n !== losers[1] && n !== losers[2]
  )
  next.archetypes[winner] = {
    ...state.archetypes[winner],
    wins: (state.archetypes[winner]?.wins ?? 0) + 1
  }
  for (const l of losers) {
    next.archetypes[l] = {
      ...state.archetypes[l],
      eliminated: true,
      losses: (state.archetypes[l]?.losses ?? 0) + 1
    }
  }
  if (next.remainingNames.length <= state.phase2Threshold) {
    next.phase = 'phase2'
    next.remainingNames = next.remainingNames.filter(
      n => !next.archetypes[n]?.eliminated
    )
  }
  return next
}

/** Après un duel 3-way (phase 2 mode 4→3→2) : 1 gagnant, 2 éliminés. Le gagnant rejoint les finalistes. */
export function applyPhase2_3wayResult (
  state: TournamentState,
  winner: string,
  losers: string[]
): TournamentState {
  const next = { ...state }
  next.archetypes = { ...state.archetypes }
  next.winnersPhase2 = [...(state.winnersPhase2 ?? []), winner]
  next.remainingNames = state.remainingNames.filter(
    n => n !== winner && n !== losers[0] && n !== losers[1]
  )
  next.archetypes[winner] = {
    ...state.archetypes[winner],
    wins: (state.archetypes[winner]?.wins ?? 0) + 1
  }
  for (const l of losers) {
    next.archetypes[l] = {
      ...state.archetypes[l],
      eliminated: true,
      losses: (state.archetypes[l]?.losses ?? 0) + 1
    }
  }
  next.round = state.round + 1
  next.currentMatch = null
  next.lastMatchResult = {
    phase: 'phase2_3way',
    match: [...(state.currentMatch ?? [])],
    winner,
    losers: [...losers]
  }
  if (next.remainingNames.length === 0) {
    next.phase = 'phase3'
    next.remainingNames = [...(next.winnersPhase1 ?? []), ...(next.winnersPhase2 ?? [])]
  }
  return next
}

/** Après un duel 1v1 : applique Elo et enregistre le match. */
export function applyEloResult (
  state: TournamentState,
  winner: string,
  loser: string
): TournamentState {
  const next = { ...state }
  next.archetypes = { ...state.archetypes }
  const w = state.archetypes[winner] ?? { elo: INITIAL_ELO, wins: 0, losses: 0 }
  const l = state.archetypes[loser] ?? { elo: INITIAL_ELO, wins: 0, losses: 0 }
  const { newWinner, newLoser } = applyElo(w.elo, l.elo)
  next.archetypes[winner] = {
    ...w,
    elo: newWinner,
    wins: w.wins + 1
  }
  next.archetypes[loser] = {
    ...l,
    elo: newLoser,
    losses: l.losses + 1
  }
  next.matchesPlayed = [...state.matchesPlayed, matchKey(winner, loser)]
  next.round = state.round + 1
  next.currentMatch = null
  next.lastMatchResult = {
    phase: 'phase2',
    match: [...(state.currentMatch ?? [])],
    winner,
    loser
  }

  const remaining = state.remainingNames
  const eloSnapshot = remaining.map(
    n => next.archetypes[n]?.elo ?? INITIAL_ELO
  )
  next.eloHistory = [...(state.eloHistory ?? []), eloSnapshot].slice(
    -CONVERGENCE_WINDOW
  )
  return next
}

/** Annule le dernier choix (phase 1 ou 2). Retourne l'état réverti ou null si rien à annuler. */
export function undoLastResult (state: TournamentState): TournamentState | null {
  const last = state.lastMatchResult
  if (!last) return null
  const prev = { ...state }
  prev.archetypes = { ...state.archetypes }
  prev.lastMatchResult = undefined

  if (last.phase === 'phase1' && last.losers && last.losers.length >= 2) {
    if (state.phase2Threshold === 0) {
      prev.winnersPhase1 = (state.winnersPhase1 ?? []).slice(0, -1)
      prev.losersPhase1 = (state.losersPhase1 ?? []).slice(0, -last.losers!.length)
      prev.remainingNames = [last.winner, ...last.losers]
    } else {
      prev.remainingNames = [...state.remainingNames, ...last.losers]
    }
    prev.archetypes[last.winner] = {
      ...state.archetypes[last.winner],
      wins: Math.max(0, (state.archetypes[last.winner]?.wins ?? 0) - 1)
    }
    for (const l of last.losers) {
      prev.archetypes[l] = {
        ...state.archetypes[l],
        eliminated: false,
        losses: Math.max(0, (state.archetypes[l]?.losses ?? 0) - 1)
      }
    }
    prev.round = Math.max(0, state.round - 1)
    prev.phase = 'phase1'
    prev.currentMatch = last.match
    return prev
  }

  if (last.phase === 'phase2_3way' && last.losers?.length === 2) {
    prev.winnersPhase2 = (state.winnersPhase2 ?? []).slice(0, -1)
    prev.remainingNames = [...state.remainingNames, last.winner, ...last.losers]
    prev.archetypes[last.winner] = {
      ...state.archetypes[last.winner],
      wins: Math.max(0, (state.archetypes[last.winner]?.wins ?? 0) - 1)
    }
    for (const l of last.losers) {
      prev.archetypes[l] = {
        ...state.archetypes[l],
        eliminated: false,
        losses: Math.max(0, (state.archetypes[l]?.losses ?? 0) - 1)
      }
    }
    prev.round = Math.max(0, state.round - 1)
    prev.phase = 'phase2'
    prev.currentMatch = last.match
    return prev
  }

  if (last.phase === 'phase2' && last.loser) {
    const w = state.archetypes[last.winner]
    const l = state.archetypes[last.loser]
    if (!w || !l) return null
    const eWinner = 1 / (1 + Math.pow(10, (l.elo - w.elo) / 400))
    const eLoser = 1 - eWinner
    const K = 24
    prev.archetypes[last.winner] = {
      ...w,
      elo: Math.round(w.elo - K * (1 - eWinner)),
      wins: Math.max(0, w.wins - 1)
    }
    prev.archetypes[last.loser] = {
      ...l,
      elo: Math.round(l.elo + K * (1 - eWinner)),
      losses: Math.max(0, l.losses - 1)
    }
    prev.matchesPlayed = state.matchesPlayed.slice(0, -1)
    prev.round = Math.max(0, state.round - 1)
    prev.eloHistory = (state.eloHistory ?? []).slice(0, -1)
    prev.currentMatch = last.match
    return prev
  }

  return null
}

/** Vérifie si les Elo ont convergé (variation moyenne faible sur la fenêtre). */
export function hasConverged (state: TournamentState): boolean {
  const history = state.eloHistory ?? []
  if (history.length < 2) return false
  const prev = history[history.length - 2]!
  const curr = history[history.length - 1]!
  if (prev.length !== curr.length) return false
  let sum = 0
  for (let i = 0; i < prev.length; i++) {
    sum += Math.abs((curr[i]! ?? 0) - (prev[i]! ?? 0))
  }
  const avg = prev.length ? sum / prev.length : 0
  return avg <= CONVERGENCE_MAX_AVG_CHANGE
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
