import type { YgoCard } from '~/types/api'
import type { RepresentativeCard } from '~/types/tournament'
import type { ExtraPolicy, ArchetypeProfile } from '~/types/ranking'

/** Grille 5+5 : 5 monstres Main Deck + 5 monstres Extra Deck (artworks uniquement). */
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

/** Ordre : Extra (2) → Main (2) → Spell (2) → Trap (2). */
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

/** Nom de la carte = nom exact de l'archétype = carte « flagship » (très emblématique). */
function getArchetypeNameScore (cardName: string, archetypeName: string): number {
  const n = normalize(cardName)
  const a = normalize(archetypeName)
  if (!a) return 0
  if (n === a) return 300
  if (n.startsWith(a + ' ') || n.startsWith(a + '-')) return 220
  if (n.startsWith(a)) return 200
  // Contient le nom de l'archétype quelque part (ex: "Number C39: Utopia Ray" → "Utopia")
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

/** Boss monsters d'Extra Deck sont souvent les plus iconiques (Stardust Dragon, etc.). */
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
 * Bonus ATK : les boss monsters (2500+) sont les cartes signatures des archétypes.
 * Scaling linéaire jusqu'à 4000 + bonus palier pour ATK >= 2500.
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
 * Bonus DEF : monstres en défense (haute DEF = cartes clés dans certains archétypes).
 */
function getDefBonus (card: YgoCard): number {
  const def = card.def
  if (def == null || typeof def !== 'number') return 0
  const capped = Math.min(4000, Math.max(0, def))
  return Math.floor((capped / 4000) * 25)
}

/**
 * Bonus longueur du texte d'effet : cartes avec effet détaillé = souvent plus importantes.
 * Plafonné pour ne pas surpondérer les murs de texte.
 */
function getEffectLengthScore (card: YgoCard): number {
  const len = (card.desc ?? '').length
  if (len <= 0) return 0
  const capped = Math.min(len, 500)
  return Math.floor((capped / 500) * 20)
}

/**
 * Score basé sur la popularité (nombre de printings).
 * Les cartes très rééditées sont des staples ou des icônes de l'archétype.
 * Échelle logarithmique pour différencier 2 printings vs 50 sans écraser tout.
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
 * Bonus pour les cartes dont l'effet mentionne le nom de l'archétype.
 * Indique que la carte supporte l'archétype, mais ne devrait pas dominer le score.
 * Plafonné à 3 mentions pour éviter qu'une carte avec un texte verbeux écrase
 * une carte véritablement iconique (ex: Salamangreat Coyote vs Circle).
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
 * Score basé sur l'âge de la carte (date de sortie la plus récente).
 * Les cartes récentes gagnent des points, les cartes très anciennes en perdent.
 * Cela pénalise les vieilles cartes obsolètes qui ne sont plus jouées.
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

/** Carte dont le nom est exactement l'archétype = souvent la plus iconique. */
function isExactArchetypeName (cardName: string, archetypeName: string): boolean {
  return normalize(cardName) === normalize(archetypeName)
}

/** English name for scoring (archetype names from API are always English). */
function enName (card: YgoCard): string {
  return card.name_en ?? card.name
}

/**
 * Vérifie si la carte appartient officiellement à l'archétype.
 * On ne garde que les cartes dont le champ `archetype` correspond exactement à l'archétype demandé,
 * pour éviter les cartes dans plusieurs archétypes (ex: Dragon-Electroqueu dans Watt) ou les faux positifs.
 */
function belongsToArchetype (card: YgoCard, archetypeName: string): boolean {
  const cardArch = (card.archetype ?? '').trim()
  const name = archetypeName.trim()
  if (!name) return false
  if (!cardArch) return false
  return normalize(cardArch) === normalize(name)
}

/** True si la carte est Extra Deck (Fusion/Synchro/Xyz/Link). */
function isExtraDeck (card: YgoCard): boolean {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  return [t, f].some(s =>
    s.includes('fusion') || s.includes('synchro') || s.includes('xyz') || s.includes('link')
  )
}

/**
 * Score une carte pour déterminer les « meilleures » de l'archétype.
 * Critères : Extra Deck privilégié, nom archétype, rareté, ATK/DEF, rééditions, longueur d'effet, date.
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

/** Carte avec illustration compatible : pas Skill / Rush. Pendulum inclus. */
function hasSquareArt (card: YgoCard): boolean {
  const t = (card.type ?? '').toLowerCase()
  if (t.includes('skill')) return false
  return true
}

/** Exclut les cartes Token (non jouables dans le deck). */
function isTokenCard (card: YgoCard): boolean {
  const t = (card.type ?? '').toLowerCase()
  const f = (card.frameType ?? '').toLowerCase()
  return t.includes('token') || f.includes('token')
}

type CardCategory = 'extra' | 'main' | 'spell' | 'trap'

/** Index de la première carte de chaque catégorie (0=Extra, 1=Main, 2=Spell, 3=Trap). */
const FIRST_CARD_INDEX_BY_CATEGORY: [number, number, number, number] = [
  0,
  EXTRA_COUNT,
  EXTRA_COUNT + MAIN_COUNT,
  EXTRA_COUNT + MAIN_COUNT + SPELL_COUNT
]

export function getFirstCardIndexForCategorySlot (slot: number): number {
  if (slot < 0 || slot > 3) return 0
  return FIRST_CARD_INDEX_BY_CATEGORY[slot] ?? 0
}

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

/**
 * Sélection : toujours 10 cartes au total.
 * Extra en premier (jusqu’à 5), puis Main pour compléter (meilleures en tête).
 * Tri par pertinence : rareté, ATK/DEF, rééditions, longueur d’effet, nom.
 */
export function pick5Main5Extra (
  cards: YgoCard[],
  archetypeName: string
): { main: YgoCard[]; extra: YgoCard[] } {
  const pool = preparePool(cards, archetypeName)
  const mainPool = pool.filter(c => getCardCategory(c) === 'main')
  const extraPool = pool.filter(c => getCardCategory(c) === 'extra')
  const sortedMain = sortByRelevance(mainPool, archetypeName)
  const sortedExtra = sortByRelevance(extraPool, archetypeName)
  const extraCount = Math.min(EXTRA_DISPLAY_COUNT, sortedExtra.length)
  const mainCount = TOTAL_DISPLAY_COUNT - extraCount
  return {
    main: sortedMain.slice(0, Math.max(0, mainCount)),
    extra: sortedExtra.slice(0, extraCount)
  }
}

/** Tag Extra Deck pour l'archétype (affichage et matchmaking). */
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

/** Construit le profil esthétique (race, attribute, nameTokens). Pas d'ATK/DEF, date, popularité. */
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

/** Tri par puissance / pertinence dans une catégorie (boss first). */
function sortByRelevance (arr: YgoCard[], archetypeName: string): YgoCard[] {
  return [...arr].sort((x, y) => {
    const sx = scoreCard(x, archetypeName)
    const sy = scoreCard(y, archetypeName)
    if (sy !== sx) return sy - sx
    return tieBreak(x, y, archetypeName)
  })
}

/**
 * Prépare le pool filtré pour un archétype (archetype officiel exact, square art, no tokens).
 * On n’utilise que les cartes dont card.archetype correspond exactement (pas de fallback).
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
 * Vérifie qu'un archétype peut fournir 10 cartes (Extra + Main).
 * Il faut au moins (10 - min(5, nb Extra)) monstres Main pour compléter.
 */
export function hasValidRepresentatives (cards: YgoCard[], archetypeName: string): boolean {
  const pool = preparePool(cards, archetypeName)
  const main = pool.filter(c => getCardCategory(c) === 'main')
  const extra = pool.filter(c => getCardCategory(c) === 'extra')
  const extraCount = Math.min(EXTRA_DISPLAY_COUNT, extra.length)
  const mainNeeded = TOTAL_DISPLAY_COUNT - extraCount
  return main.length >= mainNeeded
}

/** Libellé du type de carte pour l’affichage sous le nom (selon la carte affichée). */
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
 * Retourne 10 cartes pour affichage : Extra Deck en premier (0–4), puis Main (5–9).
 * Ordre dans chaque groupe : meilleure à la moins bonne (rareté, ATK/DEF, rééditions, effet, nom).
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

/** Une seule carte représentative : meilleure Extra si présente, sinon meilleure Main. */
export function pickRepresentativeCard (
  cards: YgoCard[],
  archetypeName: string
): YgoCard | null {
  const { main, extra } = pick5Main5Extra(cards, archetypeName)
  return extra[0] ?? main[0] ?? null
}

export const CARD_BACK_IMAGE_URL = '/card-back.png'

/** URL artwork cropped depuis le CDN YGOPRODeck (cards_cropped). */
const CARDS_CROPPED_BASE = 'https://images.ygoprodeck.com/images/cards_cropped/'

export function getCardImageUrl (card: YgoCard): string {
  return `${CARDS_CROPPED_BASE}${card.id}.jpg`
}

/** URL de l'image complète de la carte (design officiel, toute la carte). */
export function getFullCardImageUrl (card: YgoCard): string {
  const img = card.card_images?.[0]
  if (img?.image_url) return img.image_url
  return `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`
}
