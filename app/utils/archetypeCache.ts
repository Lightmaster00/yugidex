/**
 * IndexedDB cache for the list of valid archetypes (with enough representatives).
 * Refreshed once per month to speed up initial load.
 */

const DB_NAME = 'yugidex-archetype-cache'
const STORE_NAME = 'archetypes'
const DB_VERSION = 2
const CACHE_KEY = 'valid-names'
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000 // 60 days (2 months)
const ALGORITHM_VERSION = 22

function isClient (): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb (): Promise<IDBDatabase> {
  if (!isClient()) return Promise.reject(new Error('IndexedDB not available'))
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

export interface ArchetypeCacheEntry {
  id: string
  validNames: string[]
  /** Inseparable archetypes: primary -> [partners] (e.g. Fluffal -> [Edge Imp]). */
  partnerMap?: Record<string, string[]>
  /** Pre-computed representative card IDs from the pipeline. */
  representativeMap?: Record<string, number[]>
  /** Card IDs (members+supports) per entity — for filtering API intruders. */
  entityCardMap?: Record<string, number[]>
  fetchedAt: number
  algorithmVersion?: number
  language?: string
}

export interface CachedArchetypesResult {
  validNames: string[]
  partnerMap: Record<string, string[]>
  representativeMap: Record<string, number[]>
  entityCardMap: Record<string, number[]>
}

export async function getCachedValidArchetypes (lang?: string): Promise<CachedArchetypesResult | null> {
  if (!isClient()) return null
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(CACHE_KEY)
      req.onsuccess = () => {
        const entry = req.result as ArchetypeCacheEntry | undefined
        tx.oncomplete = () => db.close()
        if (!entry?.validNames?.length) {
          resolve(null)
          return
        }
        if (entry.algorithmVersion !== ALGORITHM_VERSION) {
          resolve(null)
          return
        }
        if (lang && entry.language && entry.language !== lang) {
          resolve(null)
          return
        }
        const age = Date.now() - entry.fetchedAt
        if (age > MAX_AGE_MS) {
          resolve(null)
          return
        }
        resolve({
          validNames: entry.validNames,
          partnerMap: entry.partnerMap ?? {},
          representativeMap: entry.representativeMap ?? {},
          entityCardMap: entry.entityCardMap ?? {},
        })
      }
      req.onerror = () => {
        tx.oncomplete = () => db.close()
        reject(req.error)
      }
    })
  } catch {
    return null
  }
}

export async function setCachedValidArchetypes (
  validNames: string[],
  lang?: string,
  partnerMap?: Record<string, string[]>,
  representativeMap?: Record<string, number[]>,
  entityCardMap?: Record<string, number[]>
): Promise<void> {
  if (!isClient() || !validNames.length) return
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put({
        id: CACHE_KEY,
        validNames,
        partnerMap: partnerMap ?? {},
        representativeMap: representativeMap ?? {},
        entityCardMap: entityCardMap ?? {},
        fetchedAt: Date.now(),
        algorithmVersion: ALGORITHM_VERSION,
        language: lang ?? 'en'
      })
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}

export async function clearCachedArchetypes (): Promise<void> {
  if (!isClient()) return
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(CACHE_KEY)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}
