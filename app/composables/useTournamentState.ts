import { ref, computed } from 'vue'
import type { TournamentState } from '~/types/tournament'
import { useTournament } from '~/composables/useTournament'
import { useCardLanguage, capitalizeArchetypeName, setPartnerMapFromCache, setRepresentativeMapFromCache, setEntityCardIdsFromCache, prefetchRepresentativesForArchetypes, clearRepresentativeResultCacheForNames } from '~/composables/useYgoApi'
import { getCachedValidArchetypes, setCachedValidArchetypes } from '~/utils/archetypeCache'
import { getOrCreateUserId, saveVote } from '~/utils/rankingStorage'

export function useTournamentState () {
  const state = ref<TournamentState | null>(null)
  const loading = ref(true)
  const transitioning = ref(false)
  const error = ref<string | null>(null)
  const {
    fetchAndAnalyzeArchetypes,
    createInitialState,
    getNextMatchSwiss,
    applyGroupResult,
    applyEloResult,
    isPhase3Done,
    undoLastResult,
    saveState: persistState,
    loadState: loadPersisted,
    clearState: clearPersisted,
    ensureRepresentatives,
    cycleRepresentative,
    advanceToNextPhaseRound,
    getTop10,
    downloadTop10Csv
  } = useTournament()

  const top10 = computed(() => (state.value ? getTop10(state.value) : []))
  const canUndo = computed(
    () => !!state.value?.lastMatchResult && state.value.phase !== 'finished'
  )

  const { language: currentLang } = useCardLanguage()
  const MAX_SKIP_RETRIES = 50

  async function loadFromApi () {
    error.value = null
    const lang = currentLang.value

    // ── Check cache first ──
    const cached = await getCachedValidArchetypes(lang)
    if (cached && cached.validNames.length >= 4) {
      setPartnerMapFromCache(cached.partnerMap)
      setRepresentativeMapFromCache(cached.representativeMap)
      setEntityCardIdsFromCache(cached.entityCardMap)
      const seed = Math.floor(Math.random() * 1e6)
      state.value = createInitialState(cached.validNames.map(capitalizeArchetypeName), seed)
      await setNextMatch()
      prefetchNextGroup()
      persistState(state.value!)
      return
    }

    // ── Run the Archetype Intelligence pipeline ──
    let result: Awaited<ReturnType<typeof fetchAndAnalyzeArchetypes>>
    try {
      result = await fetchAndAnalyzeArchetypes()
    } catch {
      error.value = 'Unable to load archetypes. Check your connection.'
      return
    }
    if (result.validNames.length < 4) {
      error.value = 'Not enough archetypes detected (need at least 4).'
      return
    }

    // ── Cache result ──
    await setCachedValidArchetypes(result.validNames, lang, result.partnerMap, result.representativeMap, result.entityCardMap)

    // ── Create tournament ──
    const seed = Math.floor(Math.random() * 1e6)
    state.value = createInitialState(result.validNames.map(capitalizeArchetypeName), seed)
    await setNextMatch()
    prefetchNextGroup()
    persistState(state.value!)
  }

  /** Charge le prochain duel avec images prêtes ; préchargement du groupe suivant minimise l'attente. */
  async function setNextMatch () {
    for (let attempt = 0; attempt < MAX_SKIP_RETRIES; attempt++) {
      const s = state.value
      if (!s) return

      if (s.phase === 'phase1' || s.phase === 'phase2') {
        const groups = s.currentRoundGroups
        if (!groups || s.groupsCompleted >= groups.length) {
          state.value = advanceToNextPhaseRound(s)
          if (state.value?.phase === 'phase2' && state.value.phasePool?.length) {
            clearRepresentativeResultCacheForNames(state.value.phasePool)
          }
          persistState(state.value)
          continue
        }
        const nextGroup = groups[s.groupsCompleted]!
        const validGroup = nextGroup.filter(n => s.archetypes[n] != null)
        if (validGroup.length < 2) {
          state.value = { ...s, groupsCompleted: s.groupsCompleted + 1 }
          continue
        }
        state.value = { ...s, currentMatch: validGroup }
        state.value = await ensureRepresentatives(state.value, validGroup)
        if (state.value?.currentMatch != null && state.value.currentMatch.length >= 2) {
          persistState(state.value)
          prefetchNextGroup()
          return
        }
        state.value = { ...(state.value ?? s), groupsCompleted: s.groupsCompleted + 1 }
        continue
      }

      if (s.phase === 'phase3') {
        if (isPhase3Done(s)) {
          state.value = { ...s, phase: 'finished', currentMatch: null }
          persistState(state.value)
          return
        }
        const next = getNextMatchSwiss(s, s.phasePool)
        if (!next) {
          state.value = { ...s, phase: 'finished', currentMatch: null }
          persistState(state.value)
          return
        }
        state.value = { ...s, currentMatch: next }
        state.value = await ensureRepresentatives(state.value, next)
        if (state.value?.currentMatch != null && state.value.currentMatch.length === 2) {
          persistState(state.value)
          return
        }
        continue
      }

      return
    }
  }

  async function init () {
    loading.value = true
    try {
      const saved = loadPersisted()
      const isFirstDuel = saved?.round === 0 && saved.currentMatch != null
      const hasRestorable =
        saved &&
        (saved.phase === 'finished' ||
          (saved.currentMatch?.length && !isFirstDuel))
      if (hasRestorable) {
        state.value = saved
        if (saved.phase === 'finished') return
        if (saved.currentMatch?.length) return
        await setNextMatch()
        return
      }
    } finally {
      loading.value = false
    }
  }

  /** Prefetch the next group's representatives so the next transition is faster. */
  function prefetchNextGroup () {
    const s = state.value
    if (!s?.currentRoundGroups || s.phase !== 'phase1' && s.phase !== 'phase2') return
    const nextIndex = s.groupsCompleted + 1
    if (nextIndex >= s.currentRoundGroups.length) return
    const nextGroup = s.currentRoundGroups[nextIndex] ?? []
    if (nextGroup.length > 0) prefetchRepresentativesForArchetypes(nextGroup)
  }

  /** Phase 1 & 2: user chooses a winner in a group of 4 (or 2-3). */
  async function pickGroup (winner: string, losers: string[]) {
    if (!state.value || losers.length < 1) return
    getOrCreateUserId()
    for (const loser of losers) saveVote(winner, loser)
    state.value = applyGroupResult(state.value, winner, losers)
    persistState(state.value)
    const showLoaderAfter = setTimeout(() => { transitioning.value = true }, 120)
    try {
      await setNextMatch()
      prefetchNextGroup()
    } finally {
      clearTimeout(showLoaderAfter)
      transitioning.value = false
    }
  }

  /** Phase 3 : duel 1v1 Swiss. */
  async function pickDuel (winner: string, loser: string) {
    if (!state.value) return
    getOrCreateUserId()
    saveVote(winner, loser)
    state.value = applyEloResult(state.value, winner, loser)
    persistState(state.value)
    if (isPhase3Done(state.value)) {
      state.value = { ...state.value, phase: 'finished', currentMatch: null }
      persistState(state.value)
      return
    }
    const showLoaderAfter = setTimeout(() => { transitioning.value = true }, 120)
    try {
      await setNextMatch()
    } finally {
      clearTimeout(showLoaderAfter)
      transitioning.value = false
    }
  }

  function undo () {
    if (!state.value) return
    const reverted = undoLastResult(state.value)
    if (reverted) {
      state.value = reverted
      persistState(state.value)
    }
  }

  function cycleArchetypeImage (archetypeName: string) {
    if (!state.value) return
    state.value = cycleRepresentative(state.value, archetypeName)
    persistState(state.value)
  }

  function finish () {
    if (!state.value) return
    state.value = {
      ...state.value,
      phase: 'finished',
      currentMatch: null
    }
    persistState(state.value)
  }

  function downloadCsv () {
    if (state.value) downloadTop10Csv(state.value)
  }

  const START_TIMEOUT_MS = 90_000

  async function startTournament () {
    loading.value = true
    error.value = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('Loading took too long. Try again (slow connection or busy API).')),
        START_TIMEOUT_MS
      )
    })
    try {
      await Promise.race([loadFromApi(), timeoutPromise])
    } catch (e) {
      error.value = (e as Error)?.message ?? 'An error occurred. Please try again.'
    } finally {
      loading.value = false
    }
  }

  function restart () {
    clearPersisted()
    state.value = null
    error.value = null
    startTournament()
  }

  /** Resets selection: clears the tournament and shows the start screen. */
  function resetToStart () {
    clearPersisted()
    state.value = null
    error.value = null
  }

  return {
    state,
    loading,
    transitioning,
    error,
    top10,
    canUndo,
    init,
    startTournament,
    pickGroup,
    pickDuel,
    finish,
    undo,
    cycleArchetypeImage,
    downloadCsv,
    restart,
    resetToStart
  }
}
