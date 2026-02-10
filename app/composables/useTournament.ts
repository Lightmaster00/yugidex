import type { TournamentState, RepresentativeCard } from '~/types/tournament'
import { loadRepresentativesForArchetype, fetchAndAnalyzeArchetypes } from '~/composables/useYgoApi'
import { getNextMatchSwiss } from '~/utils/matchmaking'
import {
  createInitialState as createInitialStateImpl,
  applyGroupResult,
  applyEloResult,
  isPhase3Done,
  undoLastResult,
  advanceToNextPhaseRound,
  saveState,
  loadState,
  clearState
} from '~/utils/state'
import { downloadTop10Csv, getTop10 } from '~/utils/csv'

export function useTournament () {
  /** Removes an archetype from state (no images = we delete it). */
  function removeArchetypeFromState (
    state: TournamentState,
    archetypeName: string
  ): TournamentState {
    const next = { ...state, archetypes: { ...state.archetypes } }
    delete next.archetypes[archetypeName]
    next.remainingNames = state.remainingNames.filter(n => n !== archetypeName)
    next.phasePool = state.phasePool.filter(n => n !== archetypeName)
    if (state.currentMatch?.includes(archetypeName)) next.currentMatch = null
    // Remove from pre-computed groups
    if (next.currentRoundGroups) {
      next.currentRoundGroups = next.currentRoundGroups
        .map(g => g.filter(n => n !== archetypeName))
        .filter(g => g.length >= 2)
      next.groupsTotal = next.currentRoundGroups.length
    }
    return next
  }

  /** Applies the result of a representative load to state (one archetype). */
  function applyRepresentativeResult (
    state: TournamentState,
    archetypeName: string,
    res: Awaited<ReturnType<typeof loadRepresentativesForArchetype>>
  ): TournamentState {
    if (!res?.representativeCards?.length) return removeArchetypeFromState(state, archetypeName)
    const cur = res.representativeCards[res.representativeIndex ?? 0] ?? res.representativeCards[0]
    const dominantAttribute = res.profile
      ? Object.entries(res.profile.attributeHistogram).sort((a, b) => b[1] - a[1])[0]?.[0]
      : undefined
    const dominantRace = res.profile
      ? Object.entries(res.profile.raceHistogram).sort((a, b) => b[1] - a[1])[0]?.[0]
      : undefined
    const next = { ...state, archetypes: { ...state.archetypes } }
    next.archetypes[archetypeName] = {
      ...state.archetypes[archetypeName],
      representativeCards: res.representativeCards,
      representativeIndex: res.representativeIndex,
      extraPolicy: res.extraPolicy,
      profile: res.profile,
      imageUrl: cur.imageUrl,
      representativeCardId: cur.id,
      dominantAttribute: dominantAttribute !== '_' ? dominantAttribute : undefined,
      dominantRace: dominantRace !== '_' ? dominantRace : undefined
    }
    return next
  }

  /** Loads representative cards (5+5) if not yet cached. If no images, removes the archetype. */
  async function ensureRepresentative (
    state: TournamentState,
    archetypeName: string
  ): Promise<TournamentState> {
    const entry = state.archetypes[archetypeName]
    if (entry?.representativeCards?.length) return state
    const res = await loadRepresentativesForArchetype(archetypeName)
    return applyRepresentativeResult(state, archetypeName, res)
  }

  /** Moves to the next image among the 10 representatives (5 Main + 5 Extra). */
  function cycleRepresentative (
    state: TournamentState,
    archetypeName: string
  ): TournamentState {
    const entry = state.archetypes[archetypeName]
    const cards = entry?.representativeCards
    if (!cards?.length) return state
    const currentIdx = entry.representativeIndex ?? 0
    const nextIndex = (currentIdx + 1) % cards.length
    const cur = cards[nextIndex]
    if (!cur) return state
    const next = { ...state, archetypes: { ...state.archetypes } }
    next.archetypes[archetypeName] = {
      ...entry,
      representativeIndex: nextIndex,
      imageUrl: cur.imageUrl,
      representativeCardId: cur.id
    }
    return next
  }

  /** Ensures images for a list of archetypes (parallel load). */
  async function ensureRepresentatives (
    state: TournamentState,
    names: string[]
  ): Promise<TournamentState> {
    const toLoad = names.filter(n => !state.archetypes[n]?.representativeCards?.length)
    if (toLoad.length === 0) return state
    const results = await Promise.all(
      toLoad.map(async (n) => {
        const res = await loadRepresentativesForArchetype(n)
        return { name: n, res }
      })
    )
    let s = state
    for (const { name, res } of results) {
      s = applyRepresentativeResult(s, name, res)
    }
    return s
  }

  return {
    fetchAndAnalyzeArchetypes,
    createInitialState: (names: string[], seed?: number) =>
      createInitialStateImpl(names, seed ?? Math.floor(Math.random() * 1e6)),
    getNextMatchSwiss,
    applyGroupResult,
    applyEloResult,
    isPhase3Done,
    undoLastResult,
    saveState,
    loadState,
    clearState,
    ensureRepresentative,
    ensureRepresentatives,
    cycleRepresentative,
    advanceToNextPhaseRound,
    getTop10,
    downloadTop10Csv
  }
}
