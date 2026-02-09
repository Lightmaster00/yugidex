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

/** Ordre d'affichage : Extra (2) → Main (2) → Spell (2) → Trap (2). 2 ou 3 par type par archétype. */
export const REPRESENTATIVE_EXTRA_COUNT = 2
export const REPRESENTATIVE_MAIN_COUNT = 2
export const REPRESENTATIVE_SPELL_COUNT = 2
export const REPRESENTATIVE_TRAP_COUNT = 2
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
    return 110
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
 * Vérifie si la carte appartient à l'archétype.
 * Les cartes proviennent de l'API `?archetype=X` donc elles y appartiennent toutes.
 * On accepte toutes les cartes retournées par l'API — le filtrage est déjà fait côté serveur.
 */
function belongsToArchetype (_card: YgoCard, _archetypeName: string): boolean {
  return true
}

/**
 * Score une carte pour déterminer si elle est "importante" pour l'archétype.
 * Hiérarchie : nom archétype dans le nom >>> popularité (reprints) >>> puissance (ATK/rareté) >>> mentions dans l'effet.
 * Les "boss monsters" (nom = archétype + descripteur, haute ATK, beaucoup de reprints) scorent le plus haut.
 */
function scoreCard (card: YgoCard, archetypeName: string): number {
  const scoringName = enName(card)
  const nameScore = getArchetypeNameScore(scoringName, archetypeName)
  const typeScore = getTypeScore(card)
  const effectBonus = getEffectBonus(card)
  const rarityScore = getRarityScore(card)
  const dateScore = getDateScore(card)
  const atkBonus = getAtkBonus(card)
  const exactNameBonus = isExactArchetypeName(scoringName, archetypeName) ? 150 : 0
  const reprintScore = getReprintScore(card)
  const descBonus = getDescriptionBonus(card, archetypeName)
  return (
    nameScore * 5 +
    typeScore +
    effectBonus +
    rarityScore * 2 +
    dateScore * 2 +
    atkBonus +
    exactNameBonus +
    reprintScore * 3 +
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

export type CardCategory = 'extra' | 'main' | 'spell' | 'trap'

/**
 * Retourne la catégorie de la carte à l’index donné (ordre : Extra → Main → Spell → Trap).
 * Permet d’afficher "Extra Deck", "Monstre", etc. pour comparer des cartes de même type.
 */
export function getRepresentativeSlotCategory (index: number): CardCategory | null {
  if (index < 0) return null
  if (index < EXTRA_COUNT) return 'extra'
  if (index < EXTRA_COUNT + MAIN_COUNT) return 'main'
  if (index < EXTRA_COUNT + MAIN_COUNT + SPELL_COUNT) return 'spell'
  if (index < REPRESENTATIVE_COUNT) return 'trap'
  return null
}

/** Index de la première carte de chaque catégorie (0=Extra, 1=Main, 2=Spell, 3=Trap). Pour comparer uniquement ce qui est comparable. */
export const FIRST_CARD_INDEX_BY_CATEGORY: [number, number, number, number] = [
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
 * Prépare le pool filtré pour un archétype (archetype match, square art, no tokens).
 */
function preparePool (cards: YgoCard[], archetypeName: string): YgoCard[] {
  if (!cards.length) return []
  const filtered = cards.filter(c => belongsToArchetype(c, archetypeName))
  const pool = filtered.length ? filtered : cards
  const squarePool = pool.filter(hasSquareArt)
  const usePool = squarePool.length > 0 ? squarePool : pool
  const noTokenPool = usePool.filter(c => !isTokenCard(c))
  return noTokenPool.length > 0 ? noTokenPool : usePool
}

/**
 * Vérifie qu'un archétype a assez de cartes pour être inclus dans le tournoi.
 * Règles :
 * - Au moins un monstre (extra ou main deck)
 * - Au moins 1 magie OU 1 piège (un vrai archétype a du support spell/trap)
 * - Au moins 2 catégories distinctes avec des cartes
 * - Au moins 6 cartes représentatives au total
 * - Au moins 25% des cartes doivent mentionner l'archétype dans leur nom EN ou effet EN
 *   (filtre les archétypes "fourre-tout" dont les cartes n'ont pas de cohérence)
 */
export function hasValidRepresentatives (cards: YgoCard[], archetypeName: string): boolean {
  const pool = preparePool(cards, archetypeName)
  if (!pool.length) return false

  // Cohérence : au moins 25% des cartes mentionnent l'archétype dans leur nom ou effet
  // On utilise le nom EN pour le check car les noms d'archétype API sont toujours en anglais
  const archNorm = normalize(archetypeName)
  if (archNorm.length >= 3) {
    const escaped = archNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped.replace(/\s+/g, '\\s+'), 'i')
    const mentioning = pool.filter(c => {
      // Toujours utiliser le nom EN pour la cohérence (fiable même en mode FR/DE/etc.)
      const nameEn = normalize(c.name_en ?? c.name)
      if (nameEn.includes(archNorm)) return true
      // Vérifier aussi dans l'effet (peut être traduit, mais le nom de l'archétype y apparaît souvent tel quel)
      const desc = (c.desc ?? '').toLowerCase()
      return regex.test(desc)
    })
    if (pool.length >= 6 && mentioning.length / pool.length < 0.25) return false
  }

  const extra = pool.filter(c => getCardCategory(c) === 'extra')
  const main = pool.filter(c => getCardCategory(c) === 'main')
  const spell = pool.filter(c => getCardCategory(c) === 'spell')
  const trap = pool.filter(c => getCardCategory(c) === 'trap')

  // Doit avoir au moins un monstre
  if (extra.length === 0 && main.length === 0) return false

  // Doit avoir au moins 1 magie ou 1 piège (un vrai archétype a du support spell/trap)
  if (spell.length === 0 && trap.length === 0) return false

  // Doit avoir au moins 2 catégories distinctes avec des cartes
  const categoriesWithCards = [extra, main, spell, trap].filter(arr => arr.length > 0).length
  if (categoriesWithCards < 2) return false

  // Compter les cartes représentatives par catégorie
  const counts = [
    Math.min(extra.length, EXTRA_COUNT),
    Math.min(main.length, MAIN_COUNT),
    Math.min(spell.length, SPELL_COUNT),
    Math.min(trap.length, TRAP_COUNT)
  ]
  const total = counts.reduce((a, b) => a + b, 0)
  return total >= 6
}

/**
 * Retourne exactement 8 cartes dans l'ordre : Extra (2) → Main (2) → Spell (2) → Trap (2).
 * Si une catégorie n'a pas assez de cartes (ex. 1 seul Extra), les slots vides sont remplis
 * par les prochaines meilleures cartes du pool (toutes catégories) pour éviter les « trous » (dos de carte).
 */
export function pickRepresentativeCards (
  cards: YgoCard[],
  archetypeName: string,
  count: number = REPRESENTATIVE_COUNT
): (YgoCard | undefined)[] {
  const usePoolFinal = preparePool(cards, archetypeName)
  if (!usePoolFinal.length) return []

  const extra = sortByRelevance(usePoolFinal.filter(c => getCardCategory(c) === 'extra'), archetypeName)
  const main = sortByRelevance(usePoolFinal.filter(c => getCardCategory(c) === 'main'), archetypeName)
  const spell = sortByRelevance(usePoolFinal.filter(c => getCardCategory(c) === 'spell'), archetypeName)
  const trap = sortByRelevance(usePoolFinal.filter(c => getCardCategory(c) === 'trap'), archetypeName)

  const slots: (YgoCard | undefined)[] = [
    extra[0], extra[1],
    main[0], main[1],
    spell[0], spell[1],
    trap[0], trap[1]
  ]
  const used = new Set<YgoCard>(slots.filter((c): c is YgoCard => c != null))
  const sortedPool = sortByRelevance(usePoolFinal, archetypeName)
  const remaining = sortedPool.filter(c => !used.has(c))

  let fillIdx = 0
  for (let i = 0; i < REPRESENTATIVE_COUNT; i++) {
    if (slots[i] == null && fillIdx < remaining.length) {
      slots[i] = remaining[fillIdx++]!
    }
  }

  return slots.slice(0, count)
}

export function pickRepresentativeCard (
  cards: YgoCard[],
  archetypeName: string
): YgoCard | null {
  const arr = pickRepresentativeCards(cards, archetypeName, 1)
  return arr[0] ?? null
}

/**
 * Dos de carte Yu-Gi-Oh! — image locale (public/card-back.png) pour un affichage fiable.
 * Le CDN YGOPRODeck ne fournit pas d'URL documentée pour le dos ; tu peux remplacer
 * ce fichier par une image PNG/JPEG du dos officiel si tu en as une.
 */
export const CARD_BACK_IMAGE_URL = '/card-back.png'

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
