import type { TournamentState } from '~/types/tournament'
import { PHASE2_THRESHOLD_DEFAULT } from '~/types/tournament'
import { loadRepresentativesForArchetype } from '~/composables/useYgoApi'
import { getNextMatch } from '~/utils/matchmaking'
import {
  createInitialState as createInitialStateImpl,
  getNextMatchPhase1,
  getNextMatchPhase2_3way,
  applyPhase1Result,
  applyPhase2_3wayResult,
  applyEloResult,
  hasConverged,
  undoLastResult,
  saveState,
  loadState,
  clearState
} from '~/utils/state'
import { downloadTop10Csv, getTop10, exportTop10Csv } from '~/utils/csv'
import { fetchArchetypes, filterArchetypesWithEnoughRepresentatives } from '~/composables/useYgoApi'
const RATE_LIMIT_MS = 60

function delay (ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export function useTournament () {
  /** Retire un archétype du state (sans images = on le supprime). */
  function removeArchetypeFromState (
    state: TournamentState,
    archetypeName: string
  ): TournamentState {
    const next = { ...state, archetypes: { ...state.archetypes } }
    delete next.archetypes[archetypeName]
    next.remainingNames = state.remainingNames.filter(n => n !== archetypeName)
    if (next.winnersPhase1) next.winnersPhase1 = next.winnersPhase1.filter(n => n !== archetypeName)
    if (next.losersPhase1) next.losersPhase1 = next.losersPhase1.filter(n => n !== archetypeName)
    if (next.winnersPhase2) next.winnersPhase2 = next.winnersPhase2.filter(n => n !== archetypeName)
    if (state.currentMatch?.includes(archetypeName)) next.currentMatch = null
    return next
  }

  /** Charge les 3–4 cartes emblématiques + index aléatoire si pas encore en cache. Si pas d'images, supprime l'archétype. */
  async function ensureRepresentative (
    state: TournamentState,
    archetypeName: string
  ): Promise<TournamentState> {
    const entry = state.archetypes[archetypeName]
    if (entry?.representativeCards?.length) return state
    await delay(RATE_LIMIT_MS)
    const res = await loadRepresentativesForArchetype(archetypeName)
    if (!res) return removeArchetypeFromState(state, archetypeName)
    const cur = res.representativeCards[res.representativeIndex] ?? res.representativeCards[0]
    const next = { ...state, archetypes: { ...state.archetypes } }
    next.archetypes[archetypeName] = {
      ...state.archetypes[archetypeName],
      representativeCards: res.representativeCards,
      representativeIndex: res.representativeIndex,
      imageUrl: cur.imageUrl,
      representativeCardId: cur.id
    }
    return next
  }

  /** Passe à l'image suivante parmi les représentatives d'un archétype. */
  function cycleRepresentative (
    state: TournamentState,
    archetypeName: string
  ): TournamentState {
    const entry = state.archetypes[archetypeName]
    const cards = entry?.representativeCards
    if (!cards?.length) return state
    const idx = (entry.representativeIndex ?? 0) + 1
    const nextIndex = idx % cards.length
    const cur = cards[nextIndex]!
    const next = { ...state, archetypes: { ...state.archetypes } }
    next.archetypes[archetypeName] = {
      ...entry,
      representativeIndex: nextIndex,
      imageUrl: cur.imageUrl,
      representativeCardId: cur.id
    }
    return next
  }

  /** Assure les images pour une liste d'archétypes (séquentiel pour rate limit). */
  async function ensureRepresentatives (
    state: TournamentState,
    names: string[]
  ): Promise<TournamentState> {
    let s = state
    for (const n of names) {
      s = await ensureRepresentative(s, n)
    }
    return s
  }

  return {
    fetchArchetypes,
    filterArchetypesWithEnoughRepresentatives,
    createInitialState: (
      names: string[],
      seed?: number,
      phase2Threshold: number = PHASE2_THRESHOLD_DEFAULT
    ) =>
      createInitialStateImpl(
        names,
        seed ?? Math.floor(Math.random() * 1e6),
        phase2Threshold
      ),
    getNextMatchPhase1,
    getNextMatchPhase2_3way,
    getNextMatch,
    applyPhase1Result,
    applyPhase2_3wayResult,
    applyEloResult,
    hasConverged,
    undoLastResult,
    saveState,
    loadState,
    clearState,
    ensureRepresentative,
    ensureRepresentatives,
    cycleRepresentative,
    getTop10,
    exportTop10Csv,
    downloadTop10Csv
  }
}
