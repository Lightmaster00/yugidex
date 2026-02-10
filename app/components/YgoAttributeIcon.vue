<script setup lang="ts">
/** Attribute or Spell/Trap icon for Yu-Gi-Oh! card layout (official style) */
defineProps<{
  attribute?: string
  /** 'spell' | 'trap' for Spell/Trap cards */
  cardKind?: 'spell' | 'trap'
}>()
</script>

<template>
  <span class="ygo-attr" :class="[attribute ? `attr-${String(attribute).toLowerCase()}` : '', cardKind ? `kind-${cardKind}` : '']">
    <!-- DARK: croissant -->
    <svg v-if="attribute === 'DARK'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="attr-svg">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8 0-3.2 1.9-5.9 4.6-7.2C4.2 7.5 4 9.7 4 12c0 4.4 3.6 8 8 8 2.3 0 4.5-.2 6.2-.6C17.9 18.1 15.2 20 12 20z"/>
    </svg>
    <!-- LIGHT: soleil -->
    <svg v-else-if="attribute === 'LIGHT'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="attr-svg">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zm0 18c-3.3 0-6-.9-8.5-2.5 1.2-1.8 3-3.2 5.1-4-1.4.5-2.2 1.5-2.2 2.5 0 2.2 2.7 4 6 4s6-1.8 6-4c0-1-.8-2-2.2-2.5 2.1.8 3.9 2.2 5.1 4C18 19.1 15.3 20 12 20z"/>
      <circle cx="12" cy="12" r="2.5"/>
    </svg>
    <!-- FIRE: flamme -->
    <svg v-else-if="attribute === 'FIRE'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="attr-svg">
      <path d="M12 23c4.4 0 8-3.2 8-7.2 0-2.4-1.2-4.5-2.8-6 0 0-.8 2.2-3.2 2.2-2.4 0-4-1.8-4-4.2 0-1.5.6-2.8 1.4-3.8C8.2 6.2 6 9.2 6 12.8 6 19.2 8.6 23 12 23zM12 2C9 6 6 8 6 12c0 3.3 2.7 6 6 6s6-2.7 6-6c0-2-1.5-4.5-4-8-1 .5-2 1.5-2 2.5 0 1.7 1.3 3 3 3s3-1.3 3-3C22 5 17 2 12 2z"/>
    </svg>
    <!-- WATER: goutte -->
    <svg v-else-if="attribute === 'WATER'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="attr-svg">
      <path d="M12 2.2c-.5.6-4 5.2-4 9.8 0 3.3 2.7 6 6 6s6-2.7 6-6c0-4.6-3.5-9.2-4-9.8-.2-.2-.4-.2-.6 0-.2.2-.4.4-.6.6-.4.5-1 1.2-1.6 1.8-.5.5-1 1-1.4 1.4-.2.2-.4.2-.6 0-.2-.2-.4-.4-.6-.6-.4-.5-.8-1-1.2-1.5-.4-.5-.8-1-1.2-1.5-.2-.3-.4-.3-.6-.1z"/>
    </svg>
    <!-- EARTH: montagnes -->
    <svg v-else-if="attribute === 'EARTH'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="attr-svg">
      <path d="M4 18l4-6h3l2 4 3-8 4 10H4zm16-12l-2 5h-3l-2-4H8L5 14H2l2-12h16z"/>
    </svg>
    <!-- WIND: spiral -->
    <svg v-else-if="attribute === 'WIND'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="attr-svg">
      <path d="M12 2c.5 0 1 .4 1 1v2c0 .6-.5 1-1 1s-1-.4-1-1V3c0-.6.5-1 1-1zm0 16c.5 0 1 .4 1 1v2c0 .6-.5 1-1 1s-1-.4-1-1v-2c0-.6.5-1 1-1zm8-8c.5 0 1 .4 1 1v2c0 .6-.5 1-1 1s-1-.4-1-1v-2c0-.6.5-1 1-1zM4 10c.5 0 1 .4 1 1v2c0 .6-.5 1-1 1s-1-.4-1-1v-2c0-.6.5-1 1-1zm14.1-5.5c.4.4.4 1 0 1.4l-1.4 1.4c-.4.4-1 .4-1.4 0s-.4-1 0-1.4l1.4-1.4c.4-.4 1-.4 1.4 0zM6.3 17.7c.4.4.4 1 0 1.4l-1.4 1.4c-.4.4-1 .4-1.4 0s-.4-1 0-1.4l1.4-1.4c.4-.4 1-.4 1.4 0zm11.4 0c.4-.4.4-1 0-1.4l-1.4-1.4c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l1.4 1.4c.4.4 1 .4 1.4 0zM6.3 6.3c.4-.4.4-1 0-1.4L4.9 3.5c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l1.4 1.4c.4.4 1 .4 1.4 0z"/>
    </svg>
    <!-- DIVINE: simplified ankh -->
    <svg v-else-if="attribute === 'DIVINE'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="attr-svg">
      <path d="M12 2l1 4h-2l1-4zm0 6v12h-2V8H8V6h8v2h-2v2h-2zm-4 4h2v6H8v-6zm8 0h2v6h-2v-6zM12 4l-2 8h4L12 4z"/>
    </svg>
    <!-- Spell Card -->
    <span v-else-if="cardKind === 'spell'" class="kind-text">SPELL</span>
    <!-- Trap Card -->
    <span v-else-if="cardKind === 'trap'" class="kind-text">TRAP</span>
    <span v-else class="kind-text">{{ attribute || '' }}</span>
  </span>
</template>

<style scoped>
.ygo-attr {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35em;
  height: 1.35em;
  flex-shrink: 0;
}

.attr-svg {
  width: 100%;
  height: 100%;
  opacity: 0.95;
}

.kind-text {
  font-size: 0.45rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1;
}
</style>
