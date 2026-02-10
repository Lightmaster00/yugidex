import { ref, watch, onUnmounted, toValue, type MaybeRefOrGetter } from 'vue'
import { getCachedImageUrl } from '~/utils/imageCache'

/**
 * Uses IndexedDB cache to display a card image.
 * Downloads once from YGOPRODeck then serves from cache.
 * Revokes object URL on unmount to avoid memory leaks.
 */
export function useCachedCardImage (
  cardId: MaybeRefOrGetter<number | undefined>,
  remoteUrl: MaybeRefOrGetter<string | undefined>
) {
  const src = ref<string | null>(null)
  const loading = ref(false)
  const error = ref(false)
  let revokedUrl: string | null = null

  function revoke () {
    if (revokedUrl) {
      URL.revokeObjectURL(revokedUrl)
      revokedUrl = null
    }
  }

  async function load () {
    const id = toValue(cardId)
    const url = toValue(remoteUrl)
    if (!id || !url) {
      src.value = null
      return
    }
    loading.value = true
    error.value = false
    revoke()
    try {
      const objectUrl = await getCachedImageUrl(id, url)
      revokedUrl = objectUrl
      src.value = objectUrl
    } catch {
      error.value = true
      src.value = null
    } finally {
      loading.value = false
    }
  }

  watch(
    () => [toValue(cardId), toValue(remoteUrl)] as const,
    ([id, url]) => {
      if (id && url) load()
      else {
        revoke()
        src.value = null
      }
    },
    { immediate: true }
  )

  onUnmounted(() => {
    revoke()
    src.value = null
  })

  return { src, loading, error }
}
