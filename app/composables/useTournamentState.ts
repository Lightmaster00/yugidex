import { ref, computed } from 'vue'
import type { TournamentState } from '~/types/tournament'
import { COVERAGE_ROUNDS } from '~/types/tournament'
import { useTournament } from '~/composables/useTournament'
import { useCardLanguage, ARCHETYPE_BLOCKLIST } from '~/composables/useYgoApi'
import { getCachedValidArchetypes, setCachedValidArchetypes } from '~/utils/archetypeCache'

export function useTournamentState () {
  const state = ref<TournamentState | null>(null)
  const loading = ref(true)
  const transitioning = ref(false)
  const error = ref<string | null>(null)
  const {
    fetchArchetypes,
    filterArchetypesWithEnoughRepresentatives,
    createInitialState,
    getNextMatchPhase1,
    getNextMatchPhase2_3way,
    getNextMatch,
    applyPhase1Result,
    applyPhase2_3wayResult,
    applyEloResult,
    hasConverged,
    undoLastResult,
    saveState: persistState,
    loadState: loadPersisted,
    clearState: clearPersisted,
    ensureRepresentatives,
    cycleRepresentative,
    getTop10,
    downloadTop10Csv
  } = useTournament()

  const top10 = computed(() => (state.value ? getTop10(state.value) : []))
  const canUndo = computed(
    () => !!state.value?.lastMatchResult && state.value.phase !== 'finished'
  )

  const { language: currentLang } = useCardLanguage()
  const LOAD_TIMEOUT_MS = 120_000

  async function loadFromApi () {
    error.value = null
    let validNames: string[] | null = null
    const lang = currentLang.value

    validNames = await getCachedValidArchetypes(lang)
    if (validNames && validNames.length >= 4) {
      const seed = Math.floor(Math.random() * 1e6)
      state.value = createInitialState(validNames, seed, 0)
      await setNextMatch()
      persistState(state.value!)
      return
    }

    let names: string[] = []
    try {
      names = (await fetchArchetypes()).filter(n => !ARCHETYPE_BLOCKLIST.has(n))
    } catch (e) {
      error.value = 'Impossible de charger les archétypes. Vérifiez votre connexion.'
      return
    }
    if (names.length < 4) {
      error.value = 'Not enough archetypes found.'
      return
    }
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS)
    })
    try {
      validNames = await Promise.race([
        filterArchetypesWithEnoughRepresentatives(names),
        timeoutPromise
      ])
    } catch (e) {
      const msg = (e as Error)?.message === 'timeout'
        ? 'Le chargement prend trop de temps. Réessayez (connexion lente ou API occupée).'
        : 'Erreur lors du chargement des archétypes. Réessayez.'
      error.value = msg
      return
    }
    if (validNames.length < 4) {
      error.value = 'Not enough archetypes with valid images (need at least 5 representative cards per archetype).'
      return
    }
    await setCachedValidArchetypes(validNames, lang)
    const seed = Math.floor(Math.random() * 1e6)
    state.value = createInitialState(validNames, seed, 0)
    await setNextMatch()
    persistState(state.value!)
  }

  async function setNextMatch () {
    const s = state.value
    if (!s) return
    if (s.phase === 'phase1') {
      const next = getNextMatchPhase1(s)
      if (!next) {
        if (s.phase2Threshold === 0 && s.remainingNames.length > 0) {
          state.value = {
            ...s,
            losersPhase1: [...(s.losersPhase1 ?? []), ...s.remainingNames],
            remainingNames: [...(s.losersPhase1 ?? []), ...s.remainingNames],
            phase: 'phase2',
            currentMatch: null
          }
        } else {
          state.value = { ...s, phase: 'phase2', remainingNames: s.phase2Threshold === 0 ? [...(s.losersPhase1 ?? [])] : s.remainingNames, currentMatch: null }
        }
        await setNextMatch()
        return
      }
      state.value = { ...s, currentMatch: next }
      state.value = await ensureRepresentatives(state.value, next)
      if (state.value.currentMatch === null) await setNextMatch()
      else persistState(state.value)
      return
    }
    if (s.phase === 'phase2') {
      if (s.phase2Threshold === 0) {
        const next3 = getNextMatchPhase2_3way(s)
        if (!next3) {
          state.value = { ...s, phase: 'phase3', remainingNames: [...(s.winnersPhase1 ?? []), ...(s.winnersPhase2 ?? [])], currentMatch: null }
          await setNextMatch()
          return
        }
        state.value = { ...s, currentMatch: next3 }
        state.value = await ensureRepresentatives(state.value, next3)
        if (state.value.currentMatch === null) await setNextMatch()
        else persistState(state.value)
        return
      }
      const next2 = getNextMatch(s)
      if (!next2) {
        state.value = { ...s, phase: 'finished', currentMatch: null }
        persistState(state.value)
        return
      }
      state.value = { ...s, currentMatch: next2 }
      state.value = await ensureRepresentatives(state.value, next2)
      if (state.value.currentMatch === null) await setNextMatch()
      else persistState(state.value)
      return
    }
    if (s.phase === 'phase3') {
      const next2 = getNextMatch(s)
      if (!next2) {
        state.value = { ...s, phase: 'finished', currentMatch: null }
        persistState(state.value)
        return
      }
      state.value = { ...s, currentMatch: next2 }
      state.value = await ensureRepresentatives(state.value, next2)
      if (state.value.currentMatch === null) await setNextMatch()
      else persistState(state.value)
    }
  }

  async function init () {
    loading.value = true
    try {
      const saved = loadPersisted()
      const isFirstDuel = saved?.round === 0 && (saved.currentMatch?.length === 4)
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

  async function pickPhase1 (winner: string, losers: string[]) {
    if (!state.value || (losers.length !== 3 && losers.length !== 2)) return
    state.value = applyPhase1Result(state.value, winner, losers)
    persistState(state.value)
    transitioning.value = true
    try {
      await setNextMatch()
    } finally {
      transitioning.value = false
    }
  }

  async function pickPhase2_3way (winner: string, losers: string[]) {
    if (!state.value || losers.length !== 2) return
    state.value = applyPhase2_3wayResult(state.value, winner, losers)
    persistState(state.value)
    if (state.value.phase === 'phase3') {
      transitioning.value = true
      try {
        await setNextMatch()
      } finally {
        transitioning.value = false
      }
      return
    }
    transitioning.value = true
    try {
      await setNextMatch()
    } finally {
      transitioning.value = false
    }
  }

  async function pickPhase2 (winner: string, loser: string) {
    if (!state.value) return
    state.value = applyEloResult(state.value, winner, loser)
    persistState(state.value)
    const is4_3_2 = state.value.phase2Threshold === 0
    if (!is4_3_2 && hasConverged(state.value)) {
      state.value = { ...state.value, phase: 'finished', currentMatch: null }
      persistState(state.value)
      return
    }
    transitioning.value = true
    try {
      await setNextMatch()
    } finally {
      transitioning.value = false
    }
  }

  function undo () {
    if (!state.value) return
    let reverted = undoLastResult(state.value)
    if (reverted) {
      if (
        reverted.phase2Threshold === 0 &&
        reverted.phase === 'phase2' &&
        reverted.round === COVERAGE_ROUNDS
      ) {
        reverted = {
          ...reverted,
          phase: 'phase1',
          remainingNames: Object.keys(reverted.archetypes)
        }
      }
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
        () => reject(new Error('Le chargement a pris trop de temps. Réessayez (connexion lente ou API occupée).')),
        START_TIMEOUT_MS
      )
    })
    try {
      await Promise.race([loadFromApi(), timeoutPromise])
    } catch (e) {
      error.value = (e as Error)?.message ?? 'Une erreur est survenue. Réessayez.'
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

  /** Remet la sélection à zéro : efface le tournoi et affiche l'écran de démarrage. */
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
    pickPhase1,
    pickPhase2,
    pickPhase2_3way,
    finish,
    undo,
    cycleArchetypeImage,
    downloadCsv,
    restart,
    resetToStart
  }
}
