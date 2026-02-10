<script setup lang="ts">
import type { ExtraPolicy } from '~/types/ranking'
import { CARD_BACK_IMAGE_URL } from '~/utils/representativeCard'

const props = defineProps<{
  name: string
  imageUrl?: string
  selected?: boolean
  showElo?: boolean
  elo?: number
  cardType?: string
  extraPolicy?: ExtraPolicy
  showCardBack?: boolean
}>()

const emit = defineEmits<{
  select: []
}>()

const cardBackImageUrl = CARD_BACK_IMAGE_URL
const cardBackLoadFailed = ref(false)

/** True when the loaded image is taller than wide (needs crop). */
const isTallImage = ref(false)

// Reset tall-image flag when the image URL changes (e.g. cycling representative cards)
watch(() => props.imageUrl, () => {
  isTallImage.value = false
})

function onCardBackError () {
  cardBackLoadFailed.value = true
}

/** On image load, detect if the artwork is taller than square and needs cropping. */
function onArtworkLoad (e: Event) {
  const img = e.target as HTMLImageElement
  if (img.naturalHeight > img.naturalWidth) {
    isTallImage.value = true
  } else {
    isTallImage.value = false
  }
}

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
    class="ac"
    :class="{ 'ac--selected': selected }"
  >
    <button
      type="button"
      class="ac__btn"
      @click="emit('select')"
    >
      <!-- Card frame -->
      <span class="ac__frame">
        <!-- Square artwork -->
        <span class="ac__art">
          <span class="ac__shine" aria-hidden="true" />
          <template v-if="showCardBack">
            <img
              v-if="!cardBackLoadFailed"
              :src="cardBackImageUrl"
              alt=""
              class="ac__img"
              @error="onCardBackError"
            >
            <span v-else class="ac__back" aria-hidden="true" />
          </template>
          <img
            v-else-if="imageUrl"
            :src="imageUrl"
            :alt="name"
            class="ac__img"
            :class="{ 'ac__img--tall': isTallImage }"
            @load="onArtworkLoad"
          >
          <span v-else class="ac__empty" aria-hidden="true" />
        </span>
        <!-- Name plate -->
        <span class="ac__plate">
          <span class="ac__name">{{ name }}</span>
          <span v-if="tagLabel(cardType, extraPolicy)" class="ac__tag">{{ tagLabel(cardType, extraPolicy) }}</span>
        </span>
      </span>
      <!-- Elo badge (duel mode only) -->
      <span v-if="showElo && elo != null" class="ac__elo">{{ elo }} ELO</span>
    </button>
  </div>
</template>

<style scoped>
.ac {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: var(--archetype-card-max-width, 100%);
  margin: 0 auto;
}

.ac__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.ac__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 6px;
  border-radius: 14px;
}

/* ── Card Frame ── */
.ac__frame {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #0b0b10;
  border: 1.5px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.5),
    0 8px 28px rgba(0, 0, 0, 0.35);
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.35s ease,
    border-color 0.3s ease;
}

.ac__btn:hover .ac__frame {
  transform: translateY(-5px) scale(1.015);
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.5),
    0 20px 48px rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.1);
}

.ac__btn:active .ac__frame {
  transform: scale(0.97);
}

.ac--selected .ac__frame {
  border-color: var(--accent);
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.5),
    0 20px 48px rgba(0, 0, 0, 0.4),
    0 0 0 1px var(--accent),
    0 0 24px rgba(232, 197, 71, 0.15),
    0 0 48px rgba(232, 197, 71, 0.08);
  transform: translateY(-3px);
}

/* ── Square Artwork ── */
.ac__art {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  background: #08080c;
  overflow: hidden;
}

.ac__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
  background: #08080c;
}

/* Tall artwork (e.g. Pendulum cards with scales area at bottom).
   Use cover + top to crop the bottom and match standard card height. */
.ac__img--tall {
  object-fit: cover;
  object-position: top center;
}

.ac__back {
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, #1e1814 0%, #12100e 50%, #0a0908 100%);
}

.ac__empty {
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, #0c0c10 0%, #08080c 100%);
}

/* Shine sweep on hover */
.ac__shine {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(
    115deg,
    transparent 0%,
    transparent 35%,
    rgba(255, 255, 255, 0.06) 45%,
    rgba(255, 255, 255, 0.12) 50%,
    rgba(255, 255, 255, 0.06) 55%,
    transparent 65%,
    transparent 100%
  );
  background-size: 250% 100%;
  background-position: 200% 0;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.ac__btn:hover .ac__shine {
  opacity: 1;
  animation: ac-shine 0.7s ease forwards;
}

@keyframes ac-shine {
  from { background-position: 200% 0; }
  to { background-position: -50% 0; }
}

/* Gold glow ring for selected */
.ac--selected .ac__art::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  box-shadow: inset 0 0 20px rgba(232, 197, 71, 0.12);
  animation: ac-ring-pulse 2.5s ease-in-out infinite;
}

@keyframes ac-ring-pulse {
  0%, 100% { box-shadow: inset 0 0 20px rgba(232, 197, 71, 0.12); }
  50% { box-shadow: inset 0 0 30px rgba(232, 197, 71, 0.2); }
}

/* ── Name Plate ── */
.ac__plate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.55rem 0.65rem;
  background: linear-gradient(180deg, #0e0e14 0%, #0b0b10 100%);
  min-height: 2rem;
}

.ac__name {
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  transition: color 0.2s ease;
}

.ac__btn:hover .ac__name {
  color: var(--text);
}

.ac--selected .ac__name {
  color: var(--accent);
}

.ac__tag {
  font-size: 0.58rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
}

/* ── Elo Badge ── */
.ac__elo {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  margin-top: 0.15rem;
}

.ac--selected .ac__elo {
  color: var(--accent);
}
</style>
