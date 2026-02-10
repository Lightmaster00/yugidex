import type { YgoCard } from '~/types/api'
import type { RepresentativeCard } from '~/types/tournament'
import type { ExtraPolicy, ArchetypeProfile } from '~/types/ranking'

/** 5+5 grid: 5 Main Deck monsters + 5 Extra Deck monsters (artworks only). */
export const MAIN_DISPLAY_COUNT = 5
export const EXTRA_DISPLAY_COUNT = 5
const TOTAL_DISPLAY_COUNT = MAIN_DISPLAY_COUNT + EXTRA_DISPLAY_COUNT

const RARITY_ORDER = [
  'Quarter Century',
  'Starlight',
  'Collector',
  'Prismatic',
  'Secret Rare',
  'Ultra Rare',
  'Super Rare',
  'Rare',
  'Common'
] as const

/** Order: Extra (2) → Main (2) → Spell (2) → Trap (2). */
export const REPRESENTATIVE_EXTRA_COUNT = 2
const REPRESENTATIVE_MAIN_COUNT = 2
const REPRESENTATIVE_SPELL_COUNT = 2
const REPRESENTATIVE_TRAP_COUNT = 2
const EXTRA_COUNT = REPRESENTATIVE_EXTRA_COUNT
const MAIN_COUNT = REPRESENTATIVE_MAIN_COUNT
const SPELL_COUNT = REPRESENTATIVE_SPELL_COUNT
const TRAP_COUNT = REPRESENTATIVE_TRAP_COUNT
const REPRESENTATIVE_COUNT = EXTRA_COUNT + MAIN_COUNT + SPELL_COUNT + TRAP_COUNT

function normalize (s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/-/g, ' ')
    .trim()
}

function nameTokens (s: string): string[] {
  return normalize(s).split(/\s+/).filter(Boolean)
}

/** Card name = exact archetype name = "flagship" card (highly iconic). */
function getArchetypeNameScore (cardName: string, archetypeName: string): number {
  const n = normalize(cardName)
  const a = normalize(archetypeName)
  if (!a) return 0
  if (n === a) return 300
  if (n.startsWith(a + ' ') || n.startsWith(a + '-')) return 220
  if (n.startsWith(a)) return 200
  // Contains the archetype name somewhere (e.g.: "Number C39: Utopia Ray" → "Utopia")
  if (n.includes(a)) return 160
  const cardToks = nameTokens(cardName)
  const archToks = nameTokens(archetypeName)
  let idx = 0
  for (const t of archToks) {
    const i = cardToks.indexOf(t, idx)
    if (i === -1) return 0
    idx = i + 1
  }
  return 100
}

function getRarityScore (card: YgoCard): number {
  const rarities = (card.card_sets ?? [])
    .map(s => (s.set_rarity ?? '').trim())
    .filter(Boolean)
  if (rarities.length === 0) return 0
  let best = 0
  for (const r of rarities) {
    const rl = r.toLowerCase()
    const i = RARITY_ORDER.findIndex(x => rl.includes(x.toLowerCase()))
    if (i !== -1) {
      const score = RARITY_ORDER.length - i
      if (score > best) best = score
    }
  }
  return best
}

function getBestReleaseDate (card: YgoCard): Date | null {
  const dates: string[] = (card.card_sets ?? [])
    .map(s => (s as { set_release_date?: string }).set_release_date)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
  if (dates.length === 0) return null
  const parsed = dates
    .map(d => new Date(d))
    .filter(d => !Number.isNaN(d.getTime()))
  if (parsed.length === 0) return null
  return new Date(Math.max(...parsed.map(d => d.getTime())))
}

/** Extra Deck boss monsters are often the most iconic (Stardust Dragon, etc.). */
function getTypeScore (card: YgoCard): number {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  if (
    t.includes('fusion') ||
    t.includes('synchro') ||
    t.includes('xyz') ||
    t.includes('link') ||
    f.includes('fusion') ||
    f.includes('synchro') ||
    f.includes('xyz') ||
    f.includes('link')
  ) {
    return 120
  }
  if (
    t.includes('monster') &&
    !t.includes('pendulum')
  ) {
    return 100
  }
  if (t.includes('pendulum') || t.includes('monster')) return 90
  if (t.includes('spell')) return 50
  if (t.includes('trap')) return 40
  return 25
}

function getEffectBonus (card: YgoCard): number {
  const t = (card.type ?? '').toLowerCase()
  if (t.includes('effect') && t.includes('monster')) return 8
  return 0
}

/**
 * ATK bonus: boss monsters (2500+) are the signature cards of archetypes.
 * Linear scaling up to 4000 + tier bonus for ATK >= 2500.
 */
function getAtkBonus (card: YgoCard): number {
  const atk = card.atk
  if (atk == null || typeof atk !== 'number') return 0
  const capped = Math.min(4000, Math.max(0, atk))
  const linear = Math.floor((capped / 4000) * 40)
  const bossBonus = atk >= 2500 ? 15 : 0
  return linear + bossBonus
}

/**
 * DEF bonus: defensive monsters (high DEF = key cards in some archetypes).
 */
function getDefBonus (card: YgoCard): number {
  const def = card.def
  if (def == null || typeof def !== 'number') return 0
  const capped = Math.min(4000, Math.max(0, def))
  return Math.floor((capped / 4000) * 25)
}

/**
 * Effect text length bonus: cards with detailed effects = often more important.
 * Capped to avoid overweighting walls of text.
 */
function getEffectLengthScore (card: YgoCard): number {
  const len = (card.desc ?? '').length
  if (len <= 0) return 0
  const capped = Math.min(len, 500)
  return Math.floor((capped / 500) * 20)
}

/**
 * Score based on popularity (number of printings).
 * Heavily reprinted cards are staples or archetype icons.
 * Logarithmic scale to differentiate 2 printings vs 50 without flattening everything.
 */
function getReprintScore (card: YgoCard): number {
  const sets = card.card_sets ?? []
  if (sets.length === 0) return 0
  const now = new Date().getFullYear()
  let recentCount = 0
  for (const s of sets) {
    const dateStr = (s as { set_release_date?: string }).set_release_date
    if (!dateStr) continue
    const year = new Date(dateStr).getFullYear()
    if (!Number.isNaN(year) && now - year <= 3) recentCount++
  }
  // log2 scaling: 1 set=8, 5 sets=20, 15 sets=32, 30 sets=40, 50 sets=45
  const base = Math.round(Math.log2(sets.length + 1) * 8)
  return base + recentCount * 5
}

/**
 * Bonus for cards whose effect mentions the archetype name.
 * Indicates the card supports the archetype, but should not dominate the score.
 * Capped at 3 mentions to prevent a card with verbose text from overshadowing
 * a truly iconic card (e.g.: Salamangreat Coyote vs Circle).
 */
function getDescriptionBonus (card: YgoCard, archetypeName: string): number {
  const desc = (card.desc ?? '').toLowerCase()
  const name = normalize(archetypeName)
  if (!desc || !name) return 0
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped.replace(/\s+/g, '\\s+'), 'gi')
  const matches = desc.match(regex)
  const count = Math.min(matches?.length ?? 0, 3)
  return count * 15
}

/**
 * Score based on card age (most recent release date).
 * Recent cards gain points, very old cards lose them.
 * This penalizes old obsolete cards that are no longer played.
 */
function getDateScore (card: YgoCard): number {
  const d = getBestReleaseDate(card)
  if (!d) return -20
  const year = d.getFullYear()
  const now = new Date().getFullYear()
  if (year > now) return 40
  const age = now - year
  if (age <= 2) return 40
  if (age <= 5) return 30
  if (age <= 10) return 10
  if (age <= 15) return -10
  if (age <= 20) return -25
  return -40
}

/** Card whose name is exactly the archetype = often the most iconic. */
function isExactArchetypeName (cardName: string, archetypeName: string): boolean {
  return normalize(cardName) === normalize(archetypeName)
}

/** English name for scoring (archetype names from API are always English). */
function enName (card: YgoCard): string {
  return card.name_en ?? card.name
}

/**
 * Article prefixes to remove for the canonical form (naming variants of the same archetype).
 * E.g. "The Agent" = "Agent", "A Legendary Ocean" = "Legendary Ocean".
 */
const ARCHETYPE_ARTICLE_PREFIXES = /^(the|a|an)\s+/

/**
 * Canonical form for archetype comparison: normalizes then removes the prefixes
 * "the ", "a ", "an " so that variants with articles match (e.g. The Agent / Agent).
 */
function canonicalArchetype (archetypeName: string): string {
  const n = normalize(archetypeName)
  return n.replace(ARCHETYPE_ARTICLE_PREFIXES, '')
}

/**
 * Checks if the card officially belongs to the archetype.
 * - A segment must match the requested name after canonicalization (articles "The "/"A "/"An " removed).
 * - Cards whose segment is a "more specific" archetype (strictly longer name
 *   containing the requested name) are excluded: e.g. "Roid" vs "Speedroid"/"Vehicroid", "Eyes" vs "Blue-Eyes", etc.
 */
function belongsToArchetype (card: YgoCard, archetypeName: string): boolean {
  const cardArch = (card.archetype ?? '').trim()
  const name = archetypeName.trim()
  if (!name) return false
  if (!cardArch) return false
  const want = canonicalArchetype(name)
  const segments = cardArch.split(',').map(s => normalize(s.trim())).filter(Boolean)
  const canonicalSegments = segments.map(s => canonicalArchetype(s))
  const hasExactMatch = canonicalSegments.some(cs => cs === want)
  if (!hasExactMatch) return false
  const hasStricterArchetype = canonicalSegments.some(
    cs => cs.length > want.length && cs.includes(want)
  )
  if (hasStricterArchetype) return false
  return true
}

/**
 * True if the card has an official archetype "more specific" than the requested name
 * (e.g. Speedroid, Vehicroid for Roid; Blue-Eyes for Eyes).
 * Used to exclude these cards from the pool when loading a generic archetype.
 */
export function hasMoreSpecificArchetype (card: YgoCard, requestedArchetype: string): boolean {
  const cardArch = (card.archetype ?? '').trim()
  const name = requestedArchetype.trim()
  if (!name || !cardArch) return false
  const want = canonicalArchetype(name)
  const segments = cardArch.split(',').map(s => normalize(s.trim())).filter(Boolean)
  const canonicalSegments = segments.map(s => canonicalArchetype(s))
  return canonicalSegments.some(
    cs => cs.length > want.length && cs.includes(want)
  )
}

/**
 * Filters cards to keep only those that officially belong to the archetype
 * (matching `archetype` field, not just similar name).
 * Use after any API fetch to exclude false positives.
 */
export function filterCardsByArchetype (cards: YgoCard[], archetypeName: string): YgoCard[] {
  if (!archetypeName.trim()) return []
  return cards.filter(c => belongsToArchetype(c, archetypeName))
}

/** True if the card is Extra Deck (Fusion/Synchro/Xyz/Link). */
function isExtraDeck (card: YgoCard): boolean {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  return [t, f].some(s =>
    s.includes('fusion') || s.includes('synchro') || s.includes('xyz') || s.includes('link')
  )
}

/**
 * Scores a card to determine the "best" of the archetype.
 * Criteria: Extra Deck prioritized, archetype name, rarity, ATK/DEF, reprints, effect length, date.
 */
function scoreCard (card: YgoCard, archetypeName: string): number {
  const scoringName = enName(card)
  const nameScore = getArchetypeNameScore(scoringName, archetypeName)
  const typeScore = getTypeScore(card)
  const effectBonus = getEffectBonus(card)
  const rarityScore = getRarityScore(card)
  const dateScore = getDateScore(card)
  const atkBonus = getAtkBonus(card)
  const defBonus = getDefBonus(card)
  const exactNameBonus = isExactArchetypeName(scoringName, archetypeName) ? 150 : 0
  const reprintScore = getReprintScore(card)
  const descBonus = getDescriptionBonus(card, archetypeName)
  const effectLengthScore = getEffectLengthScore(card)
  const extraBonus = isExtraDeck(card) ? 50 : 0
  return (
    nameScore * 5 +
    typeScore +
    effectBonus +
    rarityScore * 2 +
    dateScore * 2 +
    atkBonus +
    defBonus +
    exactNameBonus +
    reprintScore * 3 +
    descBonus +
    effectLengthScore +
    extraBonus
  )
}

function tieBreak (c1: YgoCard, c2: YgoCard, archetypeName: string): number {
  const a = normalize(archetypeName)
  const n1 = normalize(enName(c1))
  const n2 = normalize(enName(c2))
  const exact1 = n1 === a ? 1 : 0
  const exact2 = n2 === a ? 1 : 0
  if (exact1 !== exact2) return exact2 - exact1
  const type1 = getTypeScore(c1)
  const type2 = getTypeScore(c2)
  if (type1 !== type2) return type2 - type1
  const r1 = getRarityScore(c1)
  const r2 = getRarityScore(c2)
  if (r1 !== r2) return r2 - r1
  const d1 = getBestReleaseDate(c1)?.getTime() ?? 0
  const d2 = getBestReleaseDate(c2)?.getTime() ?? 0
  if (d1 !== d2) return d1 - d2
  const atkDiff = (c2.atk ?? 0) - (c1.atk ?? 0)
  if (atkDiff !== 0) return atkDiff
  return (c2.def ?? 0) - (c1.def ?? 0)
}

/** Card with compatible artwork: no Skill / Rush. Pendulum included. */
function hasSquareArt (card: YgoCard): boolean {
  const t = (card.type ?? '').toLowerCase()
  if (t.includes('skill')) return false
  return true
}

/** Excludes Token cards (not playable in the deck). */
function isTokenCard (card: YgoCard): boolean {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  return t.includes('token') || f.includes('token')
}

type CardCategory = 'extra' | 'main' | 'spell' | 'trap'

/** Classifies a card for boss ordering: Extra → Main → Spell → Trap. */
export function getCardCategory (card: YgoCard): CardCategory {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  if (t.includes('spell')) return 'spell'
  if (t.includes('trap')) return 'trap'
  if (
    t.includes('fusion') ||
    t.includes('synchro') ||
    t.includes('xyz') ||
    t.includes('link') ||
    f.includes('fusion') ||
    f.includes('synchro') ||
    f.includes('xyz') ||
    f.includes('link')
  ) {
    return 'extra'
  }
  if (t.includes('monster')) return 'main'
  return 'main'
}

/**
 * Selection: always 10 cards total.
 * Extra first (up to 5), then Main to fill (best cards first).
 * Sorted by relevance: rarity, ATK/DEF, reprints, effect length, name.
 */
export function pick5Main5Extra (
  cards: YgoCard[],
  archetypeName: string
): { main: YgoCard[]; extra: YgoCard[] } {
  const pool = preparePool(cards, archetypeName)
  // Monsters only (no spells or traps)
  const extraPool = pool.filter(c => getCardCategory(c) === 'extra')
  const mainPool = pool.filter(c => getCardCategory(c) === 'main')
  const sortedExtra = sortByRelevance(extraPool, archetypeName)
  const sortedMain = sortByRelevance(mainPool, archetypeName)
  const extra = sortedExtra.slice(0, EXTRA_DISPLAY_COUNT)
  const mainNeeded = TOTAL_DISPLAY_COUNT - extra.length
  const main = sortedMain.slice(0, Math.max(0, mainNeeded))
  return { main, extra }
}

/** Extra Deck tag for the archetype (display and matchmaking). */
export function getExtraPolicy (extraCards: YgoCard[]): ExtraPolicy {
  if (!extraCards.length) return 'none'
  const types = new Set<string>()
  for (const c of extraCards) {
    const t = (c.type ?? '').toLowerCase()
    const f = (c.frameType ?? '').toLowerCase()
    if (t.includes('fusion') || f.includes('fusion')) types.add('fusion')
    if (t.includes('synchro') || f.includes('synchro')) types.add('synchro')
    if (t.includes('xyz') || f.includes('xyz')) types.add('xyz')
    if (t.includes('link') || f.includes('link')) types.add('link')
  }
  if (types.size === 0) return 'none'
  if (types.size > 1) return 'mixed'
  return types.has('fusion') ? 'fusion' : types.has('synchro') ? 'synchro' : types.has('xyz') ? 'xyz' : 'link'
}

/** Builds the aesthetic profile (race, attribute, nameTokens). No ATK/DEF, date, or popularity. */
export function buildArchetypeProfile (
  cards: YgoCard[],
  archetypeName: string,
  mainCards: YgoCard[],
  extraCards: YgoCard[]
): ArchetypeProfile {
  const monsters = [...mainCards, ...extraCards]
  const raceHistogram: Record<string, number> = {}
  const attributeHistogram: Record<string, number> = {}
  for (const c of monsters) {
    const r = (c.race ?? '').trim() || '_'
    raceHistogram[r] = (raceHistogram[r] ?? 0) + 1
    const a = (c.attribute ?? '').trim() || '_'
    attributeHistogram[a] = (attributeHistogram[a] ?? 0) + 1
  }
  const nameTokensArr = nameTokens(archetypeName)
  return {
    topMainIds: mainCards.map(c => c.id),
    topExtraIds: extraCards.map(c => c.id),
    noExtra: extraCards.length === 0,
    raceHistogram,
    attributeHistogram,
    nameTokens: nameTokensArr
  }
}

/** Sort by power / relevance within a category (boss first). */
function sortByRelevance (arr: YgoCard[], archetypeName: string): YgoCard[] {
  return [...arr].sort((x, y) => {
    const sx = scoreCard(x, archetypeName)
    const sy = scoreCard(y, archetypeName)
    if (sy !== sx) return sy - sx
    return tieBreak(x, y, archetypeName)
  })
}

/**
 * Prepares the filtered pool for an archetype (exact official archetype, square art, no tokens).
 * Only cards whose card.archetype matches exactly are used (no fallback).
 */
function preparePool (cards: YgoCard[], archetypeName: string): YgoCard[] {
  if (!cards.length) return []
  const filtered = cards.filter(c => belongsToArchetype(c, archetypeName))
  const pool = filtered
  const squarePool = pool.filter(hasSquareArt)
  const usePool = squarePool.length > 0 ? squarePool : pool
  const noTokenPool = usePool.filter(c => !isTokenCard(c))
  return noTokenPool.length > 0 ? noTokenPool : usePool
}

/**
 * Checks that an archetype has enough displayable MONSTERS (> 5, i.e. ≥ 6 Main + Extra monsters).
 * Archetypes with 5 or fewer monsters are excluded from the tournament because they are not
 * representative enough of a truly playable theme.
 */
export function hasValidRepresentatives (cards: YgoCard[], archetypeName: string): boolean {
  const pool = preparePool(cards, archetypeName)
  const monsters = pool.filter(c => {
    const cat = getCardCategory(c)
    return cat === 'main' || cat === 'extra'
  })
  return monsters.length >= 6
}

/** Card type label for display below the name (based on the displayed card). */
export function getCardDisplayType (card: YgoCard): string {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  if (t.includes('fusion') || f.includes('fusion')) return 'Fusion'
  if (t.includes('synchro') || f.includes('synchro')) return 'Synchro'
  if (t.includes('xyz') || f.includes('xyz')) return 'Xyz'
  if (t.includes('link') || f.includes('link')) return 'Link'
  if (t.includes('pendulum') || f.includes('pendulum')) return 'Pendulum'
  if (t.includes('effect') && t.includes('monster')) return 'Effect'
  if (t.includes('normal') && t.includes('monster')) return 'Normal'
  if (t.includes('ritual') || f.includes('ritual')) return 'Ritual'
  if (t.includes('monster')) return 'Main'
  return 'Main'
}

/**
 * Returns 10 cards for display: Extra Deck first (0–4), then Main (5–9).
 * Order within each group: best to worst (rarity, ATK/DEF, reprints, effect, name).
 */
export function pickRepresentativeCards (cards: YgoCard[], archetypeName: string): RepresentativeCard[] {
  const { main, extra } = pick5Main5Extra(cards, archetypeName)
  const result: RepresentativeCard[] = []
  for (const c of extra) {
    result.push({ id: c.id, imageUrl: getCardImageUrl(c), category: 'extra', displayType: getCardDisplayType(c) })
  }
  for (const c of main) {
    result.push({ id: c.id, imageUrl: getCardImageUrl(c), category: 'main', displayType: getCardDisplayType(c) })
  }
  return result
}

export const CARD_BACK_IMAGE_URL = '/card-back.png'

/** Cropped artwork URL from the YGOPRODeck CDN (cards_cropped). */
const CARDS_CROPPED_BASE = 'https://images.ygoprodeck.com/images/cards_cropped/'

export function getCardImageUrl (card: YgoCard): string {
  return `${CARDS_CROPPED_BASE}${card.id}.jpg`
}

/** Full card image URL (official design, entire card). */
export function getFullCardImageUrl (card: YgoCard): string {
  const img = card.card_images?.[0]
  if (img?.image_url) return img.image_url
  return `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`
}
