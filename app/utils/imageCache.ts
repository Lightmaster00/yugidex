/**
 * Cache d'images en IndexedDB (recommandation YGOPRODeck : ne pas hotlinker,
 * télécharger et stocker localement). Clé = cardId, valeur = Blob image.
 */

const DB_NAME = 'yugidex-image-cache'
const STORE_NAME = 'card-images'
const DB_VERSION = 1

function isClient (): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb (): Promise<IDBDatabase> {
  if (!isClient()) {
    return Promise.reject(new Error('IndexedDB not available'))
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export interface CachedImage {
  id: number
  blob: Blob
  /** Pour invalidation si l'API change d'URL */
  cachedAt: number
}

export async function getCachedImage (cardId: number): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(cardId)
    req.onsuccess = () => {
      const row = req.result as CachedImage | undefined
      resolve(row?.blob ?? null)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function setCachedImage (cardId: number, blob: Blob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({
      id: cardId,
      blob,
      cachedAt: Date.now()
    })
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Retourne une URL utilisable pour <img src> : depuis le cache si présente,
 * sinon télécharge l'URL, met en cache et retourne un object URL.
 * L'appelant doit révoquer l'object URL (URL.revokeObjectURL) pour libérer la mémoire.
 */
export async function getCachedImageUrl (
  cardId: number,
  remoteUrl: string
): Promise<string> {
  if (!isClient()) {
    return remoteUrl
  }
  try {
    const blob = await getCachedImage(cardId)
    if (blob) {
      return URL.createObjectURL(blob)
    }
    const res = await fetch(remoteUrl, { mode: 'cors' })
    if (!res.ok) throw new Error(`Image ${cardId}: ${res.status}`)
    const newBlob = await res.blob()
    await setCachedImage(cardId, newBlob)
    return URL.createObjectURL(newBlob)
  } catch {
    return remoteUrl
  }
}

/** Supprime tout le cache (pour un bouton "Vider le cache" éventuel). */
export async function clearImageCache (): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}
