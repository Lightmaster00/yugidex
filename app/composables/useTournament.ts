import type { TournamentState, RepresentativeCard } from '~/types/tournament'
import { loadRepresentativesForArchetype } from '~/composables/useYgoApi'
import { getNextMatchSwiss } from '~/utils/matchmaking'
import {
  createInitialState as createInitialStateImpl,
  applyGroupResult,
  applyEloResult,
  isPhase3Done,
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
    next.phasePool = state.phasePool.filter(n => n !== archetypeName)
    if (state.currentMatch?.includes(archetypeName)) next.currentMatch = null
    // Retirer des groupes pré-calculés
    if (next.currentRoundGroups) {
      next.currentRoundGroups = next.currentRoundGroups
        .map(g => g.filter(n => n !== archetypeName))
        .filter(g => g.length >= 2)
      next.groupsTotal = next.currentRoundGroups.length
    }
    return next
  }

  /** Détermine l'attribut et la race dominants parmi les cartes représentatives (monstres uniquement). */
  function computeDominants (cards: RepresentativeCard[]): { dominantAttribute?: string; dominantRace?: string } {
    const monsters = cards.filter(c => c.category === 'extra' || c.category === 'main')
    if (!monsters.length) return {}
    const attrCount = new Map<string, number>()
    const raceCount = new Map<string, number>()
    for (const c of monsters) {
      if (c.attribute) attrCount.set(c.attribute, (attrCount.get(c.attribute) ?? 0) + 1)
      if (c.race) raceCount.set(c.race, (raceCount.get(c.race) ?? 0) + 1)
    }
    const dominantAttribute = attrCount.size
      ? [...attrCount.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      : undefined
    const dominantRace = raceCount.size
      ? [...raceCount.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      : undefined
    return { dominantAttribute, dominantRace }
  }

  /** Charge les cartes représentatives si pas encore en cache. Si pas d'images, supprime l'archétype. */
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
    const { dominantAttribute, dominantRace } = computeDominants(res.representativeCards)
    const next = { ...state, archetypes: { ...state.archetypes } }
    next.archetypes[archetypeName] = {
      ...state.archetypes[archetypeName],
      representativeCards: res.representativeCards,
      representativeIndex: res.representativeIndex,
      imageUrl: cur?.imageUrl,
      representativeCardId: cur?.id,
      dominantAttribute,
      dominantRace
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
    getTop10,
    exportTop10Csv,
    downloadTop10Csv
  }
}
