<script setup lang="ts">
import { getFrameStyle } from '~/utils/ygoFrameColors'

const props = withDefaults(
  defineProps<{
    cardName: string
    frameType?: string
    imageUrlFull?: string
    cardId?: number
    imageUrl?: string
    alt?: string
    attribute?: string
    level?: number
    race?: string
    atk?: number
    def?: number
  }>(),
  { frameType: 'effect', alt: '' }
)

const style = computed(() => getFrameStyle(props.frameType))

const fullCardImageUrl = computed(() => {
  if (props.imageUrlFull) return props.imageUrlFull
  if (props.cardId) return `https://images.ygoprodeck.com/images/cards/${props.cardId}.jpg`
  return ''
})

const useOfficialCard = computed(() => Boolean(fullCardImageUrl.value))
</script>

<template>
  <!-- Mode: full official image (API) — intact card without overlay -->
  <div
    v-if="useOfficialCard"
    class="ygo-card ygo-card--official"
  >
    <img
      :src="fullCardImageUrl"
      :alt="alt || cardName"
      class="ygo-card__full-img"
    />
  </div>

  <!-- Fallback: CSS layout (when no full image) -->
  <div
    v-else
    class="ygo-card"
    :style="{
      '--frame-bg': style.bg,
      '--frame-name-color': style.nameColor,
      '--frame-desc-bg': style.descBg,
      '--frame-desc-color': style.descColor
    }"
  >
    <div class="ygo-card__border-outer">
      <div class="ygo-card__border-inner">
        <div class="ygo-card__name-row">
          <span class="ygo-card__name">{{ cardName }}</span>
          <YgoAttributeIcon
            v-if="(frameType !== 'spell' && frameType !== 'trap') && attribute"
            :attribute="attribute"
          />
          <YgoAttributeIcon
            v-else-if="frameType === 'spell' || frameType === 'trap'"
            :card-kind="frameType === 'trap' ? 'trap' : 'spell'"
          />
        </div>
        <div class="ygo-card__level-row">
          <span v-if="(frameType !== 'spell' && frameType !== 'trap') && level != null && level > 0" class="ygo-card__stars">
            <template v-for="i in Math.min(12, level)" :key="i">★</template>
          </span>
        </div>
        <div class="ygo-card__picture">
          <div class="ygo-card__picture-inner">
            <CardImage
              :card-id="cardId"
              :image-url="imageUrl"
              :alt="alt || cardName"
            />
          </div>
        </div>
        <div class="ygo-card__type-line">
          {{ frameType === 'trap' ? '[Trap Card]' : frameType === 'spell' ? '[Spell Card]' : (race || 'Monster') + ' / ' + (frameType === 'normal' ? 'Normal' : 'Effect') }}
        </div>
        <div class="ygo-card__effect" />
        <div v-if="frameType !== 'spell' && frameType !== 'trap'" class="ygo-card__atkdef">
          <span class="ygo-card__atk">ATK</span>
          <span class="ygo-card__atk-value">{{ atk ?? '?' }}</span>
          <span class="ygo-card__def">DEF</span>
          <span class="ygo-card__def-value">{{ def ?? '?' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ygo-card {
  width: 100%;
  aspect-ratio: 421 / 614;
  max-width: 100%;
}

/* ========== Official card mode (full API image) ========== */
.ygo-card--official {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 8px 32px rgba(0, 0, 0, 0.25);
}

.ygo-card__full-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
  vertical-align: middle;
}

/* ========== Fallback layout CSS ========== */
.ygo-card__border-outer {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--frame-bg);
  border-radius: 8px;
  padding: 5px;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 8px 24px rgba(0, 0, 0, 0.2);
}

.ygo-card__border-inner {
  width: 100%;
  height: 100%;
  border: 2px solid #0a0a0a;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--frame-bg);
}

.ygo-card__name-row {
  flex: 0 0 7%;
  min-height: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 2px 6px 0;
  border-bottom: 1px solid #0a0a0a;
  background: var(--frame-bg);
}

.ygo-card__name {
  font-family: 'Outfit', system-ui, sans-serif;
  font-weight: 700;
  font-size: clamp(0.6rem, 1.8vw, 0.78rem);
  line-height: 1.1;
  color: var(--frame-name-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.ygo-card__level-row {
  flex: 0 0 4%;
  min-height: 14px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 6px 1px;
  border-bottom: 1px solid #0a0a0a;
  background: var(--frame-bg);
}

.ygo-card__stars {
  font-size: clamp(0.5rem, 1.5vw, 0.65rem);
  letter-spacing: -0.08em;
  color: var(--frame-name-color);
}

.ygo-card__picture {
  flex: 0 0 54%;
  min-height: 0;
  padding: 4px 5px;
  background: #0a0a0a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ygo-card__picture-inner {
  width: 100%;
  height: 100%;
  background: #111;
  overflow: hidden;
}

.ygo-card__picture-inner :deep(.card-image-inner) {
  width: 100%;
  height: 100%;
  background: #0c0c0e;
}

.ygo-card__picture-inner :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
}

.ygo-card__picture-inner :deep(.card-image-placeholder) {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.ygo-card__type-line {
  flex: 0 0 4%;
  min-height: 12px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  border-bottom: 1px solid #0a0a0a;
  background: var(--frame-desc-bg);
  font-size: clamp(0.5rem, 1.4vw, 0.62rem);
  font-weight: 700;
  color: var(--frame-desc-color);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ygo-card__effect {
  flex: 0 0 23%;
  min-height: 28px;
  background: var(--frame-desc-bg);
  border-bottom: 1px solid #0a0a0a;
}

.ygo-card__atkdef {
  flex: 0 0 8%;
  min-height: 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  padding: 0 6px 3px;
  background: var(--frame-desc-bg);
  font-size: clamp(0.52rem, 1.3vw, 0.6rem);
  font-weight: 700;
  color: var(--frame-desc-color);
  border-bottom: 2px solid #0a0a0a;
}

.ygo-card__atk,
.ygo-card__def {
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ygo-card__atk-value,
.ygo-card__def-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
