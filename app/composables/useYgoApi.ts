import type { CardInfoApiResponse, YgoCard } from '~/types/api'
import type { RepresentativeCard } from '~/types/tournament'
import { pickRepresentativeCards, getCardImageUrl, hasValidRepresentatives, pick5Main5Extra, getExtraPolicy, buildArchetypeProfile, filterCardsByArchetype, hasMoreSpecificArchetype } from '~/utils/representativeCard'
import { clearCachedArchetypes } from '~/utils/archetypeCache'
import { runPipeline, ygoCardToCardData, normalizeKey, type PipelineResult, type CardData } from '~/utils/archetypeIntelligence'

const CARDINFO_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const TCG_FORMAT = 'tcg'

// ═══════════════════════════════════════════════════════════════════════
// Language
// ═══════════════════════════════════════════════════════════════════════

export type CardLanguage = 'en' | 'fr' | 'de' | 'it' | 'pt'

export const AVAILABLE_LANGUAGES: { code: CardLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' }
]

const _language = ref<CardLanguage>('en')

export function useCardLanguage () {
  function setLanguage (lang: CardLanguage) {
    const prev = _language.value
    _language.value = lang
    if (import.meta.client) {
      try { localStorage.setItem('yugidex-lang', lang) } catch {}
      if (prev !== lang) clearCachedArchetypes()
    }
  }
  function loadLanguage () {
    if (import.meta.client) {
      try {
        const saved = localStorage.getItem('yugidex-lang') as CardLanguage | null
        if (saved && AVAILABLE_LANGUAGES.some(l => l.code === saved)) _language.value = saved
      } catch {}
    }
  }
  return { language: _language, setLanguage, loadLanguage }
}

function langParam (): string {
  const lang = _language.value
  return lang && lang !== 'en' ? `&language=${lang}` : ''
}

// ═══════════════════════════════════════════════════════════════════════
// Display helpers
// ═══════════════════════════════════════════════════════════════════════

export function capitalizeArchetypeName (name: string): string {
  const s = name.trim()
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function displayArchetypeName (name: string): string {
  const s = name.trim()
  if (!s) return s
  const cleaned = s.replace(/-+\s*$/, '').replace(/^\s*-+/, '').trim()
  if (!cleaned) return s
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

// ═══════════════════════════════════════════════════════════════════════
// Pipeline result (stored after running once)
// ═══════════════════════════════════════════════════════════════════════

let _pipelineResult: PipelineResult | null = null
let _partnerMap = new Map<string, string[]>()
let _representativeMap = new Map<string, number[]>()
/** Card IDs (members+supports) per entity — for filtering API intruders */
let _entityCardIds = new Map<string, Set<number>>()

export function getPartnerArchetypes (primaryName: string): string[] {
  return _partnerMap.get(primaryName) ?? []
}

export function setPartnerMapFromCache (partnerMap: Record<string, string[]>): void {
  _partnerMap = new Map(Object.entries(partnerMap))
}

export function setRepresentativeMapFromCache (representativeMap: Record<string, number[]>): void {
  _representativeMap = new Map(Object.entries(representativeMap))
}

export function setEntityCardIdsFromCache (entityCardMap: Record<string, number[]>): void {
  _entityCardIds.clear()
  for (const [key, ids] of Object.entries(entityCardMap)) {
    _entityCardIds.set(key, new Set(ids))
  }
}

export function getRepresentativeCardIds (entityLabel: string): number[] {
  return _representativeMap.get(entityLabel) ?? []
}

function buildEntityCardIdMap (result: PipelineResult): void {
  _entityCardIds.clear()
  for (const entity of result.displayEntities) {
    const ids = new Set([...entity.memberCardIds, ...entity.supportCardIds])
    _entityCardIds.set(entity.labelDisplay, ids)
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Fetch all cards + run intelligence pipeline
// ═══════════════════════════════════════════════════════════════════════

export interface IntelligenceResult {
  validNames: string[]
  partnerMap: Record<string, string[]>
  representativeMap: Record<string, number[]>
  /** Card IDs (members+supports) per entity — for filtering intruders. */
  entityCardMap: Record<string, number[]>
  dashboard: PipelineResult['dashboard']
}

/**
 * Fetches ALL TCG cards (paginated), runs the Archetype Intelligence pipeline,
 * and returns validated archetype names + cluster map.
 *
 * This replaces the old fetchArchetypes() + filterArchetypesWithEnoughRepresentatives()
 * combo and is MUCH faster (no individual per-archetype API calls).
 */
export async function fetchAndAnalyzeArchetypes (): Promise<IntelligenceResult> {
  const allCards: CardData[] = []
  const pageSize = 500
  let offset = 0

  // Paginate through all TCG cards (English, for text analysis)
  for (;;) {
    const res = await $fetch<CardInfoApiResponse>(
      `${CARDINFO_URL}?format=${TCG_FORMAT}&num=${pageSize}&offset=${offset}`
    )
    const data = res?.data ?? []
    if (!data.length) break
    for (const card of data) {
      allCards.push(ygoCardToCardData(card))
    }
    if (data.length < pageSize) break
    offset += pageSize
  }

  // Run the intelligence pipeline
  const result = runPipeline(allCards)
  _pipelineResult = result

  // Store partner map + representative map + entity card IDs
  _partnerMap = new Map(Object.entries(result.partnerMap))
  _representativeMap = new Map(Object.entries(result.representativeMap))
  buildEntityCardIdMap(result)

  // Build entity card map for cache
  const entityCardMap: Record<string, number[]> = {}
  for (const entity of result.displayEntities) {
    entityCardMap[entity.labelDisplay] = [...entity.memberCardIds, ...entity.supportCardIds]
  }

  return {
    validNames: result.validNames,
    partnerMap: result.partnerMap,
    representativeMap: result.representativeMap,
    entityCardMap,
    dashboard: result.dashboard,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Fetch cards for a specific archetype (for display: modal, tournament)
// ═══════════════════════════════════════════════════════════════════════

export async function fetchCardsByNames (names: string[]): Promise<YgoCard[]> {
  const unique = [...new Set(names)].filter(Boolean).map(n => n.trim())
  if (!unique.length) return []
  const query = unique.map(n => encodeURIComponent(n)).join('|')
  const url = `${CARDINFO_URL}?name=${query}&format=${TCG_FORMAT}${langParam()}`
  try {
    const res = await $fetch<CardInfoApiResponse>(url)
    const data = res?.data ?? []
    return Array.isArray(data) ? data : [data]
  } catch {
    return []
  }
}

/**
 * Fetch cards for a single archetype (API + strict filtering).
 * Uses format=TCG only: OCG-only archetypes return 0 cards and are later removed
 * (loadRepresentativesForArchetype returns null when there are no valid representatives).
 */
async function fetchCardsForArchetypeSingle (archetypeName: string): Promise<YgoCard[]> {
  const url = `${CARDINFO_URL}?archetype=${encodeURIComponent(archetypeName)}&format=${TCG_FORMAT}${langParam()}`
  try {
    const res = await $fetch<CardInfoApiResponse>(url)
    const raw = res?.data ?? []
    let cards = filterCardsByArchetype(raw, archetypeName)
    // Remove cards with a more specific archetype (e.g., Speedroid from Roid)
    cards = cards.filter(c => !hasMoreSpecificArchetype(c, archetypeName))
    return cards
  } catch {
    return []
  }
}

/** English name (archetype names from API are always English). */
function enName (card: YgoCard): string {
  return card.name_en ?? card.name
}

/**
 * Intruder filter: checks that each card has a real connection to the ecosystem.
 * - The card mentions the archetype in its description → connected
 * - Other cards in the set reference this card by name → connected
 * - The card name IS exactly the archetype → flagship
 * - Otherwise → intruder (e.g., Cipher Soldier in Cipher)
 */
function filterIntruders (cards: YgoCard[], archetypeName: string): YgoCard[] {
  if (cards.length <= 5) return cards // too few to filter
  const archKey = normalizeKey(archetypeName)

  // Collect all names quoted in descriptions
  const referencedNames = new Set<string>()
  const quoteRe = /"([^"]{2,60})"/g
  for (const c of cards) {
    const desc = (c.desc ?? '')
    quoteRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = quoteRe.exec(desc)) !== null) {
      referencedNames.add(normalizeKey(m[1]!))
    }
  }

  return cards.filter(c => {
    const desc = (c.desc ?? '').toLowerCase()
    const nameKey = normalizeKey(enName(c))

    // Card is exactly the archetype (flagship)
    if (nameKey === archKey) return true

    // Description mentions the archetype → connected to the ecosystem
    if (desc.includes(archKey)) return true

    // Other cards in the set reference this card by name → referenced
    if (referencedNames.has(nameKey)) return true

    // No connection → intruder (similar name but no interaction)
    return false
  })
}

/**
 * Cards for an archetype, TCG only. Merges partner archetypes (clusters).
 * Filters intruders (cards with similar name but no connection to the ecosystem).
 */
export async function fetchCardsForArchetype (archetypeName: string): Promise<YgoCard[]> {
  const partners = getPartnerArchetypes(archetypeName)
  let cards = await fetchCardsForArchetypeSingle(archetypeName)
  const byId = new Map(cards.map(c => [c.id, c]))

  for (const partnerName of partners) {
    const partnerCards = await fetchCardsForArchetypeSingle(partnerName)
    for (const c of partnerCards) {
      if (byId.has(c.id)) continue
      byId.set(c.id, c)
      cards.push(c)
    }
  }

  // Filter tokens and skill cards
  cards = cards.filter(c => {
    const t = (c.type ?? '').toLowerCase()
    return !t.includes('token') && !t.includes('skill')
  })

  // ── Filter intruders ──
  // Priority 1: pipeline IDs (most reliable data)
  const entityIds = _entityCardIds.get(archetypeName)
  if (entityIds && entityIds.size > 0) {
    cards = cards.filter(c => entityIds.has(c.id))
  } else {
    // Priority 2: connectivity heuristic (when pipeline not in memory)
    cards = filterIntruders(cards, archetypeName)
  }

  return cards
}

// ═══════════════════════════════════════════════════════════════════════
// Representative cards (for tournament display)
// ═══════════════════════════════════════════════════════════════════════

/** Minimum width/height for representative artwork (YGOPRODeck standard cropped is ~624×614). */
const MIN_REPRESENTATIVE_IMAGE_SIZE = 400

/**
 * Validates the format of representative images by loading each one and checking ratio and size.
 * Standard cropped artworks are ~624×614 (ratio ~1.0). We reject images:
 * - whose ratio falls outside [0.7, 1.4] (Rush Duel, Skill cards, etc.),
 * - or whose width/height is below MIN_REPRESENTATIVE_IMAGE_SIZE (small/placeholder assets).
 * If all candidates are rejected, the archetype is later removed from the tournament.
 */
async function validateImageFormats (cards: RepresentativeCard[]): Promise<RepresentativeCard[]> {
  if (typeof window === 'undefined' || cards.length === 0) return cards

  const results = await Promise.allSettled(
    cards.map(card =>
      new Promise<RepresentativeCard | null>((resolve) => {
        const img = new Image()
        const timeout = setTimeout(() => resolve(null), 5000)
        img.onload = () => {
          clearTimeout(timeout)
          const w = img.naturalWidth
          const h = img.naturalHeight
          const ratio = w / h
          const okRatio = ratio >= 0.7 && ratio <= 1.4
          const okSize = w >= MIN_REPRESENTATIVE_IMAGE_SIZE && h >= MIN_REPRESENTATIVE_IMAGE_SIZE
          resolve(okRatio && okSize ? card : null)
        }
        img.onerror = () => { clearTimeout(timeout); resolve(null) }
        img.src = card.imageUrl
      })
    )
  )

  return results
    .filter((r): r is PromiseFulfilledResult<RepresentativeCard | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((c): c is RepresentativeCard => c !== null)
}

export async function loadRepresentativesForArchetype (
  archetypeName: string
): Promise<{
  representativeCards: RepresentativeCard[]
  representativeIndex: number
  extraPolicy: import('~/types/ranking').ExtraPolicy
  profile: import('~/types/ranking').ArchetypeProfile
} | null> {
  const cards = await fetchCardsForArchetype(archetypeName)
  if (!hasValidRepresentatives(cards, archetypeName)) return null

  // ── If the pipeline pre-computed representative IDs, boost those cards ──
  const repIds = getRepresentativeCardIds(archetypeName)
  if (repIds.length > 0) {
    const repSet = new Set(repIds)
    const boosted = cards.filter(c => repSet.has(c.id))
    const rest = cards.filter(c => !repSet.has(c.id))
    cards.splice(0, cards.length, ...boosted, ...rest)
  }

  let representativeCards = pickRepresentativeCards(cards, archetypeName)

  // ── Filter images with non-standard format ──
  representativeCards = await validateImageFormats(representativeCards)
  if (representativeCards.length === 0) return null

  const { main, extra } = pick5Main5Extra(cards, archetypeName)
  const extraPolicy = getExtraPolicy(extra)
  const profile = buildArchetypeProfile(cards, archetypeName, main, extra)
  return { representativeCards, representativeIndex: 0, extraPolicy, profile }
}

export async function loadRepresentativeForArchetype (
  archetypeName: string
): Promise<{ imageUrl: string; representativeCardId: number } | null> {
  const res = await loadRepresentativesForArchetype(archetypeName)
  const cards = res?.representativeCards ?? []
  if (!cards.length) return null
  const cur = cards[res?.representativeIndex ?? 0] ?? cards[0]!
  return cur ? { imageUrl: cur.imageUrl, representativeCardId: cur.id } : null
}
