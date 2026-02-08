import { ref, computed } from 'vue'
import type { TournamentState } from '~/types/tournament'
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
      // Appliquer la blocklist aux noms cachés (la blocklist peut avoir changé depuis le cache)
      validNames = validNames.filter(n => !ARCHETYPE_BLOCKLIST.has(n))
      if (validNames.length >= 4) {
        const seed = Math.floor(Math.random() * 1e6)
        state.value = createInitialState(validNames, seed)
        await setNextMatch()
        persistState(state.value!)
        return
      }
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
    state.value = createInitialState(validNames, seed)
    await setNextMatch()
    persistState(state.value!)
  }

  async function setNextMatch () {
    const s = state.value
    if (!s) return

    // Phase 1 / Phase 2 : groupes pré-calculés
    if (s.phase === 'phase1' || s.phase === 'phase2') {
      const groups = s.currentRoundGroups
      if (!groups || s.groupsCompleted >= groups.length) return
      const nextGroup = groups[s.groupsCompleted]!
      state.value = { ...s, currentMatch: nextGroup }
      state.value = await ensureRepresentatives(state.value, nextGroup)
      if (state.value.currentMatch === null) await setNextMatch()
      else persistState(state.value)
      return
    }

    // Phase 3 : Swiss 1v1
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
      if (state.value.currentMatch === null) await setNextMatch()
      else persistState(state.value)
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

  /** Phase 1 & 2 : l'utilisateur choisit un gagnant dans un groupe de 4 (ou 2-3). */
  async function pickGroup (winner: string, losers: string[]) {
    if (!state.value || losers.length < 1) return
    state.value = applyGroupResult(state.value, winner, losers)
    persistState(state.value)
    transitioning.value = true
    try {
      await setNextMatch()
    } finally {
      transitioning.value = false
    }
  }

  /** Phase 3 : duel 1v1 Swiss. */
  async function pickDuel (winner: string, loser: string) {
    if (!state.value) return
    state.value = applyEloResult(state.value, winner, loser)
    persistState(state.value)
    if (isPhase3Done(state.value)) {
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
