<script setup lang="ts">
import type { YgoCard } from '~/types/api'
import { t } from '~/utils/i18n'
import { COVERAGE_ROUND_COUNT, SWISS_ROUND_COUNT } from '~/types/tournament'
import { MAIN_DISPLAY_COUNT, EXTRA_DISPLAY_COUNT, getCardCategory, getFullCardImageUrl } from '~/utils/representativeCard'
import { fetchCardsForArchetype } from '~/composables/useYgoApi'

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

/** Popup résultats : archétype sélectionné (null = fermé). */
const archetypeModalName = ref<string | null>(null)
/** Toutes les cartes de l'archétype (fetch API), triées Extra > Main > Spell > Trap puis par nom. */
const modalAllCards = ref<YgoCard[]>([])
const modalLoading = ref(false)
/** Carte sélectionnée (affichée en grand à gauche). */
const modalCardSelected = ref<YgoCard | null>(null)
/** Recherche par nom dans la popup. */
const modalSearch = ref('')

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

/** Filtre par archetype exact (API peut renvoyer des variantes). */
function filterByArchetype (cards: YgoCard[], archetypeName: string): YgoCard[] {
  const want = archetypeName.trim().toLowerCase()
  if (!want) return cards
  return cards.filter(c => (c.archetype ?? '').trim().toLowerCase() === want)
}

/** Exclut tokens et cartes personnages Rush Duel (Skill) de la liste. */
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
    return
  }
  document.body.style.overflow = 'hidden'
  modalCardSelected.value = null
  modalSearch.value = ''
  modalLoading.value = true
  try {
    const raw = await fetchCardsForArchetype(name)
    const byArchetype = filterByArchetype(raw, name)
    const withoutTokensNorRush = excludeTokensAndRushDuelCharacters(byArchetype)
    modalAllCards.value = sortCardsByCategoryThenName(withoutTokensNorRush)
    modalCardSelected.value = modalAllCards.value[0] ?? null
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
}

/** Index du cycle (0..9 = 5 Main + 5 Extra). */
const matchDisplayGlobalIdx = ref(0)

const matchDisplayTotalSteps = computed(() => DISPLAY_STEPS)

/** Carte à afficher pour un archétype. En duel : index 0 = meilleure carte, cycle 0..9 = meilleure → moins bonne. */
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

/** Phase 1/2 : l'utilisateur choisit le gagnant dans un groupe. */
function selectGroup (name: string) {
  const match = state.value?.currentMatch
  if (!match) return
  selectedCard.value = name
  const losers = match.filter(n => n !== name)
  pickGroup(name, losers)
}

/** Phase 3 : l'utilisateur choisit le gagnant dans un duel 1v1. */
function selectDuel (name: string) {
  const match = state.value?.currentMatch
  if (!match) return
  selectedCard.value = name
  const loser = match.find(n => n !== name)
  if (!loser) return
  pickDuel(name, loser)
}

/** Phase 1/2 : groupes de 2-4. */
const isGroupMode = computed(
  () =>
    (state.value?.phase === 'phase1' || state.value?.phase === 'phase2') &&
    (state.value?.currentMatch?.length ?? 0) >= 2
)

/** Phase 3 : duel 1v1. */
const isDuelMode = computed(
  () =>
    state.value?.phase === 'phase3' &&
    state.value?.currentMatch?.length === 2
)

const canCycleAllCards = computed(() => matchDisplayTotalSteps.value > 1)

function cycleAllCards () {
  matchDisplayGlobalIdx.value = (matchDisplayGlobalIdx.value + 1) % matchDisplayTotalSteps.value
}

/** Pourcentage de progression de la phase en cours (0–100). Phase 1 : par round (0→100 chaque round). */
const phaseProgressPercent = computed(() => {
  const s = state.value
  if (!s) return 0
  if (s.phase === 'phase1') {
    if (!s.groupsTotal) return 0
    return Math.round((s.groupsCompleted / s.groupsTotal) * 100)
  }
  if (s.phase === 'phase2') {
    if (!s.groupsTotal) return 0
    return Math.round((s.groupsCompleted / s.groupsTotal) * 100)
  }
  if (s.phase === 'phase3') {
    const pool = s.phasePool
    const matchesPerRound = Math.floor(pool.length / 2)
    const total = matchesPerRound * SWISS_ROUND_COUNT
    if (total <= 0) return 0
    return Math.round((s.matchesPlayed.length / total) * 100)
  }
  return 0
})

/** Texte du badge de phase : Phase 1 = "Round X of 2 — Y%", sinon "Phase — Y%". */
const phaseBadgeText = computed(() => {
  const s = state.value
  if (!s || s.phase === 'finished') return ''
  if (s.phase === 'phase1') {
    const roundNum = (s.phaseRound ?? 0) + 1
    return `${i('phase1.badge')} — Round ${roundNum} of ${COVERAGE_ROUND_COUNT} — ${phaseProgressPercent.value}%`
  }
  const label = s.phase === 'phase2' ? i('phase2.badge') : i('phase3.badge')
  return `${label} — ${phaseProgressPercent.value}%`
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
      // Toujours commencer par la première carte (Extra slot 0) à chaque nouveau match
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
          <span v-if="state.phase !== 'finished'" class="progress-pill">{{ phaseBadgeText }}</span>
          <button
            v-if="canUndo"
            type="button"
            class="btn btn-prev"
            @click="undo"
          >
            {{ i('btn.previous') }}
          </button>
          <button
            v-if="state && state.phase !== 'finished'"
            type="button"
            class="btn btn-reset"
            :title="i('btn.reset')"
            @click="resetToStart"
          >
            {{ i('btn.reset') }}
          </button>
        </div>
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
          <!-- Phase 1, 2 et 3 : même grille (4, 3 ou 2 cartes), même composant ArchetypeCard -->
          <section
            v-if="isGroupMode || isDuelMode"
            :key="`match-${state!.phase}-${state!.round}`"
            class="duel-section"
          >
            <div class="duel-header">
              <p class="duel-instruction">
                <span>{{ i('duel.instruction') }}</span>{{ i('duel.instruction.suffix') }}
              </p>
            </div>
            <div v-if="canCycleAllCards" class="duel-category-row">
              <button
                type="button"
                class="btn btn-outline btn-sm"
                @click="cycleAllCards"
              >
                {{ i('btn.changeCard') }}
              </button>
            </div>
            <div class="cards-grid" :class="groupGridClass">
              <ArchetypeCard
                v-for="name in state!.currentMatch"
                :key="name"
                :name="name"
                :image-url="getCurrentRepresentative(name)?.imageUrl"
                :card-type="getCurrentRepresentative(name)?.displayType"
                :selected="selectedCard === name"
                :show-elo="isDuelMode"
                :elo="state!.archetypes[name]?.elo ?? 1000"
                :show-card-back="showCardBack(name)"
                :extra-policy="state!.archetypes[name]?.extraPolicy"
                @select="isDuelMode ? selectDuel(name) : selectGroup(name)"
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
            <ul class="top-list">
              <li
                v-for="row in top10"
                :key="row.name"
                class="top-item top-item--clickable"
                :class="{
                  'top-item--gold': row.rank === 1,
                  'top-item--silver': row.rank === 2,
                  'top-item--bronze': row.rank === 3
                }"
                role="button"
                tabindex="0"
                @click="archetypeModalName = row.name"
                @keydown.enter="archetypeModalName = row.name"
                @keydown.space.prevent="archetypeModalName = row.name"
              >
                <span class="top-rank">
                  <span v-if="row.rank <= 3" class="top-medal">{{ row.rank === 1 ? '\u{1F451}' : row.rank === 2 ? '\u{1F948}' : '\u{1F949}' }}</span>
                  <span v-else>{{ row.rank }}</span>
                </span>
                <span class="top-name">{{ row.name }}</span>
                <span class="top-stats">
                  <span class="top-elo">{{ row.elo }}</span>
                  <span class="top-record">{{ row.wins }}W / {{ row.losses }}L</span>
                </span>
              </li>
            </ul>
            <div class="actions">
              <button type="button" class="btn btn-gold" @click="downloadCsv">
                {{ i('btn.downloadCsv') }}
              </button>
              <button type="button" class="btn btn-outline" @click="restart">
                {{ i('btn.playAgain') }}
              </button>
            </div>
          </section>
        </Transition>
        <!-- Popup archétype : gauche = carte + infos, droite = recherche + toutes les cartes -->
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
                  <h2 id="archetype-modal-title" class="archetype-modal__title">
                    {{ archetypeModalName }}
                  </h2>
                  <button
                    type="button"
                    class="archetype-modal__close"
                    aria-label="Fermer"
                    @click="closeArchetypeModal"
                  >
                    ×
                  </button>
                </div>
                <div class="archetype-modal__body">
                  <template v-if="modalLoading">
                    <div class="archetype-modal-loading">
                      <p>Chargement des cartes…</p>
                    </div>
                  </template>
                  <template v-else>
                    <!-- Partie gauche : carte en grand + infos -->
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
                      <p v-else class="archetype-modal__no-card">Aucune carte</p>
                    </div>
                    <!-- Partie droite : recherche + grille de cartes complètes -->
                    <div class="archetype-modal__right">
                      <input
                        v-model.trim="modalSearch"
                        type="search"
                        class="archetype-modal__search"
                        placeholder="Rechercher par nom…"
                        aria-label="Rechercher une carte"
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
                        Aucune carte ne correspond à la recherche.
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
        <!-- Animated background layers -->
        <div class="start-bg-vignette" aria-hidden="true" />
        <div class="start-bg-rays" aria-hidden="true" />
        <div class="start-bg-grid" aria-hidden="true" />
        <!-- Energy streaks -->
        <div class="start-streaks" aria-hidden="true">
          <span v-for="k in 6" :key="k" class="start-streak" :style="{ '--k': k }" />
        </div>
        <div class="start-particles" aria-hidden="true">
          <span v-for="j in 16" :key="j" class="start-particle" :style="{ '--i': j }" />
        </div>

        <div class="start-hero">
          <div class="start-glow" aria-hidden="true" />

          <!-- Floating card silhouettes -->
          <div class="start-cards-deco" aria-hidden="true">
            <span class="start-card-silhouette start-card-silhouette--l" />
            <span class="start-card-silhouette start-card-silhouette--r" />
            <span class="start-card-silhouette start-card-silhouette--bl" />
            <span class="start-card-silhouette start-card-silhouette--br" />
          </div>

          <!-- Millennium Eye decoration -->
          <div class="start-eye" aria-hidden="true">
            <span class="start-eye__ring" />
            <svg viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg" class="start-eye__svg">
              <path d="M32 4C18 4 6 20 6 20s12 16 26 16 26-16 26-16S46 4 32 4z" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.6"/>
              <circle cx="32" cy="20" r="7" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.8"/>
              <circle cx="32" cy="20" r="2.5" fill="currentColor" opacity="0.5"/>
              <path d="M32 8V2M32 38v-6M20 13l-3-4M44 13l3-4M20 27l-3 4M44 27l3 4" stroke="currentColor" stroke-width="1" opacity="0.3"/>
            </svg>
          </div>

          <p class="start-brand">Yu-Gi-Oh!</p>
          <h2 class="start-title" v-html="i('start.title').replace('\n', '<br>')" />
          <p class="start-tagline" v-html="i('start.tagline').replace('\n', '<br>')" />

          <!-- Decorative separator with chain motif -->
          <div class="start-separator" aria-hidden="true">
            <span class="start-separator__line" />
            <span class="start-separator__diamond" />
            <span class="start-separator__diamond start-separator__diamond--sm" />
            <span class="start-separator__diamond" />
            <span class="start-separator__line" />
          </div>

          <div class="start-cta-wrap">
            <button type="button" class="btn btn-gold btn-lg btn-start" @click="startTournament">
              {{ i('start.cta') }}
            </button>
          </div>

          <!-- Bottom decorative wings -->
          <div class="start-wings" aria-hidden="true">
            <span class="start-wing start-wing--l" />
            <span class="start-wing start-wing--r" />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.header {
  padding: 1.35rem 2rem;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, var(--bg-elevated) 0%, rgba(10, 10, 14, 0.95) 100%);
  flex-shrink: 0;
  position: relative;
}

.header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(232, 192, 64, 0.15) 50%, transparent 100%);
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
  font-size: 0.7rem;
  font-weight: 600;
  background: linear-gradient(90deg, var(--accent), #f0d060, var(--accent));
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0.12em;
  margin: 0;
  text-transform: uppercase;
}

.logo {
  font-family: 'Outfit', sans-serif;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  letter-spacing: -0.025em;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.progress-pill {
  display: inline-block;
  padding: 0.35rem 0.75rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  border: 1px solid rgba(232, 192, 64, 0.2);
  border-radius: var(--radius-pill);
  background: rgba(232, 192, 64, 0.06);
  white-space: nowrap;
}

.main {
  max-width: 96rem;
  margin: 0 auto;
  padding: 0.5rem 2rem 2rem;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.screen-center {
  display: grid;
  place-items: center;
  min-height: 50vh;
}

/* ——— Yu-Gi-Oh themed loading ——— */
.loading-screen {
  min-height: 55vh;
}

.ygo-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
}

.ygo-loader__card-wrap {
  position: relative;
  width: 80px;
  aspect-ratio: 421 / 614;
  transform-style: preserve-3d;
  animation: ygo-card-spin 1.8s ease-in-out infinite;
}

.ygo-loader__card-back {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: url(/card-back.png) center / cover no-repeat;
  border: 2px solid rgba(232, 192, 64, 0.3);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.5),
    0 6px 24px rgba(0, 0, 0, 0.5);
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
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin: 0;
  animation: ygo-pulse 1.2s ease-in-out infinite;
}

.ygo-loader__sub {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0;
  animation: ygo-pulse 1.2s ease-in-out infinite 0.3s both;
}

@keyframes ygo-pulse {
  50% { opacity: 0.7; }
}

.ygo-loader--small .ygo-loader__card-wrap {
  width: 52px;
  animation-duration: 2s;
}

.ygo-loader--small .ygo-loader__text {
  font-size: 0.95rem;
}

/* ——— Start screen hero (Yu-Gi-Oh immersive) ——— */
.start-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 56px);
  min-height: calc(100dvh - 56px);
  padding: 1.5rem 2rem;
  position: relative;
  overflow: hidden;
  /* Break out of .main padding & max-width to fill full viewport width */
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  margin-top: -0.75rem; /* cancel .main top padding */
  margin-bottom: -1.5rem; /* cancel .main bottom padding */
}

/* Dark vignette overlay */
.start-bg-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, rgba(6, 6, 8, 0.7) 100%);
  pointer-events: none;
  z-index: 1;
}

/* Rotating light rays behind the hero */
.start-bg-rays {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 160vmax;
  height: 160vmax;
  transform: translate(-50%, -50%);
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(232, 192, 64, 0.05) 8deg,
    transparent 16deg,
    transparent 30deg,
    rgba(232, 192, 64, 0.04) 38deg,
    transparent 46deg,
    transparent 60deg,
    rgba(232, 192, 64, 0.05) 68deg,
    transparent 76deg,
    transparent 90deg,
    rgba(232, 192, 64, 0.04) 98deg,
    transparent 106deg,
    transparent 120deg,
    rgba(232, 192, 64, 0.05) 128deg,
    transparent 136deg,
    transparent 150deg,
    rgba(232, 192, 64, 0.04) 158deg,
    transparent 166deg,
    transparent 180deg,
    rgba(232, 192, 64, 0.05) 188deg,
    transparent 196deg,
    transparent 210deg,
    rgba(232, 192, 64, 0.04) 218deg,
    transparent 226deg,
    transparent 240deg,
    rgba(232, 192, 64, 0.05) 248deg,
    transparent 256deg,
    transparent 270deg,
    rgba(232, 192, 64, 0.04) 278deg,
    transparent 286deg,
    transparent 300deg,
    rgba(232, 192, 64, 0.05) 308deg,
    transparent 316deg,
    transparent 330deg,
    rgba(232, 192, 64, 0.04) 338deg,
    transparent 346deg,
    transparent 360deg
  );
  animation: start-rays-rotate 45s linear infinite;
  pointer-events: none;
}

@keyframes start-rays-rotate {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

/* Subtle grid pattern (holo card texture) */
.start-bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(232, 192, 64, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(232, 192, 64, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0, 0, 0, 0.5) 0%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0, 0, 0, 0.5) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* Energy streaks — diagonal light trails */
.start-streaks {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}

.start-streak {
  position: absolute;
  width: 120px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(232, 192, 64, 0.25), transparent);
  transform: rotate(-35deg);
  opacity: 0;
  animation: start-streak-fly 8s ease-in-out infinite;
  animation-delay: calc(var(--k) * 1.3s);
  top: calc(var(--k) * 15%);
  left: -10%;
}

.start-streak:nth-child(even) {
  width: 80px;
  transform: rotate(-40deg);
  animation-duration: 10s;
  background: linear-gradient(90deg, transparent, rgba(232, 192, 64, 0.15), transparent);
}

@keyframes start-streak-fly {
  0% { opacity: 0; left: -15%; }
  10% { opacity: 0.6; }
  50% { opacity: 0.3; }
  100% { opacity: 0; left: 115%; }
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
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0;
  animation: start-particle-float 6s ease-in-out infinite;
  animation-delay: calc(var(--i) * 0.45s);
  left: calc(5% + var(--i) * 5.5%);
  top: calc(85% + var(--i) * 0.8%);
}

.start-particle:nth-child(even) {
  width: 2px;
  height: 2px;
  animation-duration: 8s;
}

.start-particle:nth-child(3n) {
  width: 4px;
  height: 4px;
  animation-duration: 7s;
  background: linear-gradient(135deg, var(--accent), #f0d060);
  box-shadow: 0 0 6px rgba(232, 192, 64, 0.4);
}

@keyframes start-particle-float {
  0% { opacity: 0; transform: translateY(0) scale(0.5); }
  15% { opacity: 0.7; }
  50% { opacity: 0.3; }
  100% { opacity: 0; transform: translateY(-55vh) scale(0); }
}

.start-hero {
  position: relative;
  text-align: center;
  max-width: 32rem;
  z-index: 3;
  animation: start-hero-enter 1.2s var(--ease-out) both;
}

@keyframes start-hero-enter {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(30px);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }
}

.start-glow {
  position: absolute;
  top: -60%;
  left: 50%;
  transform: translateX(-50%);
  width: 200%;
  height: 120%;
  background:
    radial-gradient(ellipse 50% 35% at 50% 35%, rgba(232, 192, 64, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse 80% 60% at 50% 40%, rgba(232, 192, 64, 0.06) 0%, transparent 60%);
  pointer-events: none;
  animation: start-glow-pulse 4s ease-in-out infinite;
}

@keyframes start-glow-pulse {
  0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
  50% { opacity: 0.65; transform: translateX(-50%) scale(1.12); }
}

/* Millennium Eye */
.start-eye {
  position: relative;
  display: flex;
  justify-content: center;
  margin-bottom: 1.25rem;
  animation: start-eye-in 1s var(--ease-out) 0.1s both;
}

.start-eye__svg {
  width: 56px;
  height: 35px;
  color: var(--accent);
  filter: drop-shadow(0 0 16px rgba(232, 192, 64, 0.5));
  animation: start-eye-glow 3s ease-in-out infinite;
}

@keyframes start-eye-in {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes start-eye-glow {
  0%, 100% { filter: drop-shadow(0 0 16px rgba(232, 192, 64, 0.5)) drop-shadow(0 0 4px rgba(232, 192, 64, 0.3)); }
  50% { filter: drop-shadow(0 0 28px rgba(232, 192, 64, 0.8)) drop-shadow(0 0 8px rgba(232, 192, 64, 0.5)); }
}

.start-eye__ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 1px solid rgba(232, 192, 64, 0.15);
  animation: start-ring-pulse 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes start-ring-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
  50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.5; }
}

/* Floating card silhouettes */
.start-cards-deco {
  position: absolute;
  inset: -40%;
  pointer-events: none;
  overflow: visible;
}

.start-card-silhouette {
  position: absolute;
  width: 58px;
  aspect-ratio: 421 / 614;
  border-radius: 6px;
  background: url(/card-back.png) center / cover no-repeat;
  border: 1.5px solid rgba(232, 192, 64, 0.25);
  animation: start-card-float 5s ease-in-out infinite;
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(232, 192, 64, 0.08);
}

.start-card-silhouette--l {
  left: 5%;
  top: 25%;
  animation-delay: 0s;
  transform: rotate(-15deg);
}

.start-card-silhouette--r {
  right: 5%;
  top: 20%;
  animation-delay: 1.2s;
  animation-direction: reverse;
  transform: rotate(12deg);
}

.start-card-silhouette--bl {
  left: 15%;
  bottom: 2%;
  top: auto;
  width: 44px;
  animation-delay: 0.6s;
  transform: rotate(-8deg);
  opacity: 0.6;
}

.start-card-silhouette--br {
  right: 12%;
  bottom: 5%;
  top: auto;
  width: 48px;
  animation-delay: 1.8s;
  animation-direction: reverse;
  transform: rotate(14deg);
  opacity: 0.6;
}

@keyframes start-card-float {
  0%, 100% {
    transform: translateY(0) rotate(var(--base-rot, -5deg)) scale(1);
    opacity: 0.7;
  }
  50% {
    transform: translateY(-14px) rotate(calc(var(--base-rot, -5deg) + 4deg)) scale(1.03);
    opacity: 1;
  }
}

.start-brand {
  position: relative;
  font-size: 1rem;
  font-weight: 700;
  background: linear-gradient(90deg, #c9a020, var(--accent), #f5e080, var(--accent), #c9a020);
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0.3em;
  margin: 0 0 0.6rem;
  text-transform: uppercase;
  animation: start-brand-shine 3s ease-in-out infinite, start-brand-in 0.8s var(--ease-out) 0.15s both;
  text-shadow: none;
}

@keyframes start-brand-in {
  from { opacity: 0; letter-spacing: 0.5em; }
  to { opacity: 1; letter-spacing: 0.25em; }
}

@keyframes start-brand-shine {
  0% { background-position: 200% 0; filter: brightness(1); }
  50% { background-position: -50% 0; filter: brightness(1.4) drop-shadow(0 0 16px rgba(232, 192, 64, 0.5)); }
  100% { background-position: 200% 0; filter: brightness(1); }
}

.start-title {
  position: relative;
  font-family: 'Outfit', sans-serif;
  font-size: clamp(2.2rem, 7vw, 3.2rem);
  font-weight: 700;
  color: var(--text);
  margin: 0 0 1rem;
  letter-spacing: -0.02em;
  line-height: 1.08;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
  animation: start-title-in 1s var(--ease-out) 0.2s both;
}

.start-title::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), rgba(240, 208, 96, 0.8), var(--accent), transparent);
  animation: start-title-underline 1.2s var(--ease-out) 0.8s forwards;
  box-shadow: 0 0 12px rgba(232, 192, 64, 0.3);
}

@keyframes start-title-underline {
  to { width: 80%; }
}

@keyframes start-title-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    filter: blur(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

.start-tagline {
  position: relative;
  font-size: 0.92rem;
  color: var(--text-secondary);
  margin: 0 0 1.75rem;
  line-height: 1.5;
  animation: start-tagline-in 0.7s var(--ease-out) 0.35s both;
}

@keyframes start-tagline-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Decorative separator */
.start-separator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin: 1.25rem 0 1.75rem;
  animation: start-sep-in 0.6s var(--ease-out) 0.45s both;
}

@keyframes start-sep-in {
  from { opacity: 0; transform: scaleX(0.3); }
  to { opacity: 1; transform: scaleX(1); }
}

.start-separator__line {
  display: block;
  width: 3rem;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(232, 192, 64, 0.4), transparent);
}

.start-separator__diamond {
  display: block;
  width: 7px;
  height: 7px;
  background: var(--accent);
  transform: rotate(45deg);
  opacity: 0.7;
  box-shadow: 0 0 10px rgba(232, 192, 64, 0.5);
}

.start-separator__diamond--sm {
  width: 5px;
  height: 5px;
  opacity: 0.4;
  margin: 0 0.25rem;
  box-shadow: 0 0 6px rgba(232, 192, 64, 0.3);
}

.start-cta-wrap {
  position: relative;
  display: inline-block;
  margin-top: 0.5rem;
  animation: start-cta-in 0.7s var(--ease-out) 0.55s both;
}

/* Outer pulsing glow ring */
.start-cta-wrap::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 18px;
  background: transparent;
  border: 1.5px solid rgba(232, 192, 64, 0.25);
  box-shadow:
    0 0 20px rgba(232, 192, 64, 0.15),
    0 0 40px rgba(232, 192, 64, 0.08),
    inset 0 0 20px rgba(232, 192, 64, 0.05);
  animation: start-cta-ring-pulse 3s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}

/* Sweeping shimmer highlight */
.start-cta-wrap::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 14px;
  background: linear-gradient(
    105deg,
    transparent 0%,
    transparent 35%,
    rgba(232, 192, 64, 0.35) 45%,
    rgba(255, 220, 100, 0.2) 50%,
    rgba(232, 192, 64, 0.35) 55%,
    transparent 65%,
    transparent 100%
  );
  background-size: 300% 100%;
  animation: start-cta-shimmer 4s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}

@keyframes start-cta-ring-pulse {
  0%, 100% {
    opacity: 0.5;
    inset: -8px;
    border-color: rgba(232, 192, 64, 0.25);
    box-shadow: 0 0 20px rgba(232, 192, 64, 0.15), 0 0 40px rgba(232, 192, 64, 0.08);
  }
  50% {
    opacity: 1;
    inset: -12px;
    border-color: rgba(232, 192, 64, 0.4);
    box-shadow: 0 0 30px rgba(232, 192, 64, 0.25), 0 0 60px rgba(232, 192, 64, 0.12);
  }
}

@keyframes start-cta-shimmer {
  0% { background-position: 300% 0; }
  100% { background-position: -100% 0; }
}

@keyframes start-cta-in {
  from { opacity: 0; transform: translateY(16px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.btn-start {
  position: relative;
  z-index: 1;
  padding: 1rem 2.25rem;
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  box-shadow: 0 4px 24px rgba(232, 192, 64, 0.3);
  transition: box-shadow 0.3s var(--ease), transform 0.2s var(--ease);
  animation: start-btn-idle 2.5s ease-in-out infinite;
}

@keyframes start-btn-idle {
  0%, 100% { box-shadow: 0 4px 24px rgba(232, 192, 64, 0.3); }
  50% { box-shadow: 0 8px 40px rgba(232, 192, 64, 0.5), 0 0 60px rgba(232, 192, 64, 0.12); }
}

.btn-start:hover {
  box-shadow: 0 6px 28px rgba(232, 192, 64, 0.38);
  transform: translateY(-1px);
  animation: none;
}

/* Decorative wings below CTA */
.start-wings {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-top: 1.25rem;
  animation: start-cta-in 0.7s var(--ease-out) 0.7s both;
}

.start-wing {
  display: block;
  width: 80px;
  height: 1px;
  position: relative;
}

.start-wing::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(232, 192, 64, 0.3));
}

.start-wing--r::before {
  background: linear-gradient(90deg, rgba(232, 192, 64, 0.3), transparent);
}

.start-wing::after {
  content: '';
  position: absolute;
  top: -2px;
  width: 5px;
  height: 5px;
  background: var(--accent);
  border-radius: 50%;
  opacity: 0.4;
}

.start-wing--l::after {
  right: 0;
}

.start-wing--r::after {
  left: 0;
}

.duel-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.duel-enter-active,
.duel-leave-active {
  transition: opacity 0.25s var(--ease), transform 0.25s var(--ease);
}

.duel-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.duel-enter-from {
  opacity: 0;
  transform: scale(1.02);
}

.results-enter-active {
  transition: opacity 0.35s var(--ease), transform 0.35s var(--ease);
}

.results-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.error-box {
  padding: 0.9rem 1.1rem;
  background: rgba(185, 28, 28, 0.1);
  border: 1px solid rgba(185, 28, 28, 0.35);
  border-radius: var(--radius-sm);
  color: #fca5a5;
  max-width: 28rem;
  margin: 2rem auto;
  font-size: 0.9rem;
}

.duel-section {
  text-align: center;
  padding: 0.5rem 0 2rem;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.duel-header {
  margin-bottom: 1rem;
}

.duel-category-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 2rem;
}

.duel-category-row .duel-category-label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.duel-category-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 1.25rem;
}

.btn-sm {
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
}

.duel-instruction {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-secondary);
}

/* Grille de base : centrée, gap uniforme. Les classes -2/-3/-4 définissent la taille des colonnes. */
.cards-grid {
  display: grid;
  gap: 1.75rem;
  justify-content: center;
  align-items: start;
  margin: 0 auto;
  width: 100%;
  max-width: 100%;
}

/* ——— Duel à 4 : cartes plus grandes (2×2 mobile, 4 en ligne desktop) ——— */
.cards-grid-4 {
  grid-template-columns: repeat(2, minmax(0, 280px));
  gap: 1.5rem;
}

@media (min-width: 480px) {
  .cards-grid-4 {
    grid-template-columns: repeat(2, minmax(0, 300px));
    gap: 1.75rem;
  }
}

@media (min-width: 640px) {
  .cards-grid-4 {
    grid-template-columns: repeat(4, minmax(0, 280px));
    gap: 2rem;
  }
}

@media (min-width: 1024px) {
  .cards-grid-4 {
    grid-template-columns: repeat(4, minmax(0, 320px));
    gap: 2.25rem;
  }
}

/* ——— Duel à 3 : cartes intermédiaires (empilées mobile, 3 en ligne desktop) ——— */
.cards-grid-3 {
  grid-template-columns: repeat(1, minmax(0, 300px));
  gap: 1.75rem;
}

@media (min-width: 640px) {
  .cards-grid-3 {
    grid-template-columns: repeat(3, minmax(0, 280px));
    gap: 2rem;
  }
}

@media (min-width: 1024px) {
  .cards-grid-3 {
    grid-template-columns: repeat(3, minmax(0, 320px));
    gap: 2.25rem;
  }
}

/* ——— Duel à 2 : même taille de cartes que la grille à 4 ——— */
.cards-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 280px));
  gap: 1.5rem;
}

@media (min-width: 480px) {
  .cards-grid-2 {
    grid-template-columns: repeat(2, minmax(0, 300px));
    gap: 1.75rem;
  }
}

@media (min-width: 640px) {
  .cards-grid-2 {
    grid-template-columns: repeat(2, minmax(0, 280px));
    gap: 2rem;
  }
}

@media (min-width: 1024px) {
  .cards-grid-2 {
    grid-template-columns: repeat(2, minmax(0, 320px));
    gap: 2.25rem;
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
}

.btn-lg {
  padding: 0.85rem 1.75rem;
  font-size: 0.95rem;
}

/* (start-screen overrides removed – now handled in the main block above) */

.results-section {
  max-width: 34rem;
  margin: 0 auto;
  padding: 2.5rem 0 3rem;
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
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  margin-bottom: 0.25rem;
  display: block;
}

.results-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.75rem;
  font-weight: 700;
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
  background: linear-gradient(90deg, transparent, rgba(232, 192, 64, 0.3), transparent);
}

.results-separator__diamond {
  display: block;
  width: 5px;
  height: 5px;
  background: var(--accent);
  transform: rotate(45deg);
  opacity: 0.5;
}

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
  padding: 0.9rem 1.25rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  transition: background 0.2s var(--ease), transform 0.15s var(--ease);
  animation: results-item-in 0.4s var(--ease-out) both;
}

.top-item:nth-child(1) { animation-delay: 0.05s; }
.top-item:nth-child(2) { animation-delay: 0.1s; }
.top-item:nth-child(3) { animation-delay: 0.15s; }
.top-item:nth-child(4) { animation-delay: 0.2s; }
.top-item:nth-child(5) { animation-delay: 0.25s; }
.top-item:nth-child(6) { animation-delay: 0.3s; }
.top-item:nth-child(7) { animation-delay: 0.35s; }
.top-item:nth-child(8) { animation-delay: 0.4s; }
.top-item:nth-child(9) { animation-delay: 0.45s; }
.top-item:nth-child(10) { animation-delay: 0.5s; }

@keyframes results-item-in {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}

.top-item--gold {
  background: linear-gradient(90deg, rgba(232, 192, 64, 0.1) 0%, rgba(232, 192, 64, 0.03) 100%);
  border-left: 3px solid var(--accent);
}

.top-item--silver {
  background: linear-gradient(90deg, rgba(192, 192, 192, 0.06) 0%, transparent 100%);
  border-left: 3px solid rgba(192, 192, 192, 0.5);
}

.top-item--bronze {
  background: linear-gradient(90deg, rgba(205, 127, 50, 0.06) 0%, transparent 100%);
  border-left: 3px solid rgba(205, 127, 50, 0.5);
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
  outline-offset: 2px;
}

.top-rank {
  font-weight: 800;
  color: var(--accent);
  min-width: 1.75rem;
  font-size: 1rem;
  text-align: center;
}

.top-medal {
  font-size: 1.1rem;
}

.top-name {
  flex: 1;
  font-weight: 600;
  color: var(--text);
}

.top-item--gold .top-name {
  color: var(--accent);
}

.top-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
}

.top-elo {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.top-record {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* ——— Popup archétype (résultats) ——— */
.archetype-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  box-sizing: border-box;
}

.archetype-modal {
  width: 100%;
  max-width: 42rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.archetype-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.archetype-modal__title {
  margin: 0;
  font-family: 'Outfit', sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text);
}

.archetype-modal__close {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}

.archetype-modal__close:hover {
  color: var(--text);
  background: var(--bg-elevated);
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
  padding: 2rem;
  text-align: center;
  color: var(--text-muted);
}

.archetype-modal__left {
  width: 42%;
  min-width: 240px;
  padding: 1.25rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  border-right: 1px solid var(--border);
}

.archetype-modal__card-large {
  width: 100%;
  max-width: 280px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  display: block;
}

.archetype-modal__info {
  width: 100%;
  max-width: 280px;
  text-align: left;
}

.archetype-modal__card-name {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.archetype-modal__card-type {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.archetype-modal__stat {
  margin: 0 0 0.2rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.archetype-modal__desc {
  margin: 0.5rem 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--text-secondary);
}

.archetype-modal__no-card {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
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
  padding: 0.6rem 0.85rem;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
  flex-shrink: 0;
}

.archetype-modal__search::placeholder {
  color: var(--text-muted);
}

.archetype-modal__search:focus {
  outline: none;
  border-color: var(--accent);
}

.archetype-modal__list-wrap {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 0.6rem;
  align-content: start;
}

.archetype-modal__card-thumb {
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s;
}

.archetype-modal__card-thumb:hover {
  transform: scale(1.02);
}

.archetype-modal__card-thumb--selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.archetype-modal__card-thumb:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.archetype-modal__card-thumb-img {
  width: 100%;
  display: block;
  border-radius: calc(var(--radius-sm) - 2px);
}

.archetype-modal__empty {
  margin: 1rem 0 0;
  font-size: 0.85rem;
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
    border-bottom: 1px solid var(--border);
    max-height: 45vh;
  }
  .archetype-modal__right {
    min-height: 200px;
  }
  .archetype-modal__list-wrap {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s var(--ease);
}

.modal-enter-active .archetype-modal,
.modal-leave-active .archetype-modal {
  transition: transform 0.25s var(--ease);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .archetype-modal,
.modal-leave-to .archetype-modal {
  transform: scale(0.95);
}
</style>
