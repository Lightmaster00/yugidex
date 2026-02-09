<script setup lang="ts">
import { CARD_BACK_IMAGE_URL } from '~/utils/representativeCard'

defineProps<{
  name: string
  cardName?: string
  frameType?: string
  attribute?: string
  level?: number
  race?: string
  atk?: number
  def?: number
  imageUrlFull?: string
  cardId?: number
  imageUrl?: string
  selected?: boolean
  showElo?: boolean
  elo?: number
  /** Afficher le dos de carte Yu-Gi-Oh! (quand l'archétype n'a pas de carte à ce slot/catégorie). */
  showCardBack?: boolean
}>()

const emit = defineEmits<{
  select: []
}>()

const cardBackImageUrl = CARD_BACK_IMAGE_URL
const cardBackLoadFailed = ref(false)

function onCardBackError () {
  cardBackLoadFailed.value = true
}
</script>

<template>
  <div
    class="archetype-card"
    :class="{ selected }"
  >
    <!-- Clickable area: header + card -->
    <button
      type="button"
      class="archetype-card__select-btn"
      @click="emit('select')"
    >
      <!-- Archetype name ABOVE the card -->
      <div class="archetype-card__header">
        <span class="archetype-card__name">{{ name }}</span>
        <span v-if="showElo && elo != null" class="archetype-card__elo">{{ elo }}</span>
      </div>

      <span class="archetype-card__card-wrap">
        <template v-if="showCardBack">
          <img
            v-if="!cardBackLoadFailed"
            :src="cardBackImageUrl"
            alt=""
            class="archetype-card__back-img"
            @error="onCardBackError"
          >
          <div
            v-else
            class="archetype-card__back"
            aria-hidden="true"
          />
        </template>
        <YgoCardFrame
          v-if="!showCardBack"
          :card-name="cardName ?? name"
          :frame-type="frameType"
          :image-url-full="imageUrlFull"
          :attribute="attribute"
          :level="level"
          :race="race"
          :atk="atk"
          :def="def"
          :card-id="cardId"
          :image-url="imageUrl"
          :alt="name"
        />
      </span>
    </button>
  </div>
</template>

<style scoped>
/* max-width peut être contraint par le parent (ex. .duel-arena__slot) via --archetype-card-max-width */
.archetype-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: var(--archetype-card-max-width, 100%);
  margin: 0 auto;
  overflow: visible;
  box-sizing: border-box;
}

.archetype-card__select-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
  overflow: visible;
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.archetype-card__select-btn:active {
  transform: scale(0.97);
}

.archetype-card__select-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 12px;
}

.archetype-card.selected .archetype-card__select-btn {
  outline: 2px solid var(--accent);
  outline-offset: 6px;
  border-radius: 12px;
}

/* Header above card: archetype name + Elo */
.archetype-card__header {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
  padding: 0 0.25rem 0.45rem;
  width: 100%;
  min-height: 1.4rem;
  position: relative;
  z-index: 1;
}

.archetype-card__name {
  font-family: 'Outfit', sans-serif;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  transition: color 0.2s ease;
}

.archetype-card__select-btn:hover .archetype-card__name {
  color: var(--text);
}

.archetype-card.selected .archetype-card__name {
  color: var(--accent);
}

.archetype-card__elo {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* Card wrap: hover zoom — padding reserves space so the scale doesn't overlap neighbours */
.archetype-card__card-wrap {
  display: block;
  width: 100%;
  max-width: 100%;
  padding: 6px 0;
  transform-origin: center center;
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), filter 0.3s ease;
  box-sizing: border-box;
}

.archetype-card__select-btn:hover .archetype-card__card-wrap {
  transform: scale(1.04);
}

.archetype-card.selected .archetype-card__card-wrap {
  filter: drop-shadow(0 0 24px var(--accent-glow)) drop-shadow(0 0 8px rgba(232, 192, 64, 0.15));
}

.archetype-card__select-btn:active .archetype-card__card-wrap {
  transform: scale(1.01);
}

/* Deep card styles for interaction feedback */
.archetype-card__select-btn :deep(.ygo-card),
.archetype-card__select-btn :deep(.ygo-card--official) {
  transition: box-shadow 0.3s ease;
}

.archetype-card__select-btn :deep(.ygo-card__full-img) {
  transition: filter 0.3s ease;
}

.archetype-card__select-btn :deep(.ygo-card__picture-inner img) {
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), filter 0.3s ease;
}

.archetype-card__select-btn:hover :deep(.ygo-card--official) {
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.5),
    0 4px 16px rgba(0, 0, 0, 0.3);
}

.archetype-card__select-btn:hover :deep(.ygo-card__picture-inner img) {
  transform: scale(1.03);
}

.archetype-card.selected :deep(.ygo-card--official) {
  box-shadow:
    0 0 0 2px var(--accent),
    0 12px 40px rgba(0, 0, 0, 0.4),
    0 0 32px var(--accent-glow);
}

.archetype-card.selected :deep(.ygo-card__full-img),
.archetype-card.selected :deep(.ygo-card__picture-inner img) {
  filter: drop-shadow(0 0 16px var(--accent-glow));
}

/* Dos de carte Yu-Gi-Oh! — image depuis l'API (même CDN), ratio 421/614 */
.archetype-card__back-img {
  width: 100%;
  aspect-ratio: 421 / 614;
  object-fit: cover;
  border-radius: 10px;
  display: block;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.4),
    0 8px 32px rgba(0, 0, 0, 0.3);
}

/* Fallback si l'image du dos ne charge pas (CSS) */
.archetype-card__back {
  width: 100%;
  aspect-ratio: 421 / 614;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(145deg, #2a1f18 0%, #1a1210 40%, #0f0c0a 100%);
  border: 2px solid rgba(180, 140, 90, 0.4);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.4),
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 0 0 1px rgba(200, 160, 100, 0.15);
  position: relative;
}

.archetype-card__back::before {
  content: '';
  position: absolute;
  inset: 8%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse 70% 80% at 50% 50%,
    rgba(200, 160, 90, 0.35) 0%,
    rgba(160, 120, 60, 0.2) 40%,
    transparent 70%
  );
  pointer-events: none;
}

.archetype-card__back::after {
  content: '';
  position: absolute;
  inset: 12%;
  border: 2px solid rgba(200, 160, 90, 0.25);
  border-radius: 50%;
  pointer-events: none;
}
</style>
