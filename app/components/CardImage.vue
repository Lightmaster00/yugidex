<script setup lang="ts">
const props = defineProps<{
  cardId?: number
  imageUrl?: string
  alt: string
  imageClass?: string
}>()

const { src, loading, error } = useCachedCardImage(
  () => props.cardId,
  () => props.imageUrl
)
</script>


<template>
  <div class="card-image-inner">
    <img
      v-if="src"
      :src="src"
      :alt="alt"
      :class="imageClass"
      class="card-art"
    />
    <div v-else-if="loading" class="card-image-placeholder">…</div>
    <div v-else-if="error" class="card-image-placeholder card-image-error">Error</div>
    <div v-else class="card-image-placeholder">–</div>
  </div>
</template>

<style scoped>
.card-image-inner {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bg-elevated, #0e0e12);
}

.card-art {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
  transition: transform 0.4s cubic-bezier(0.34, 1.2, 0.64, 1);
}

.card-image-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-muted, #5c5c64);
  font-size: 1.25rem;
}

.card-image-error {
  color: #f87171;
  font-size: 0.9rem;
}
</style>
