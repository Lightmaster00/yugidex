import type { CardInfoApiResponse, YgoCard } from '~/types/api'
import type { RepresentativeCard } from '~/types/tournament'
import { pickRepresentativeCards, pickRepresentativeCard, getCardImageUrl, getFullCardImageUrl } from '~/utils/representativeCard'
import { clearCachedArchetypes } from '~/utils/archetypeCache'

const ARCHETYPES_URL = 'https://db.ygoprodeck.com/api/v7/archetypes.php'
const CARDINFO_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

const TCG_FORMAT = 'tcg'
const MIN_REPRESENTATIVE_CARDS = 5

/** Archétypes « fourre-tout » : nom trop générique, cartes sans vraie cohérence (ex. Mask = Mask Beast + Mask of Darkness). */
export const ARCHETYPE_BLOCKLIST = new Set<string>(['Mask'])

export type CardLanguage = 'en' | 'fr' | 'de' | 'it' | 'pt'

export const AVAILABLE_LANGUAGES: { code: CardLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' }
]

/** Persistent language preference */
const _language = ref<CardLanguage>('en')

export function useCardLanguage () {
  function setLanguage (lang: CardLanguage) {
    const prev = _language.value
    _language.value = lang
    if (import.meta.client) {
      try { localStorage.setItem('yugidex-lang', lang) } catch {}
      if (prev !== lang) {
        clearCachedArchetypes()
      }
    }
  }
  function loadLanguage () {
    if (import.meta.client) {
      try {
        const saved = localStorage.getItem('yugidex-lang') as CardLanguage | null
        if (saved && AVAILABLE_LANGUAGES.some(l => l.code === saved)) {
          _language.value = saved
        }
      } catch {}
    }
  }
  return { language: _language, setLanguage, loadLanguage }
}

function langParam (): string {
  const lang = _language.value
  return lang && lang !== 'en' ? `&language=${lang}` : ''
}

/** Dérive frameType pour le cadre (couleur) à partir de card.type. */
function frameTypeFromCardType (type: string): string {
  const t = (type ?? '').toLowerCase()
  if (t.includes('xyz')) return 'xyz'
  if (t.includes('synchro')) return 'synchro'
  if (t.includes('fusion')) return 'fusion'
  if (t.includes('link')) return 'link'
  if (t.includes('ritual')) return 'ritual'
  if (t.includes('pendulum')) return 'pendulum'
  if (t.includes('spell')) return 'spell'
  if (t.includes('trap')) return 'trap'
  if (t.includes('effect')) return 'effect'
  if (t.includes('normal')) return 'normal'
  return 'effect'
}

/** Liste des archétypes TCG uniquement (exclut OCG, Rush Duel, Speed Duel). */
export async function fetchArchetypes (): Promise<string[]> {
  const names = new Set<string>()
  const pageSize = 500
  let offset = 0
  try {
    for (;;) {
      const res = await $fetch<CardInfoApiResponse>(
        `${CARDINFO_URL}?format=${TCG_FORMAT}&num=${pageSize}&offset=${offset}`
      )
      const data = res?.data ?? []
      if (!data.length) break
      for (const card of data) {
        const a = card.archetype?.trim()
        if (a) names.add(a)
      }
      if (data.length < pageSize) break
      offset += pageSize
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  } catch {
    return [...names].sort((a, b) => a.localeCompare(b))
  }
}

/** Cartes d'un archétype, TCG uniquement, avec traduction si langue non-EN. */
export async function fetchCardsForArchetype (archetypeName: string): Promise<YgoCard[]> {
  const url = `${CARDINFO_URL}?archetype=${encodeURIComponent(archetypeName)}&format=${TCG_FORMAT}${langParam()}`
  try {
    const res = await $fetch<CardInfoApiResponse>(url)
    return res?.data ?? []
  } catch {
    return []
  }
}

/** Vrai si l'archétype a au moins 2 cartes représentatives au bon format (art carré). */
export async function hasEnoughRepresentatives (archetypeName: string): Promise<boolean> {
  const cards = await fetchCardsForArchetype(archetypeName)
  const top = pickRepresentativeCards(cards, archetypeName, 10)
  return top.length >= MIN_REPRESENTATIVE_CARDS
}

const BATCH_SIZE = 18
const BATCH_DELAY_MS = 1100

/** Garde uniquement les archétypes qui ont au moins 2 images au bon format. */
export async function filterArchetypesWithEnoughRepresentatives (
  names: string[]
): Promise<string[]> {
  const valid: string[] = []
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map(hasEnoughRepresentatives))
    batch.forEach((name, j) => {
      if (results[j]) valid.push(name)
    })
    if (i + BATCH_SIZE < names.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }
  return valid
}

/** Charge les 3–4 cartes les plus emblématiques (format carré). Retourne null si moins de 2. */
export async function loadRepresentativesForArchetype (
  archetypeName: string
): Promise<{ representativeCards: RepresentativeCard[]; representativeIndex: number } | null> {
  const cards = await fetchCardsForArchetype(archetypeName)
  const top = pickRepresentativeCards(cards, archetypeName, 10)
  if (top.length < MIN_REPRESENTATIVE_CARDS) return null
  const representativeCards: RepresentativeCard[] = top.map(c => ({
    id: c.id,
    imageUrl: getCardImageUrl(c),
    imageUrlFull: getFullCardImageUrl(c),
    name: c.name,
    frameType: c.frameType ?? frameTypeFromCardType(c.type),
    attribute: c.attribute,
    level: c.level,
    race: c.race,
    atk: c.atk,
    def: c.def
  }))
  /* Afficher par défaut la carte la plus importante (index 0, déjà triée par score) */
  const representativeIndex = 0
  return { representativeCards, representativeIndex }
}

/** Rétrocompat : une seule carte. */
export async function loadRepresentativeForArchetype (
  archetypeName: string
): Promise<{ imageUrl: string; representativeCardId: number } | null> {
  const res = await loadRepresentativesForArchetype(archetypeName)
  if (!res?.representativeCards.length) return null
  const cur = res.representativeCards[res.representativeIndex] ?? res.representativeCards[0]
  return { imageUrl: cur.imageUrl, representativeCardId: cur.id }
}
