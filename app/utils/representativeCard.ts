import type { YgoCard } from '~/types/api'

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

/** Ordre d’affichage : boss / cartes clés. Extra (2–3) → Main (2–3) → Spell (2–3) → Trap (2–3). */
const EXTRA_COUNT = 3
const MAIN_COUNT = 3
const SPELL_COUNT = 2
const TRAP_COUNT = 2
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

/** Nom de la carte = nom exact de l'archétype = carte « flagship » (très emblématique). */
function getArchetypeNameScore (cardName: string, archetypeName: string): number {
  const n = normalize(cardName)
  const a = normalize(archetypeName)
  if (!a) return 0
  if (n === a) return 300
  if (n.startsWith(a + ' ') || n.startsWith(a + '-')) return 220
  if (n.startsWith(a)) return 200
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

/** Monstre principal (non Extra) = plus emblématique qu'Extra Deck ou Spell/Trap. */
function getTypeScore (card: YgoCard): number {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  if (
    t.includes('monster') &&
    !t.includes('fusion') &&
    !t.includes('synchro') &&
    !t.includes('xyz') &&
    !t.includes('link') &&
    !t.includes('pendulum')
  ) {
    return 100
  }
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
    return 65
  }
  if (t.includes('spell') || t.includes('trap')) return 40
  if (t.includes('monster')) return 75
  return 25
}

function getEffectBonus (card: YgoCard): number {
  const t = (card.type ?? '').toLowerCase()
  if (t.includes('effect') && t.includes('monster')) return 8
  return 0
}

function getAtkBonus (card: YgoCard): number {
  const atk = card.atk
  if (atk == null || typeof atk !== 'number') return 0
  const capped = Math.min(3000, Math.max(0, atk))
  return Math.floor((capped / 3000) * 25)
}

function getReprintScore (card: YgoCard): number {
  const sets = card.card_sets ?? []
  if (sets.length === 0) return 0
  const now = new Date().getFullYear()
  let recentCount = 0
  const totalSets = Math.min(sets.length, 20)
  for (const s of sets) {
    const dateStr = (s as { set_release_date?: string }).set_release_date
    if (!dateStr) continue
    const year = new Date(dateStr).getFullYear()
    if (!Number.isNaN(year) && now - year <= 3) recentCount++
  }
  return totalSets + recentCount * 3
}

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

function getDateScore (card: YgoCard): number {
  const d = getBestReleaseDate(card)
  if (!d) return 0
  const year = d.getFullYear()
  const now = new Date().getFullYear()
  if (year > now) return 40
  const age = now - year
  if (age <= 2) return 40
  if (age <= 5) return 30
  if (age <= 10) return 18
  if (age <= 15) return 8
  return 0
}

/** Carte dont le nom est exactement l'archétype = souvent la plus iconique. */
function isExactArchetypeName (cardName: string, archetypeName: string): boolean {
  return normalize(cardName) === normalize(archetypeName)
}

/** English name for scoring (archetype names from API are always English). */
function enName (card: YgoCard): string {
  return card.name_en ?? card.name
}

/**
 * Vérifie si la carte appartient à l'archétype.
 * Les cartes proviennent de l'API `?archetype=X` donc elles y appartiennent toutes.
 * On fait un check souple : champ archetype OU correspondance par nom.
 */
function belongsToArchetype (card: YgoCard, archetypeName: string): boolean {
  if (card.archetype) return normalize(card.archetype) === normalize(archetypeName)
  // L'API omet parfois le champ archetype — vérifier par nom (EN)
  return getArchetypeNameScore(enName(card), archetypeName) >= 80
}

function scoreCard (card: YgoCard, archetypeName: string): number {
  const scoringName = enName(card)
  const nameScore = getArchetypeNameScore(scoringName, archetypeName)
  const typeScore = getTypeScore(card)
  const effectBonus = getEffectBonus(card)
  const rarityScore = getRarityScore(card)
  const dateScore = getDateScore(card)
  const atkBonus = getAtkBonus(card)
  const exactNameBonus = isExactArchetypeName(scoringName, archetypeName) ? 80 : 0
  const reprintScore = getReprintScore(card)
  const descBonus = getDescriptionBonus(card, archetypeName)
  return (
    nameScore * 3 +
    typeScore +
    effectBonus +
    rarityScore * 2 +
    dateScore * 3 +
    atkBonus +
    exactNameBonus +
    reprintScore * 2 +
    descBonus
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
  return (c2.atk ?? 0) - (c1.atk ?? 0)
}

/** Carte avec illustration « carrée » (cadre classique) : pas Pendulum, pas Skill / Rush. */
function hasSquareArt (card: YgoCard): boolean {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  if (t.includes('pendulum') || f.includes('pendulum')) return false
  if (t.includes('skill')) return false
  return true
}

/** Exclut les cartes Token (non jouables dans le deck). */
function isTokenCard (card: YgoCard): boolean {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  return t.includes('token') || f.includes('token')
}

export type CardCategory = 'extra' | 'main' | 'spell' | 'trap'

/** Classe une carte pour l’ordre boss : Extra → Main → Spell → Trap. */
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

/** Tri par puissance / pertinence dans une catégorie (boss first). */
function sortByRelevance (arr: YgoCard[], archetypeName: string): YgoCard[] {
  return [...arr].sort((x, y) => {
    const sx = scoreCard(x, archetypeName)
    const sy = scoreCard(y, archetypeName)
    if (sy !== sx) return sy - sx
    return tieBreak(x, y, archetypeName)
  })
}

/** Retourne les cartes dans l’ordre : Extra (2–3) → Main (2–3) → Spell (2–3) → Trap (2–3). */
export function pickRepresentativeCards (
  cards: YgoCard[],
  archetypeName: string,
  count: number = REPRESENTATIVE_COUNT
): YgoCard[] {
  if (!cards.length) return []
  const filtered = cards.filter(c => belongsToArchetype(c, archetypeName))
  const pool = filtered.length ? filtered : cards
  const squarePool = pool.filter(hasSquareArt)
  const usePool = squarePool.length > 0 ? squarePool : pool
  const noTokenPool = usePool.filter(c => !isTokenCard(c))
  const usePoolFinal = noTokenPool.length > 0 ? noTokenPool : usePool

  const extra = usePoolFinal.filter(c => getCardCategory(c) === 'extra')
  const main = usePoolFinal.filter(c => getCardCategory(c) === 'main')
  const spell = usePoolFinal.filter(c => getCardCategory(c) === 'spell')
  const trap = usePoolFinal.filter(c => getCardCategory(c) === 'trap')

  const out: YgoCard[] = []
  out.push(...sortByRelevance(extra, archetypeName).slice(0, EXTRA_COUNT))
  out.push(...sortByRelevance(main, archetypeName).slice(0, MAIN_COUNT))
  out.push(...sortByRelevance(spell, archetypeName).slice(0, SPELL_COUNT))
  out.push(...sortByRelevance(trap, archetypeName).slice(0, TRAP_COUNT))
  return out.slice(0, count)
}

export function pickRepresentativeCard (
  cards: YgoCard[],
  archetypeName: string
): YgoCard | null {
  const arr = pickRepresentativeCards(cards, archetypeName, 1)
  return arr[0] ?? null
}

/** Préfère image cropped (illustration) si dispo. */
export function getCardImageUrl (card: YgoCard): string {
  const img = card.card_images?.[0]
  if (img?.image_url_cropped) return img.image_url_cropped
  if (img?.image_url) return img.image_url
  return `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`
}

/** URL de l'image complète de la carte (design officiel, toute la carte). */
export function getFullCardImageUrl (card: YgoCard): string {
  const img = card.card_images?.[0]
  if (img?.image_url) return img.image_url
  return `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`
}
