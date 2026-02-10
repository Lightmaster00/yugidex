/**
 * Intrinsic links and card relevance for an archetype.
 * - Coherence: check if the archetype is a true theme or a loose grouping (e.g. Chaos, Penguin).
 * - Automatic inclusion: cards mentioned in descriptions and linked to the archetype.
 * - Exclusion: tagged cards with no real link (name + description analysis).
 */
import type { YgoCard } from '~/types/api'

function normalize (s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/-/g, ' ')
    .trim()
}

export function canonicalArchetypeName (archetypeName: string): string {
  const n = normalize(archetypeName)
  return n.replace(/^(the|a|an)\s+/, '')
}

/** Verdict on archetype coherence (true theme vs loose grouping). */
export type CoherenceVerdict = 'coherent' | 'loose' | 'unknown'

export interface ArchetypeCoherenceResult {
  score: number
  nameMatches: number
  descMatches: number
  crossReferences: number
  totalCards: number
  verdict: CoherenceVerdict
}

/**
 * Analyzes whether the archetype forms a coherent set (common theme, cross-references)
 * or a loose grouping (cards mainly sharing a word in the name).
 */
export function analyzeArchetypeCoherence (
  cards: YgoCard[],
  archetypeName: string
): ArchetypeCoherenceResult {
  const total = cards.length
  if (total === 0) {
    return { score: 0, nameMatches: 0, descMatches: 0, crossReferences: 0, totalCards: 0, verdict: 'unknown' }
  }
  const want = canonicalArchetypeName(archetypeName)
  const wantTokens = want.split(/\s+/).filter(Boolean)
  const names = new Set(cards.map(c => (c.name_en ?? c.name).trim().toLowerCase()))
  let nameMatches = 0
  let descMatches = 0
  let crossRefs = 0
  for (const c of cards) {
    const nameEn = (c.name_en ?? c.name).trim().toLowerCase()
    const desc = (c.desc ?? '').toLowerCase()
    if (nameEn.includes(want) || wantTokens.every(t => nameEn.includes(t))) nameMatches++
    if (desc.includes(want) || wantTokens.some(t => desc.includes(t))) descMatches++
    for (const other of names) {
      if (other === nameEn) continue
      if (desc.includes(other)) crossRefs++
    }
  }
  const nameRatio = nameMatches / total
  const descRatio = descMatches / total
  const crossRefDensity = total > 1 ? crossRefs / (total * (total - 1)) : 0
  const score = nameRatio * 0.4 + descRatio * 0.4 + Math.min(1, crossRefDensity * 10) * 0.2
  let verdict: CoherenceVerdict = 'unknown'
  if (score >= 0.45) verdict = 'coherent'
  else if (score < 0.25) verdict = 'loose'
  return {
    score: Math.round(score * 100) / 100,
    nameMatches,
    descMatches,
    crossReferences: crossRefs,
    totalCards: total,
    verdict
  }
}
