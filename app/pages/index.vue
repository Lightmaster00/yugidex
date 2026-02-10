<script setup lang="ts">
import type { YgoCard } from '~/types/api'
import { t } from '~/utils/i18n'
import { COVERAGE_ROUND_COUNT, SWISS_ROUND_COUNT } from '~/types/tournament'
import { MAIN_DISPLAY_COUNT, EXTRA_DISPLAY_COUNT, getCardCategory, getFullCardImageUrl } from '~/utils/representativeCard'
import { fetchCardsForArchetype, displayArchetypeName } from '~/composables/useYgoApi'
import { analyzeArchetypeCoherence, type ArchetypeCoherenceResult } from '~/utils/archetypeLinks'

const DISPLAY_STEPS = MAIN_DISPLAY_COUNT + EXTRA_DISPLAY_COUNT
const {
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
} = useTournamentState()

const i = (key: string) => t(key, 'en')
const selectedCard = ref<string | null>(null)

/** Results popup: selected archetype (null = closed). */
const archetypeModalName = ref<string | null>(null)
/** All archetype cards (API fetch), sorted Extra > Main > Spell > Trap then by name. */
const modalAllCards = ref<YgoCard[]>([])
const modalLoading = ref(false)
/** Selected card (displayed large on the left). */
const modalCardSelected = ref<YgoCard | null>(null)
/** Search by name in the popup. */
const modalSearch = ref('')
/** Coherence of the displayed archetype (true theme vs loose grouping). */
const modalCoherence = ref<ArchetypeCoherenceResult | null>(null)

const CATEGORY_ORDER: Record<string, number> = { extra: 0, main: 1, spell: 2, trap: 3 }

function sortCardsByCategoryThenName (cards: YgoCard[]): YgoCard[] {
  return [...cards].sort((a, b) => {
    const catA = getCardCategory(a)
    const catB = getCardCategory(b)
    const orderA = CATEGORY_ORDER[catA] ?? 4
    const orderB = CATEGORY_ORDER[catB] ?? 4
    if (orderA !== orderB) return orderA - orderB
    const nameA = (a.name_en ?? a.name).toLowerCase()
    const nameB = (b.name_en ?? b.name).toLowerCase()
    return nameA.localeCompare(nameB)
  })
}

/** Excludes tokens and Rush Duel character cards (Skill) from the list. */
function excludeTokensAndRushDuelCharacters (cards: YgoCard[]): YgoCard[] {
  return cards.filter(c => {
    const t = (c.type ?? '').toLowerCase()
    const f = (c.frameType ?? '').toLowerCase()
    if (t.includes('token') || f.includes('token')) return false
    if (t.includes('skill')) return false
    return true
  })
}

const modalCardsFiltered = computed(() => {
  const list = modalAllCards.value
  const q = modalSearch.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(c => {
    const name = (c.name_en ?? c.name).toLowerCase()
    return name.includes(q)
  })
})

watch(archetypeModalName, async (name) => {
  if (!name) {
  document.body.style.overflow = ''
  modalAllCards.value = []
  modalCardSelected.value = null
  modalSearch.value = ''
  modalCoherence.value = null
  return
}
  document.body.style.overflow = 'hidden'
  modalCardSelected.value = null
  modalSearch.value = ''
  modalCoherence.value = null
  modalLoading.value = true
  try {
    const raw = await fetchCardsForArchetype(name)
    const withoutTokensNorRush = excludeTokensAndRushDuelCharacters(raw)
    const sorted = sortCardsByCategoryThenName(withoutTokensNorRush)
    modalAllCards.value = sorted
    modalCardSelected.value = modalAllCards.value[0] ?? null
    modalCoherence.value = analyzeArchetypeCoherence(sorted, name)
  } finally {
    modalLoading.value = false
  }
})

function closeArchetypeModal () {
  document.body.style.overflow = ''
  archetypeModalName.value = null
  modalAllCards.value = []
  modalCardSelected.value = null
  modalSearch.value = ''
  modalCoherence.value = null
}

/** Cycle index (0..9 = 5 Main + 5 Extra). */
const matchDisplayGlobalIdx = ref(0)

const matchDisplayTotalSteps = computed(() => DISPLAY_STEPS)

/** Card to display for an archetype. In duel: index 0 = best card, cycle 0..9 = best → worst. */
function getCurrentRepresentative (archetypeName: string) {
  const entry = state.value?.archetypes[archetypeName]
  const cards = entry?.representativeCards
  if (!cards?.length) return undefined
  const inMatch = state.value?.currentMatch?.includes(archetypeName)
  if (inMatch) {
    const index = matchDisplayGlobalIdx.value % cards.length
    return cards[index]
  }
  const idx = entry?.representativeIndex ?? 0
  return cards[idx] ?? cards[0]
}

function showCardBack (archetypeName: string): boolean {
  if (!state.value?.currentMatch?.includes(archetypeName)) return false
  return getCurrentRepresentative(archetypeName) === undefined
}

/** Phase 1/2: user chooses the winner in a group. */
function selectGroup (name: string) {
  const match = state.value?.currentMatch
  if (!match) return
  selectedCard.value = name
  const losers = match.filter(n => n !== name)
  pickGroup(name, losers)
}

/** Phase 3: user chooses the winner in a 1v1 duel. */
function selectDuel (name: string) {
  const match = state.value?.currentMatch
  if (!match) return
  selectedCard.value = name
  const loser = match.find(n => n !== name)
  if (!loser) return
  pickDuel(name, loser)
}

/** Phase 1/2: groups of 2-4. */
const isGroupMode = computed(
  () =>
    (state.value?.phase === 'phase1' || state.value?.phase === 'phase2') &&
    (state.value?.currentMatch?.length ?? 0) >= 2
)

/** Phase 3: 1v1 duel. */
const isDuelMode = computed(
  () =>
    state.value?.phase === 'phase3' &&
    state.value?.currentMatch?.length === 2
)

const canCycleAllCards = computed(() => matchDisplayTotalSteps.value > 1)

function cycleAllCards () {
  matchDisplayGlobalIdx.value = (matchDisplayGlobalIdx.value + 1) % matchDisplayTotalSteps.value
}

/** Cible de progression (0–100), valeur réelle. */
const phaseProgressPercent = computed(() => {
  const s = state.value
  if (!s) return 0
  if (s.phase === 'phase1' || s.phase === 'phase2') {
    if (!s.groupsTotal) return 0
    return (s.groupsCompleted / s.groupsTotal) * 100
  }
  if (s.phase === 'phase3') {
    const pool = s.phasePool
    const matchesPerRound = Math.floor(pool.length / 2)
    const total = matchesPerRound * SWISS_ROUND_COUNT
    if (total <= 0) return 0
    return (s.matchesPlayed.length / total) * 100
  }
  return 0
})

/** Pourcentage affiché, animé linéairement vers la cible (pas de saut). */
const displayedProgressPercent = ref(0)
const PROGRESS_ANIM_DURATION_MS = 450
let progressAnimId = 0
watch(
  phaseProgressPercent,
  (target) => {
    const start = displayedProgressPercent.value
    const startTime = performance.now()
    const tick = () => {
      const t = Math.min((performance.now() - startTime) / PROGRESS_ANIM_DURATION_MS, 1)
      const ease = 1 - (1 - t) * (1 - t) // easeOutQuad
      displayedProgressPercent.value = start + (target - start) * ease
      if (t < 1) progressAnimId = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(progressAnimId)
    progressAnimId = requestAnimationFrame(tick)
  },
  { immediate: true }
)

/** Phase badge text: pourcentage animé (progression linéaire visuelle). */
const phaseBadgeText = computed(() => {
  const s = state.value
  if (!s || s.phase === 'finished') return ''
  const percent = Math.round(displayedProgressPercent.value)
  if (s.phase === 'phase1') {
    const roundNum = (s.phaseRound ?? 0) + 1
    return `${i('phase1.badge')} — Round ${roundNum} of ${COVERAGE_ROUND_COUNT} — ${percent}%`
  }
  const phaseLabel = s.phase === 'phase2' ? i('phase2.badge') : i('phase3.badge')
  return `${phaseLabel} — ${percent}%`
})

/** Grid class based on group size. */
const groupGridClass = computed(() => {
  const len = state.value?.currentMatch?.length ?? 4
  if (len <= 2) return 'cards-grid-2'
  if (len === 3) return 'cards-grid-3'
  return 'cards-grid-4'
})

watch(
  () => [state.value?.currentMatch, state.value?.round] as const,
  () => {
    const s = state.value
    if (s?.currentMatch?.length) {
      // Always start with the first card (Extra slot 0) at each new match
      matchDisplayGlobalIdx.value = 0
    }
  },
  { immediate: true }
)

onMounted(() => {
  init()
})

watch(transitioning, (isTransitioning) => {
  if (isTransitioning) selectedCard.value = null
})

/** Safe access to the two duelists in a 1v1 match. */
const duelLeft = computed(() => state.value?.currentMatch?.[0] ?? '')
const duelRight = computed(() => state.value?.currentMatch?.[1] ?? '')

/** Podium data — [Silver, Gold, Bronze] for column display order. */
const podiumSlots = computed(() => {
  const t = top10.value
  if (t.length < 3) return []
  return [t[1]!, t[0]!, t[2]!]
})
</script>

<template>
  <div class="app-bg">
    <header class="header">
      <div class="header-inner">
        <div class="logo-wrap">
          <span class="logo-brand">Yu-Gi-Oh!</span>
          <h1 class="logo">{{ i('header.tournament') }}</h1>
        </div>
        <div v-if="state" class="header-right">
          <span v-if="state.phase !== 'finished'" class="phase-badge">
            <span class="phase-badge__dot" />
            <span class="phase-badge__text">{{ phaseBadgeText }}</span>
          </span>
          <div class="header-actions">
            <button
              v-if="canUndo"
              type="button"
              class="btn btn-prev btn-header"
              @click="undo"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              {{ i('btn.previous') }}
            </button>
            <button
              v-if="state && state.phase !== 'finished'"
              type="button"
              class="btn btn-reset btn-header"
              :title="i('btn.reset')"
              @click="resetToStart"
            >
              {{ i('btn.reset') }}
            </button>
          </div>
        </div>
      </div>
      <!-- Thin progress bar at bottom of header -->
      <div v-if="state && state.phase !== 'finished'" class="header-progress">
        <div class="header-progress__fill" :style="{ width: displayedProgressPercent + '%' }" />
      </div>
    </header>

    <main class="main">
      <div v-if="loading" class="screen-center loading-screen">
        <div class="ygo-loader">
          <div class="ygo-loader__card-wrap">
            <div class="ygo-loader__card-back" />
            <div class="ygo-loader__card-back ygo-loader__card-back--front" aria-hidden="true" />
          </div>
          <p class="ygo-loader__text">{{ i('loading.shuffle') }}</p>
          <p class="ygo-loader__sub">{{ i('loading.prepare') }}</p>
        </div>
      </div>

      <div v-else-if="error" class="screen-center">
        <div class="error-box">{{ error }}</div>
      </div>

      <div
        v-else-if="transitioning && (state?.phase === 'phase1' || state?.phase === 'phase2' || state?.phase === 'phase3')"
        class="screen-center loading-screen"
      >
        <div class="ygo-loader ygo-loader--small">
          <div class="ygo-loader__card-wrap">
            <div class="ygo-loader__card-back" />
          </div>
          <p class="ygo-loader__text">{{ i('loading.next') }}</p>
        </div>
      </div>

      <div
        v-else-if="isGroupMode || isDuelMode"
        key="duel-wrap"
        class="duel-wrap"
      >
        <Transition name="duel" mode="out-in">
          <!-- Phase 1, 2 and 3: same grid (4, 3 or 2 cards), same ArchetypeCard component -->
          <section
            v-if="isGroupMode || isDuelMode"
            :key="`match-${state!.phase}-${state!.round}`"
            class="duel-section"
          >
            <div class="duel-header">
              <p class="duel-instruction">
                <span>{{ i('duel.instruction') }}</span>{{ i('duel.instruction.suffix') }}
              </p>
              <button
                v-if="canCycleAllCards"
                type="button"
                class="btn btn-outline btn-sm btn-cycle"
                @click="cycleAllCards"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                {{ i('btn.changeCard') }}
              </button>
            </div>
            <!-- 1v1 Duel layout with VS indicator -->
            <div v-if="isDuelMode && duelLeft && duelRight" class="duel-arena">
              <div class="duel-arena__card duel-arena__card--left">
                <ArchetypeCard
                  :name="displayArchetypeName(duelLeft)"
                  :image-url="getCurrentRepresentative(duelLeft)?.imageUrl"
                  :card-type="getCurrentRepresentative(duelLeft)?.displayType"
                  :selected="selectedCard === duelLeft"
                  :show-elo="true"
                  :elo="state!.archetypes[duelLeft]?.elo ?? 1000"
                  :show-card-back="showCardBack(duelLeft)"
                  :extra-policy="state!.archetypes[duelLeft]?.extraPolicy"
                  @select="selectDuel(duelLeft)"
                />
              </div>
              <div class="duel-arena__vs">
                <span class="duel-arena__vs-text">VS</span>
                <span class="duel-arena__vs-glow" aria-hidden="true" />
              </div>
              <div class="duel-arena__card duel-arena__card--right">
                <ArchetypeCard
                  :name="displayArchetypeName(duelRight)"
                  :image-url="getCurrentRepresentative(duelRight)?.imageUrl"
                  :card-type="getCurrentRepresentative(duelRight)?.displayType"
                  :selected="selectedCard === duelRight"
                  :show-elo="true"
                  :elo="state!.archetypes[duelRight]?.elo ?? 1000"
                  :show-card-back="showCardBack(duelRight)"
                  :extra-policy="state!.archetypes[duelRight]?.extraPolicy"
                  @select="selectDuel(duelRight)"
                />
              </div>
            </div>
            <!-- Group layout (3-4 cards) -->
            <div v-else class="cards-grid" :class="groupGridClass">
              <ArchetypeCard
                v-for="name in state!.currentMatch"
                :key="name"
                :name="displayArchetypeName(name)"
                :image-url="getCurrentRepresentative(name)?.imageUrl"
                :card-type="getCurrentRepresentative(name)?.displayType"
                :selected="selectedCard === name"
                :show-elo="false"
                :show-card-back="showCardBack(name)"
                :extra-policy="state!.archetypes[name]?.extraPolicy"
                @select="selectGroup(name)"
              />
            </div>
            <div v-if="isDuelMode" class="actions">
              <button
                type="button"
                class="btn btn-outline"
                @click="finish"
              >
                {{ i('btn.finishEarly') }}
              </button>
            </div>
          </section>
        </Transition>
      </div>

      <div
        v-else-if="state && state.phase !== 'finished' && !state.currentMatch?.length"
        class="screen-center"
      >
        <div class="ygo-loader ygo-loader--small">
          <div class="ygo-loader__card-wrap">
            <div class="ygo-loader__card-back" />
          </div>
          <p class="ygo-loader__text">{{ i('loading.next') }}</p>
        </div>
      </div>

      <template v-else-if="state?.phase === 'finished'">
        <Transition name="results">
          <section key="results" class="results-section">
            <div class="results-header">
              <span class="results-label">{{ i('results.label') }}</span>
              <h2 class="results-title">{{ i('results.title') }}</h2>
              <div class="results-separator" aria-hidden="true">
                <span class="results-separator__line" />
                <span class="results-separator__diamond" />
                <span class="results-separator__line" />
              </div>
            </div>
            <!-- Podium top 3 -->
            <div v-if="podiumSlots.length === 3" class="podium">
              <div
                v-for="(pos, idx) in podiumSlots"
                :key="pos.name"
                class="podium__slot"
                :class="[
                  idx === 0 ? 'podium__slot--silver' : idx === 1 ? 'podium__slot--gold' : 'podium__slot--bronze'
                ]"
                role="button"
                tabindex="0"
                @click="archetypeModalName = pos.name"
                @keydown.enter="archetypeModalName = pos.name"
              >
                <span class="podium__rank">{{ pos.rank === 1 ? '\u{1F451}' : pos.rank === 2 ? '\u{1F948}' : '\u{1F949}' }}</span>
                <span class="podium__name">{{ displayArchetypeName(pos.name) }}</span>
                <span class="podium__elo">{{ pos.elo }}</span>
                <span class="podium__record">{{ pos.wins }}W / {{ pos.losses }}L</span>
                <span class="podium__bar" />
              </div>
            </div>
            <!-- Remaining 4–10 -->
            <ul class="top-list">
              <li
                v-for="row in top10.slice(3)"
                :key="row.name"
                class="top-item top-item--clickable"
                role="button"
                tabindex="0"
                @click="archetypeModalName = row.name"
                @keydown.enter="archetypeModalName = row.name"
                @keydown.space.prevent="archetypeModalName = row.name"
              >
                <span class="top-rank">{{ row.rank }}</span>
                <span class="top-name">{{ displayArchetypeName(row.name) }}</span>
                <span class="top-stats">
                  <span class="top-elo">{{ row.elo }}</span>
                  <span class="top-record">{{ row.wins }}W / {{ row.losses }}L</span>
                </span>
              </li>
            </ul>
            <div class="actions results-actions">
              <button type="button" class="btn btn-gold" @click="downloadCsv">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {{ i('btn.downloadCsv') }}
              </button>
              <button type="button" class="btn btn-outline" @click="restart">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                {{ i('btn.playAgain') }}
              </button>
            </div>
          </section>
        </Transition>
        <!-- Archetype popup: left = card + info, right = search + all cards -->
        <Teleport to="body">
          <Transition name="modal">
            <div
              v-if="archetypeModalName"
              class="archetype-modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="archetype-modal-title"
              @click.self="closeArchetypeModal"
              @wheel.stop
            >
              <div class="archetype-modal archetype-modal--two-panels">
                <div class="archetype-modal__head">
                  <div class="archetype-modal__title-row">
                    <h2 id="archetype-modal-title" class="archetype-modal__title">
                      {{ displayArchetypeName(archetypeModalName ?? '') }}
                    </h2>
                    <span
                      v-if="modalCoherence && modalCoherence.verdict !== 'unknown'"
                      class="archetype-modal__coherence"
                      :class="`archetype-modal__coherence--${modalCoherence.verdict}`"
                      :title="`Score: ${modalCoherence.score} · Names: ${modalCoherence.nameMatches}/${modalCoherence.totalCards} · Desc: ${modalCoherence.descMatches}/${modalCoherence.totalCards}`"
                    >
                      {{ modalCoherence.verdict === 'coherent' ? 'Coherent' : 'Loose grouping' }}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="archetype-modal__close"
                    aria-label="Close"
                    @click="closeArchetypeModal"
                  >
                    ×
                  </button>
                </div>
                <div class="archetype-modal__body">
                  <template v-if="modalLoading">
                    <div class="archetype-modal-loading">
                      <p>Loading cards…</p>
                    </div>
                  </template>
                  <template v-else>
                    <!-- Left panel: large card + info -->
                    <div class="archetype-modal__left">
                      <template v-if="modalCardSelected">
                        <img
                          :src="getFullCardImageUrl(modalCardSelected)"
                          :alt="(modalCardSelected.name_en ?? modalCardSelected.name)"
                          class="archetype-modal__card-large"
                        >
                        <div class="archetype-modal__info">
                          <h3 class="archetype-modal__card-name">{{ modalCardSelected.name_en ?? modalCardSelected.name }}</h3>
                          <p class="archetype-modal__card-type">{{ modalCardSelected.type }}</p>
                          <template v-if="modalCardSelected.atk != null">
                            <p class="archetype-modal__stat">ATK / DEF : {{ modalCardSelected.atk }} / {{ modalCardSelected.def ?? '?' }}</p>
                          </template>
                          <template v-else-if="modalCardSelected.level != null">
                            <p class="archetype-modal__stat">Level : {{ modalCardSelected.level }}</p>
                          </template>
                          <p v-if="modalCardSelected.race" class="archetype-modal__stat">{{ modalCardSelected.race }}{{ modalCardSelected.attribute ? ' · ' + modalCardSelected.attribute : '' }}</p>
                          <p v-if="modalCardSelected.desc" class="archetype-modal__desc">{{ modalCardSelected.desc }}</p>
                        </div>
                      </template>
                      <p v-else class="archetype-modal__no-card">No card</p>
                    </div>
                    <!-- Right panel: search + full card grid -->
                    <div class="archetype-modal__right">
                      <input
                        v-model.trim="modalSearch"
                        type="search"
                        class="archetype-modal__search"
                        placeholder="Search by name…"
                        aria-label="Search for a card"
                      >
                      <div class="archetype-modal__list-wrap">
                        <button
                          v-for="card in modalCardsFiltered"
                          :key="card.id"
                          type="button"
                          class="archetype-modal__card-thumb"
                          :class="{ 'archetype-modal__card-thumb--selected': modalCardSelected?.id === card.id }"
                          @click="modalCardSelected = card"
                        >
                          <img
                            :src="getFullCardImageUrl(card)"
                            :alt="(card.name_en ?? card.name)"
                            class="archetype-modal__card-thumb-img"
                          >
                        </button>
                      </div>
                      <p v-if="modalCardsFiltered.length === 0" class="archetype-modal__empty">
                        No cards match the search.
                      </p>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>
      </template>

      <div v-else-if="!state && !loading" class="start-screen">
        <!-- ── Background layers ── -->
        <div class="start-bg-vignette" aria-hidden="true" />
        <div class="start-bg-rays" aria-hidden="true" />
        <div class="start-bg-grid" aria-hidden="true" />

        <!-- Floating gold particles -->
        <div class="start-particles" aria-hidden="true">
          <span v-for="j in 20" :key="j" class="start-particle" :style="{ '--i': j }" />
        </div>

        <!-- ── Floating card silhouettes (scattered around viewport) ── -->
        <div class="start-cards-scatter" aria-hidden="true">
          <span v-for="c in 8" :key="c" class="start-card-ghost" :style="{ '--c': c }" />
        </div>

        <!-- ── Hero content ── -->
        <div class="start-hero">
          <div class="start-glow" aria-hidden="true" />

          <!-- App favicon (diamond) -->
          <div class="start-favicon" aria-hidden="true">
            <img src="/favicon.svg" alt="" width="80" height="80" class="start-favicon__img" />
          </div>

          <p class="start-brand">Yu-Gi-Oh!</p>
          <h2 class="start-title" v-html="i('start.title').replace('\n', '<br>')" />
          <p class="start-tagline" v-html="i('start.tagline').replace('\n', '<br>')" />

          <!-- Separator -->
          <div class="start-separator" aria-hidden="true">
            <span class="start-sep-line" />
            <span class="start-sep-diamond" />
            <span class="start-sep-line" />
          </div>

          <!-- CTA -->
          <div class="start-cta">
            <button type="button" class="btn btn-gold btn-lg start-btn" @click="startTournament">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              {{ i('start.cta') }}
            </button>
          </div>

          <!-- Stats teaser -->
          <div class="start-stats">
            <div class="start-stat">
              <span class="start-stat__num">300+</span>
              <span class="start-stat__label">Archetypes</span>
            </div>
            <span class="start-stat__sep" />
            <div class="start-stat">
              <span class="start-stat__num">3</span>
              <span class="start-stat__label">Phases</span>
            </div>
            <span class="start-stat__sep" />
            <div class="start-stat">
              <span class="start-stat__num">Top 10</span>
              <span class="start-stat__label">Ranking</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* ============================== */
/*           HEADER               */
/* ============================== */
.header {
  padding: 1rem 2rem;
  background: var(--bg-glass-strong);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-subtle);
}

.header-inner {
  max-width: 72rem;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.logo-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.logo-brand {
  font-size: 0.65rem;
  font-weight: 700;
  background: linear-gradient(90deg, var(--accent-dim), var(--accent), var(--accent-dim));
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0.14em;
  margin: 0;
  text-transform: uppercase;
}

.logo {
  font-family: 'Outfit', sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  letter-spacing: -0.02em;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-header {
  padding: 0.45rem 0.85rem;
  font-size: 0.78rem;
}

.phase-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.7rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
  border: 1px solid rgba(232, 197, 71, 0.15);
  border-radius: var(--radius-pill);
  background: rgba(232, 197, 71, 0.05);
  white-space: nowrap;
}

.phase-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: badge-dot-pulse 1.5s ease-in-out infinite;
}

@keyframes badge-dot-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(232, 197, 71, 0.4); }
  50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(232, 197, 71, 0); }
}

.phase-badge__text {
  line-height: 1;
}

/* Header progress bar */
.header-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.03);
}

.header-progress__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-dim), var(--accent));
  transition: width 0.5s var(--ease-out);
  box-shadow: 0 0 8px rgba(232, 197, 71, 0.3);
}

/* ============================== */
/*            MAIN                */
/* ============================== */
.main {
  max-width: 96rem;
  margin: 0 auto;
  padding: 0.5rem 2rem 2rem;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.screen-center {
  display: grid;
  place-items: center;
  min-height: 50vh;
}

/* ============================== */
/*       LOADING SCREEN           */
/* ============================== */
.loading-screen {
  min-height: 55vh;
}

.ygo-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.ygo-loader__card-wrap {
  position: relative;
  width: 72px;
  aspect-ratio: 421 / 614;
  transform-style: preserve-3d;
  animation: ygo-card-spin 2s ease-in-out infinite;
}

.ygo-loader__card-back {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: url(/card-back.png) center / cover no-repeat;
  border: 1.5px solid rgba(232, 197, 71, 0.2);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.5),
    0 8px 32px rgba(0, 0, 0, 0.6);
  backface-visibility: hidden;
}

.ygo-loader__card-back--front {
  transform: rotateY(180deg);
  background: url(/card-back.png) center / cover no-repeat;
}

@keyframes ygo-card-spin {
  0%, 100% { transform: rotateY(0deg); }
  50% { transform: rotateY(180deg); }
}

.ygo-loader__text {
  color: var(--accent);
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin: 0;
  animation: ygo-pulse 1.5s ease-in-out infinite;
}

.ygo-loader__sub {
  color: var(--text-muted);
  font-size: 0.78rem;
  margin: 0;
  animation: ygo-pulse 1.5s ease-in-out infinite 0.3s both;
}

@keyframes ygo-pulse {
  50% { opacity: 0.5; }
}

.ygo-loader--small .ygo-loader__card-wrap {
  width: 48px;
  animation-duration: 2.2s;
}

.ygo-loader--small .ygo-loader__text {
  font-size: 0.88rem;
}

/* ============================== */
/*        START SCREEN            */
/* ============================== */
.start-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 52px);
  min-height: calc(100dvh - 52px);
  padding: 2rem;
  position: relative;
  overflow: hidden;
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  margin-top: -0.75rem;
  margin-bottom: -1.5rem;
}

/* Dark vignette */
.start-bg-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 65% 55% at 50% 42%, transparent 0%, rgba(5, 5, 7, 0.75) 100%);
  pointer-events: none;
  z-index: 1;
}

/* Rotating rays */
.start-bg-rays {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 160vmax;
  height: 160vmax;
  transform: translate(-50%, -50%);
  background: conic-gradient(
    from 0deg,
    transparent 0deg, rgba(232, 192, 64, 0.04) 8deg, transparent 16deg,
    transparent 30deg, rgba(232, 192, 64, 0.035) 38deg, transparent 46deg,
    transparent 60deg, rgba(232, 192, 64, 0.04) 68deg, transparent 76deg,
    transparent 90deg, rgba(232, 192, 64, 0.035) 98deg, transparent 106deg,
    transparent 120deg, rgba(232, 192, 64, 0.04) 128deg, transparent 136deg,
    transparent 150deg, rgba(232, 192, 64, 0.035) 158deg, transparent 166deg,
    transparent 180deg, rgba(232, 192, 64, 0.04) 188deg, transparent 196deg,
    transparent 210deg, rgba(232, 192, 64, 0.035) 218deg, transparent 226deg,
    transparent 240deg, rgba(232, 192, 64, 0.04) 248deg, transparent 256deg,
    transparent 270deg, rgba(232, 192, 64, 0.035) 278deg, transparent 286deg,
    transparent 300deg, rgba(232, 192, 64, 0.04) 308deg, transparent 316deg,
    transparent 330deg, rgba(232, 192, 64, 0.035) 338deg, transparent 346deg,
    transparent 360deg
  );
  animation: start-rays-rotate 50s linear infinite;
  pointer-events: none;
}

@keyframes start-rays-rotate {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

/* Grid texture */
.start-bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(232, 192, 64, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(232, 192, 64, 0.025) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 55% 45% at 50% 50%, rgba(0, 0, 0, 0.4) 0%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 55% 45% at 50% 50%, rgba(0, 0, 0, 0.4) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* Floating gold particles */
.start-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}

.start-particle {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0;
  animation: start-particle-float 7s ease-in-out infinite;
  animation-delay: calc(var(--i) * 0.4s);
  left: calc(3% + var(--i) * 4.7%);
  top: calc(90% - var(--i) * 0.5%);
}

.start-particle:nth-child(even) {
  width: 3px;
  height: 3px;
  animation-duration: 9s;
}

.start-particle:nth-child(3n) {
  width: 4px;
  height: 4px;
  animation-duration: 8s;
  background: linear-gradient(135deg, var(--accent), #f0d060);
  box-shadow: 0 0 6px rgba(232, 192, 64, 0.35);
}

@keyframes start-particle-float {
  0% { opacity: 0; transform: translateY(0) scale(0.4); }
  12% { opacity: 0.6; }
  50% { opacity: 0.25; }
  100% { opacity: 0; transform: translateY(-60vh) scale(0); }
}

/* ── Scattered card ghosts ── */
.start-cards-scatter {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.start-card-ghost {
  position: absolute;
  width: 52px;
  aspect-ratio: 1;
  border-radius: 8px;
  border: 1px solid rgba(232, 192, 64, 0.08);
  background: linear-gradient(145deg, rgba(232, 192, 64, 0.03), rgba(232, 192, 64, 0.01));
  backdrop-filter: blur(2px);
  animation: card-ghost-drift 12s ease-in-out infinite;
  opacity: 0;
}

.start-card-ghost:nth-child(1) { left: 5%; top: 12%; animation-delay: 0s; transform: rotate(-12deg); }
.start-card-ghost:nth-child(2) { right: 6%; top: 15%; animation-delay: 1.5s; transform: rotate(10deg); width: 44px; }
.start-card-ghost:nth-child(3) { left: 12%; bottom: 18%; animation-delay: 3s; transform: rotate(-6deg); width: 48px; }
.start-card-ghost:nth-child(4) { right: 10%; bottom: 22%; animation-delay: 4.5s; transform: rotate(14deg); width: 40px; }
.start-card-ghost:nth-child(5) { left: 22%; top: 8%; animation-delay: 2s; transform: rotate(5deg); width: 36px; }
.start-card-ghost:nth-child(6) { right: 20%; top: 6%; animation-delay: 5s; transform: rotate(-8deg); width: 42px; }
.start-card-ghost:nth-child(7) { left: 3%; top: 55%; animation-delay: 6s; transform: rotate(9deg); width: 38px; }
.start-card-ghost:nth-child(8) { right: 4%; top: 50%; animation-delay: 7s; transform: rotate(-11deg); width: 46px; }

@keyframes card-ghost-drift {
  0%, 100% { opacity: 0; transform: translateY(0) rotate(var(--r, -5deg)) scale(0.95); }
  15% { opacity: 0.35; }
  50% { opacity: 0.2; transform: translateY(-20px) rotate(calc(var(--r, -5deg) + 3deg)) scale(1); }
  85% { opacity: 0.35; }
}

/* ── Hero ── */
.start-hero {
  position: relative;
  text-align: center;
  max-width: 36rem;
  z-index: 3;
  animation: start-hero-enter 1s var(--ease-out) both;
}

@keyframes start-hero-enter {
  from {
    opacity: 0;
    transform: scale(0.94) translateY(24px);
    filter: blur(3px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }
}

.start-glow {
  position: absolute;
  top: -50%;
  left: 50%;
  transform: translateX(-50%);
  width: 180%;
  height: 100%;
  background:
    radial-gradient(ellipse 45% 30% at 50% 40%, rgba(232, 192, 64, 0.12) 0%, transparent 50%),
    radial-gradient(ellipse 70% 55% at 50% 45%, rgba(232, 192, 64, 0.04) 0%, transparent 60%);
  pointer-events: none;
  animation: start-glow-pulse 4.5s ease-in-out infinite;
}

@keyframes start-glow-pulse {
  0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
  50% { opacity: 0.6; transform: translateX(-50%) scale(1.08); }
}

/* Favicon (diamond) */
.start-favicon {
  display: flex;
  justify-content: center;
  margin-bottom: 1.5rem;
  animation: start-fade-up 0.8s var(--ease-out) 0.1s both;
}

.start-favicon__img {
  width: 80px;
  height: 80px;
  object-fit: contain;
  filter: drop-shadow(0 0 14px rgba(232, 192, 64, 0.4));
  animation: start-favicon-glow 3.5s ease-in-out infinite;
}

@keyframes start-favicon-glow {
  0%, 100% { filter: drop-shadow(0 0 14px rgba(232, 192, 64, 0.4)); }
  50% { filter: drop-shadow(0 0 24px rgba(232, 192, 64, 0.6)); }
}

/* Brand */
.start-brand {
  font-size: 0.85rem;
  font-weight: 700;
  background: linear-gradient(90deg, #c9a020, var(--accent), #f5e080, var(--accent), #c9a020);
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0.28em;
  margin: 0 0 0.75rem;
  text-transform: uppercase;
  animation: start-brand-shine 4s ease-in-out infinite, start-fade-up 0.8s var(--ease-out) 0.15s both;
}

@keyframes start-brand-shine {
  0% { background-position: 200% 0; }
  50% { background-position: -50% 0; }
  100% { background-position: 200% 0; }
}

/* Title */
.start-title {
  font-family: 'Outfit', sans-serif;
  font-size: clamp(2.4rem, 7vw, 3.6rem);
  font-weight: 800;
  color: var(--text);
  margin: 0 0 1rem;
  letter-spacing: -0.025em;
  line-height: 1.05;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.6);
  animation: start-fade-up 0.9s var(--ease-out) 0.2s both;
}

/* Tagline */
.start-tagline {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin: 0 0 1.5rem;
  line-height: 1.55;
  animation: start-fade-up 0.8s var(--ease-out) 0.3s both;
}

@keyframes start-fade-up {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Separator */
.start-separator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  margin: 0 0 2rem;
  animation: start-fade-up 0.7s var(--ease-out) 0.4s both;
}

.start-sep-line {
  display: block;
  width: 3rem;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(232, 192, 64, 0.3), transparent);
}

.start-sep-diamond {
  display: block;
  width: 6px;
  height: 6px;
  background: var(--accent);
  transform: rotate(45deg);
  opacity: 0.6;
  box-shadow: 0 0 8px rgba(232, 192, 64, 0.4);
}

/* CTA */
.start-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  animation: start-fade-up 0.8s var(--ease-out) 0.5s both;
}

.start-btn {
  padding: 1rem 2.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  box-shadow: 0 4px 24px rgba(232, 192, 64, 0.3);
  transition: box-shadow 0.3s var(--ease), transform 0.2s var(--ease);
  animation: start-btn-breathe 2.5s ease-in-out infinite;
}

@keyframes start-btn-breathe {
  0%, 100% { box-shadow: 0 4px 24px rgba(232, 192, 64, 0.3); }
  50% { box-shadow: 0 8px 36px rgba(232, 192, 64, 0.45), 0 0 48px rgba(232, 192, 64, 0.1); }
}

.start-btn:hover {
  box-shadow: 0 6px 32px rgba(232, 192, 64, 0.4);
  transform: translateY(-2px);
  animation: none;
}

/* Stats teaser */
.start-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  margin-top: 2.5rem;
  animation: start-fade-up 0.7s var(--ease-out) 0.7s both;
}

.start-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}

.start-stat__num {
  font-family: 'Outfit', sans-serif;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: -0.02em;
}

.start-stat__label {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.start-stat__sep {
  display: block;
  width: 1px;
  height: 28px;
  background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.08), transparent);
}

/* ============================== */
/*        DUEL / MATCH            */
/* ============================== */
.duel-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.duel-enter-active,
.duel-leave-active {
  transition: opacity 0.3s var(--ease), transform 0.3s var(--ease);
}

.duel-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

.duel-enter-from {
  opacity: 0;
  transform: scale(1.03);
}

.results-enter-active {
  transition: opacity 0.4s var(--ease), transform 0.4s var(--ease);
}

.results-enter-from {
  opacity: 0;
  transform: translateY(16px);
}

.error-box {
  padding: 1rem 1.25rem;
  background: rgba(185, 28, 28, 0.08);
  border: 1px solid rgba(185, 28, 28, 0.25);
  border-radius: var(--radius-sm);
  color: #fca5a5;
  max-width: 28rem;
  margin: 2rem auto;
  font-size: 0.88rem;
  backdrop-filter: blur(8px);
}

.duel-section {
  text-align: center;
  padding: 1rem 0 2rem;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.duel-header {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.btn-sm {
  padding: 0.4rem 0.85rem;
  font-size: 0.78rem;
}

.btn-cycle {
  gap: 0.35rem;
}

.duel-instruction {
  margin: 0;
  font-size: 0.92rem;
  color: var(--text-secondary);
}

/* ── Duel Arena (1v1 VS layout) ── */
.duel-arena {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  width: 100%;
  max-width: 780px;
  margin: 0 auto;
}

.duel-arena__card {
  flex: 1;
  max-width: 320px;
  animation: duel-card-enter 0.5s var(--ease-out) both;
}

.duel-arena__card--left {
  animation-delay: 0.05s;
}

.duel-arena__card--right {
  animation-delay: 0.15s;
}

@keyframes duel-card-enter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.duel-arena__vs {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  animation: vs-enter 0.4s var(--ease-spring) 0.2s both;
}

.duel-arena__vs-text {
  position: relative;
  z-index: 1;
  font-family: 'Outfit', sans-serif;
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: 0.05em;
  text-shadow: 0 0 20px rgba(232, 197, 71, 0.5);
}

.duel-arena__vs-glow {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(232, 197, 71, 0.12) 0%, transparent 70%);
  animation: vs-glow-pulse 2s ease-in-out infinite;
}

@keyframes vs-enter {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes vs-glow-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}

@media (max-width: 480px) {
  .duel-arena {
    gap: 0.75rem;
  }
  .duel-arena__card {
    max-width: 180px;
  }
  .duel-arena__vs {
    width: 36px;
    height: 36px;
  }
  .duel-arena__vs-text {
    font-size: 0.85rem;
  }
}

/* ── Card Grids (group mode: 3-4 cards) ── */
.cards-grid {
  display: grid;
  gap: 1.5rem;
  justify-content: center;
  align-items: start;
  margin: 0 auto;
  width: 100%;
  max-width: 100%;
}

.cards-grid-4 {
  grid-template-columns: repeat(2, minmax(0, 280px));
  gap: 1.25rem;
}

@media (min-width: 640px) {
  .cards-grid-4 {
    grid-template-columns: repeat(4, minmax(0, 260px));
    gap: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .cards-grid-4 {
    grid-template-columns: repeat(4, minmax(0, 300px));
    gap: 2rem;
  }
}

.cards-grid-3 {
  grid-template-columns: repeat(1, minmax(0, 300px));
  gap: 1.5rem;
}

@media (min-width: 640px) {
  .cards-grid-3 {
    grid-template-columns: repeat(3, minmax(0, 280px));
    gap: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .cards-grid-3 {
    grid-template-columns: repeat(3, minmax(0, 320px));
    gap: 2rem;
  }
}

.cards-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 280px));
  gap: 1.25rem;
}

@media (min-width: 640px) {
  .cards-grid-2 {
    grid-template-columns: repeat(2, minmax(0, 300px));
    gap: 1.75rem;
  }
}

@media (min-width: 1024px) {
  .cards-grid-2 {
    grid-template-columns: repeat(2, minmax(0, 340px));
    gap: 2rem;
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 2rem;
}

.btn-lg {
  padding: 0.85rem 1.75rem;
  font-size: 0.95rem;
}

/* ============================== */
/*          RESULTS               */
/* ============================== */
.results-section {
  max-width: 38rem;
  margin: 0 auto;
  padding: 2rem 0 3rem;
  width: 100%;
}

.results-header {
  text-align: center;
  margin-bottom: 2rem;
  animation: results-header-in 0.6s var(--ease-out) both;
}

@keyframes results-header-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.results-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 0.25rem;
  display: block;
}

.results-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text);
  margin: 0.25rem 0 0.75rem;
  letter-spacing: -0.02em;
}

.results-separator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.results-separator__line {
  display: block;
  width: 2rem;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(232, 197, 71, 0.25), transparent);
}

.results-separator__diamond {
  display: block;
  width: 5px;
  height: 5px;
  background: var(--accent);
  transform: rotate(45deg);
  opacity: 0.4;
}

/* ── Podium ── */
.podium {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  align-items: end;
  animation: results-header-in 0.5s var(--ease-out) 0.1s both;
}

.podium__slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 1rem 0.5rem 0;
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-bottom: none;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;
  position: relative;
  overflow: hidden;
}

.podium__slot:hover {
  background: var(--bg-card-hover);
  transform: translateY(-2px);
}

.podium__slot:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.podium__slot--gold {
  border-color: rgba(232, 197, 71, 0.2);
  background: linear-gradient(180deg, rgba(232, 197, 71, 0.08) 0%, var(--bg-card) 60%);
}

.podium__slot--silver {
  border-color: rgba(192, 192, 192, 0.15);
}

.podium__slot--bronze {
  border-color: rgba(205, 127, 50, 0.15);
}

.podium__rank {
  font-size: 1.5rem;
  line-height: 1;
}

.podium__name {
  font-family: 'Outfit', sans-serif;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.podium__slot--gold .podium__name {
  color: var(--accent);
}

.podium__elo {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.podium__record {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  margin-bottom: 0.5rem;
}

.podium__bar {
  width: 100%;
  background: var(--border);
}

.podium__slot--gold .podium__bar { height: 48px; background: linear-gradient(180deg, rgba(232, 197, 71, 0.15) 0%, rgba(232, 197, 71, 0.04) 100%); }
.podium__slot--silver .podium__bar { height: 32px; background: linear-gradient(180deg, rgba(192, 192, 192, 0.1) 0%, rgba(192, 192, 192, 0.02) 100%); }
.podium__slot--bronze .podium__bar { height: 20px; background: linear-gradient(180deg, rgba(205, 127, 50, 0.1) 0%, rgba(205, 127, 50, 0.02) 100%); }

/* ── Top list (positions 4-10) ── */
.top-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-card);
}

.top-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 0.88rem;
  transition: background 0.2s var(--ease);
  animation: results-item-in 0.35s var(--ease-out) both;
}

.top-item:nth-child(1) { animation-delay: 0.05s; }
.top-item:nth-child(2) { animation-delay: 0.1s; }
.top-item:nth-child(3) { animation-delay: 0.15s; }
.top-item:nth-child(4) { animation-delay: 0.2s; }
.top-item:nth-child(5) { animation-delay: 0.25s; }
.top-item:nth-child(6) { animation-delay: 0.3s; }
.top-item:nth-child(7) { animation-delay: 0.35s; }

@keyframes results-item-in {
  from { opacity: 0; transform: translateX(-6px); }
  to { opacity: 1; transform: translateX(0); }
}

.top-item:last-child {
  border-bottom: none;
}

.top-item:hover {
  background: var(--bg-card-hover);
}

.top-item--clickable {
  cursor: pointer;
}

.top-item--clickable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.top-rank {
  font-weight: 800;
  color: var(--text-muted);
  min-width: 1.5rem;
  font-size: 0.88rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.top-name {
  flex: 1;
  font-weight: 600;
  color: var(--text);
}

.top-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
}

.top-elo {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.top-record {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.results-actions {
  margin-top: 2.5rem;
}

/* ============================== */
/*      ARCHETYPE MODAL           */
/* ============================== */
.archetype-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-sizing: border-box;
}

.archetype-modal {
  width: 100%;
  max-width: 42rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  box-shadow: var(--shadow-xl), 0 0 0 1px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.archetype-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.015);
}

.archetype-modal__title-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  min-width: 0;
}

.archetype-modal__title {
  margin: 0;
  font-family: 'Outfit', sans-serif;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
}

.archetype-modal__coherence {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.archetype-modal__coherence--coherent {
  background: rgba(34, 197, 94, 0.12);
  color: #34d399;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.archetype-modal__coherence--loose {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.archetype-modal__close {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-muted);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}

.archetype-modal__close:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
}

.archetype-modal__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.archetype-modal--two-panels {
  max-width: 56rem;
  max-height: 90vh;
}

.archetype-modal__body {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.archetype-modal-loading {
  padding: 2.5rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88rem;
}

.archetype-modal__left {
  width: 40%;
  min-width: 220px;
  padding: 1.25rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  border-right: 1px solid var(--border-subtle);
}

.archetype-modal__card-large {
  width: 100%;
  max-width: 260px;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  display: block;
}

.archetype-modal__info {
  width: 100%;
  max-width: 260px;
  text-align: left;
}

.archetype-modal__card-name {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
}

.archetype-modal__card-type {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.archetype-modal__stat {
  margin: 0 0 0.2rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.archetype-modal__desc {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.archetype-modal__no-card {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.88rem;
}

.archetype-modal__right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  overflow: hidden;
}

.archetype-modal__search {
  width: 100%;
  padding: 0.55rem 0.85rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
  flex-shrink: 0;
  transition: border-color 0.2s ease;
}

.archetype-modal__search::placeholder {
  color: var(--text-muted);
}

.archetype-modal__search:focus {
  outline: none;
  border-color: var(--accent-dim);
  box-shadow: 0 0 0 3px rgba(232, 197, 71, 0.08);
}

.archetype-modal__list-wrap {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.5rem;
  align-content: start;
}

.archetype-modal__card-thumb {
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-xs);
  background: none;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
}

.archetype-modal__card-thumb:hover {
  transform: scale(1.03);
  box-shadow: var(--shadow-sm);
}

.archetype-modal__card-thumb--selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 0 12px rgba(232, 197, 71, 0.15);
}

.archetype-modal__card-thumb:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.archetype-modal__card-thumb-img {
  width: 100%;
  display: block;
  border-radius: calc(var(--radius-xs) - 2px);
}

.archetype-modal__empty {
  margin: 1rem 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .archetype-modal__body {
    flex-direction: column;
  }
  .archetype-modal__left {
    width: 100%;
    min-width: 0;
    border-right: none;
    border-bottom: 1px solid var(--border-subtle);
    max-height: 45vh;
  }
  .archetype-modal__right {
    min-height: 180px;
  }
  .archetype-modal__list-wrap {
    grid-template-columns: repeat(auto-fill, minmax(75px, 1fr));
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s var(--ease);
}

.modal-enter-active .archetype-modal,
.modal-leave-active .archetype-modal {
  transition: transform 0.3s var(--ease-spring);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .archetype-modal {
  transform: scale(0.92) translateY(10px);
}

.modal-leave-to .archetype-modal {
  transform: scale(0.95);
}

/* ============================== */
/*      RESPONSIVE MOBILE         */
/* ============================== */
@media (max-width: 640px) {
  .header {
    padding: 0.75rem 1rem;
  }
  .header-right {
    gap: 0.4rem;
  }
  .phase-badge {
    font-size: 0.6rem;
    padding: 0.2rem 0.5rem;
  }
  .phase-badge__dot {
    width: 5px;
    height: 5px;
  }
  .btn-header {
    padding: 0.35rem 0.6rem;
    font-size: 0.72rem;
  }
  .main {
    padding: 0.5rem 1rem 1.5rem;
  }
  .logo {
    font-size: 0.92rem;
  }
  .duel-instruction {
    font-size: 0.85rem;
  }
  .podium {
    gap: 0.5rem;
  }
  .podium__name {
    font-size: 0.72rem;
  }
  .podium__elo {
    font-size: 0.7rem;
  }
  .podium__record {
    font-size: 0.58rem;
  }
}
</style>
