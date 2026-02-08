import type { TournamentState, ArchetypeState } from '~/types/tournament'
import { seededShuffle } from '~/utils/state'

/** Clé normalisée pour une paire (ordre alphabétique). */
export function matchKey (a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Sépare le pool en tiers par nombre de cartes représentatives (12, 9, 6…).
 * Retourne les tiers triés par nombre décroissant de cartes.
 */
function splitByCardCount (
  pool: string[],
  archetypes: Record<string, ArchetypeState>
): string[][] {
  const byCount = new Map<number, string[]>()
  for (const name of pool) {
    const count = archetypes[name]?.representativeCards?.length ?? 0
    if (!byCount.has(count)) byCount.set(count, [])
    byCount.get(count)!.push(name)
  }
  // Trier par nombre décroissant de cartes (12 d'abord, puis 9, puis 6…)
  return [...byCount.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, names]) => names)
}

/**
 * Clé thématique pour regrouper les archétypes similaires.
 * Combine attribut dominant + race dominante (ex: "DARK|Dragon", "WIND|Winged Beast").
 * Les archétypes sans metadata (Round 1, pas encore chargés) vont dans un cluster commun.
 */
function thematicKey (name: string, archetypes: Record<string, ArchetypeState>): string {
  const entry = archetypes[name]
  const attr = entry?.dominantAttribute ?? '?'
  const race = entry?.dominantRace ?? '?'
  if (attr === '?' && race === '?') return '_unknown'
  return `${attr}|${race}`
}

/**
 * Regroupe les archétypes par thème (attribut+race) puis les intercale
 * pour que les groupes de 4 contiennent des archétypes thématiquement proches.
 * Au sein de chaque cluster thématique, l'ordre est celui donné en entrée.
 */
function clusterByTheme (
  names: string[],
  archetypes: Record<string, ArchetypeState>
): string[] {
  const clusters = new Map<string, string[]>()
  for (const name of names) {
    const key = thematicKey(name, archetypes)
    if (!clusters.has(key)) clusters.set(key, [])
    clusters.get(key)!.push(name)
  }
  // Trier les clusters par taille décroissante (les plus gros thèmes d'abord)
  const sorted = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length)
  // Concaténer : les archétypes d'un même thème se retrouvent consécutifs
  // → quand on chunk par groupes de 4, ils seront ensemble
  return sorted.flatMap(([, arr]) => arr)
}

/**
 * Chunk un sous-pool en groupes, en fusionnant le dernier groupe s'il n'a qu'un élément.
 */
function chunkGroups (items: string[], groupSize: number): string[][] {
  const groups: string[][] = []
  for (let i = 0; i < items.length; i += groupSize) {
    groups.push(items.slice(i, i + groupSize))
  }
  if (groups.length > 1 && groups[groups.length - 1]!.length === 1) {
    const last = groups.pop()!
    groups[groups.length - 1]!.push(...last)
  }
  return groups
}

/**
 * Fusionne les groupes trop petits (1 élément) à la fin avec le groupe précédent.
 * Gère les restes de tiers qui ne forment pas un groupe complet.
 */
function mergeSmallTailGroups (groups: string[][]): string[][] {
  if (groups.length <= 1) return groups
  const out = [...groups]
  while (out.length > 1 && out[out.length - 1]!.length === 1) {
    const last = out.pop()!
    out[out.length - 1]!.push(...last)
  }
  return out
}

/**
 * Construit des groupes de `groupSize` par mélange aléatoire (coverage).
 * Tri : card count tier → thème (attribut+race) → shuffle intra-cluster.
 * Les archétypes thématiquement proches (ex: WIND/Winged Beast) se retrouvent ensemble.
 * Le dernier groupe de chaque tier peut être plus petit (2 ou 3).
 */
export function buildCoverageGroups (
  pool: string[],
  archetypes: Record<string, ArchetypeState>,
  seed: number,
  groupSize: number = 4
): string[][] {
  if (pool.length === 0) return []
  const tiers = splitByCardCount(pool, archetypes)
  const allGroups: string[][] = []
  for (let t = 0; t < tiers.length; t++) {
    // Regrouper par thème, puis mélanger au sein de chaque cluster
    const themed = clusterByTheme(tiers[t]!, archetypes)
    const shuffled = themedShuffle(themed, archetypes, seed + t * 777)
    allGroups.push(...chunkGroups(shuffled, groupSize))
  }
  return mergeSmallTailGroups(allGroups)
}

/**
 * Mélange qui préserve la proximité thématique : mélange au sein de chaque cluster
 * thématique, puis concatène les clusters (dans un ordre aléatoire pour varier).
 */
function themedShuffle (
  themed: string[],
  archetypes: Record<string, ArchetypeState>,
  seed: number
): string[] {
  // Re-séparer par cluster pour shuffler chaque cluster indépendamment
  const clusters = new Map<string, string[]>()
  for (const name of themed) {
    const key = thematicKey(name, archetypes)
    if (!clusters.has(key)) clusters.set(key, [])
    clusters.get(key)!.push(name)
  }
  const keys = seededShuffle([...clusters.keys()], seed)
  const out: string[] = []
  for (let i = 0; i < keys.length; i++) {
    out.push(...seededShuffle(clusters.get(keys[i]!)!, seed + i * 333))
  }
  return out
}

/**
 * Construit des groupes par proximité Elo (refinement).
 * D'abord séparé par card count tier, puis par thème (attribut+race),
 * puis dans chaque sous-groupe : tri par Elo desc → découpage en blocs → mélange intra-bloc.
 */
export function buildEloProximityGroups (
  pool: string[],
  archetypes: Record<string, ArchetypeState>,
  seed: number,
  groupSize: number = 4
): string[][] {
  if (pool.length === 0) return []
  const tiers = splitByCardCount(pool, archetypes)
  const allGroups: string[][] = []
  for (let t = 0; t < tiers.length; t++) {
    // Sous-grouper par thème au sein de chaque tier
    const themeClusters = new Map<string, string[]>()
    for (const name of tiers[t]!) {
      const key = thematicKey(name, archetypes)
      if (!themeClusters.has(key)) themeClusters.set(key, [])
      themeClusters.get(key)!.push(name)
    }
    // Trier chaque cluster par Elo, puis chunk
    for (const [, cluster] of themeClusters) {
      const sorted = [...cluster].sort((a, b) => {
        const eloA = archetypes[a]?.elo ?? 1000
        const eloB = archetypes[b]?.elo ?? 1000
        return eloB - eloA
      })
      for (let i = 0; i < sorted.length; i += groupSize) {
        const block = sorted.slice(i, i + groupSize)
        allGroups.push(seededShuffle(block, seed + t * 777 + i))
      }
    }
  }
  return mergeSmallTailGroups(allGroups)
}

/**
 * Pairing Suisse : pool trié par nombre de cartes desc, puis score, puis Elo.
 * Paires voisines, évite les re-matches.
 * Préfère : même card count → même thème → même score → relâche progressivement.
 * Retourne [nameA, nameB] ou null si aucune paire disponible.
 */
export function getNextMatchSwiss (
  state: TournamentState,
  pool: string[]
): [string, string] | null {
  if (pool.length < 2) return null

  const playedSet = new Set(state.matchesPlayed)
  const sorted = [...pool].sort((a, b) => {
    const entryA = state.archetypes[a]
    const entryB = state.archetypes[b]
    // D'abord par nombre de cartes représentatives (desc)
    const cardsA = entryA?.representativeCards?.length ?? 0
    const cardsB = entryB?.representativeCards?.length ?? 0
    if (cardsB !== cardsA) return cardsB - cardsA
    // Puis par score (wins - losses)
    const scoreA = (entryA?.wins ?? 0) - (entryA?.losses ?? 0)
    const scoreB = (entryB?.wins ?? 0) - (entryB?.losses ?? 0)
    if (scoreB !== scoreA) return scoreB - scoreA
    return (entryB?.elo ?? 1000) - (entryA?.elo ?? 1000)
  })

  // Tolérances croissantes : même cartes + même thème → même cartes → tout
  const passes: { sameCards: boolean; sameTheme: boolean }[] = [
    { sameCards: true, sameTheme: true },
    { sameCards: true, sameTheme: false },
    { sameCards: false, sameTheme: false }
  ]
  for (const { sameCards, sameTheme } of passes) {
    const tolerances = [0, 1, 2, 3, 10, Infinity]
    for (const scoreTol of tolerances) {
      for (let i = 0; i < sorted.length; i++) {
        const nameI = sorted[i]!
        const entryI = state.archetypes[nameI]
        const cardsI = entryI?.representativeCards?.length ?? 0
        const themeI = thematicKey(nameI, state.archetypes)
        const scoreI = (entryI?.wins ?? 0) - (entryI?.losses ?? 0)
        for (let j = i + 1; j < sorted.length; j++) {
          const nameJ = sorted[j]!
          const entryJ = state.archetypes[nameJ]
          const cardsJ = entryJ?.representativeCards?.length ?? 0
          if (sameCards && cardsI !== cardsJ) continue
          if (sameTheme && thematicKey(nameJ, state.archetypes) !== themeI) continue
          const scoreJ = (entryJ?.wins ?? 0) - (entryJ?.losses ?? 0)
          if (Math.abs(scoreI - scoreJ) > scoreTol) continue
          const key = matchKey(nameI, nameJ)
          if (!playedSet.has(key)) return [nameI, nameJ]
        }
      }
    }
  }
  return null
}
