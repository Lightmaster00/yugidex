<script setup lang="ts">
import type { ExtraPolicy } from '~/types/ranking'
import { CARD_BACK_IMAGE_URL } from '~/utils/representativeCard'

defineProps<{
  name: string
  /** URL image de la carte. */
  imageUrl?: string
  selected?: boolean
  showElo?: boolean
  elo?: number
  /** Type de la carte affichée (Fusion, Synchro, Main, Pendulum, etc.) — selon la carte affichée. */
  cardType?: string
  /** Fallback si pas de cardType (tag Extra Deck de l'archétype). */
  extraPolicy?: ExtraPolicy
  /** Afficher le dos de carte quand pas d'image à ce slot. */
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

/** Libellé du tag sous le nom : type de la carte affichée, ou extraPolicy en fallback. */
function tagLabel (cardType?: string, extraPolicy?: ExtraPolicy): string | null {
  if (cardType) return cardType
  if (!extraPolicy || extraPolicy === 'none') return 'No Extra'
  if (extraPolicy === 'fusion') return 'Fusion'
  if (extraPolicy === 'synchro') return 'Synchro'
  if (extraPolicy === 'xyz') return 'Xyz'
  if (extraPolicy === 'link') return 'Link'
  if (extraPolicy === 'mixed') return 'Mixed'
  return null
}
</script>

<template>
  <div
    class="archetype-card"
    :class="{ selected }"
  >
    <button
      type="button"
      class="archetype-card__select-btn"
      @click="emit('select')"
    >
      <div class="archetype-card__header">
        <span class="archetype-card__name">{{ name }}</span>
        <span v-if="showElo && elo != null" class="archetype-card__elo">{{ elo }}</span>
      </div>
      <span v-if="tagLabel(cardType, extraPolicy)" class="archetype-card__tag">
        {{ tagLabel(cardType, extraPolicy) }}
      </span>
      <span class="archetype-card__artwork-wrap">
        <template v-if="showCardBack">
          <img
            v-if="!cardBackLoadFailed"
            :src="cardBackImageUrl"
            alt=""
            class="archetype-card__artwork"
            @error="onCardBackError"
          >
          <div
            v-else
            class="archetype-card__back"
            aria-hidden="true"
          />
        </template>
        <img
          v-else-if="imageUrl"
          :src="imageUrl"
          :alt="name"
          class="archetype-card__artwork"
        >
      </span>
    </button>
  </div>
</template>

<style scoped>
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

.archetype-card__header {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
  padding: 0 0.25rem 0.25rem;
  width: 100%;
  min-height: 1.4rem;
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

.archetype-card__tag {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-bottom: 0.35rem;
}

.archetype-card__artwork-wrap {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  margin-top: 1rem;
  padding: 4px 0;
  transform-origin: center center;
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), filter 0.3s ease;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  border-radius: 10px;
}

.archetype-card__select-btn:hover .archetype-card__artwork-wrap {
  transform: scale(1.04);
}

.archetype-card.selected .archetype-card__artwork-wrap {
  filter: drop-shadow(0 0 24px var(--accent-glow)) drop-shadow(0 0 8px rgba(232, 192, 64, 0.15));
}

/* Carré parfait, même taille pour toutes les images. */
.archetype-card__artwork {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  border-radius: 10px;
  display: block;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 8px 32px rgba(0, 0, 0, 0.3);
}

.archetype-card__back {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(145deg, #2a1f18 0%, #1a1210 40%, #0f0c0a 100%);
  border: 2px solid rgba(180, 140, 90, 0.4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 8px 32px rgba(0, 0, 0, 0.3);
}
</style>
