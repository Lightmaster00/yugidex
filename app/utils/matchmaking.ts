import type { TournamentState, ArchetypeState } from '~/types/tournament'
import { seededShuffle } from '~/utils/state'

/** Normalized key for a pair (alphabetical order). */
export function matchKey (a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Splits the pool into tiers by number of representative cards (12, 9, 6…).
 * Returns the tiers sorted by descending card count.
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
  // Sort by descending card count (12 first, then 9, then 6…)
  return [...byCount.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, names]) => names)
}

/**
 * Thematic key for grouping similar archetypes.
 * Combines dominant attribute + dominant race (e.g. "DARK|Dragon", "WIND|Winged Beast").
 * Archetypes without metadata (Round 1, not yet loaded) go into a common cluster.
 */
function thematicKey (name: string, archetypes: Record<string, ArchetypeState>): string {
  const entry = archetypes[name]
  const attr = entry?.dominantAttribute ?? '?'
  const race = entry?.dominantRace ?? '?'
  if (attr === '?' && race === '?') return '_unknown'
  return `${attr}|${race}`
}

/**
 * Groups archetypes by theme (attribute+race) then interleaves them
 * so that groups of 4 contain thematically close archetypes.
 * Within each thematic cluster, the order is as given in input.
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
  // Sort clusters by descending size (largest themes first)
  const sorted = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length)
  // Concatenate: archetypes of the same theme end up consecutive
  // → when chunking into groups of 4, they will be together
  return sorted.flatMap(([, arr]) => arr)
}

/**
 * Chunks a sub-pool into groups of size ≤ groupSize and ≥ 2.
 * If the last group is too small (1 element), we borrow from the previous
 * so both have at least 2 elements, never exceeding groupSize.
 */
function chunkGroups (items: string[], groupSize: number): string[][] {
  if (items.length === 0) return []
  if (items.length <= groupSize) return [items]
  const groups: string[][] = []
  for (let i = 0; i < items.length; i += groupSize) {
    groups.push(items.slice(i, i + groupSize))
  }
  // If the last group has only one element, rebalance with the second-to-last
  if (groups.length > 1 && groups[groups.length - 1]!.length === 1) {
    const last = groups[groups.length - 1]!
    const prev = groups[groups.length - 2]!
    // Borrow one element from the second-to-last to give to the last
    const borrowed = prev.pop()!
    last.unshift(borrowed)
  }
  return groups
}

/**
 * Merges all groups that are too small (< 2 elements).
 * Borrows from a neighbor (keeping it ≥ 2) so no group exceeds groupSize.
 * If the neighbor has only 2, merges entirely (result ≤ 3).
 */
function mergeSmallGroups (groups: string[][]): string[][] {
  if (groups.length <= 1) return groups
  const out = [...groups.map(g => [...g])]
  let i = 0
  while (i < out.length) {
    if (out[i]!.length < 2) {
      // Pick a neighbor to fix from (prefer next, else previous)
      const neighborIdx = i + 1 < out.length ? i + 1 : i - 1
      if (neighborIdx < 0) { i++; continue }
      const neighbor = out[neighborIdx]!
      if (neighbor.length >= 3) {
        // Borrow one element: [1] + borrow → [2], neighbor stays ≥ 2
        const borrowed = neighborIdx > i ? neighbor.shift()! : neighbor.pop()!
        out[i]!.push(borrowed)
        i++
      } else {
        // Neighbor has 2: merge into it (result = 3, acceptable)
        neighbor.push(...out[i]!)
        out.splice(i, 1)
        // Don't increment i — re-check at same index
      }
    } else {
      i++
    }
  }
  return out
}

/**
 * Builds groups of `groupSize` by random shuffle (coverage).
 * Sort: card count tier → theme (attribute+race) → intra-cluster shuffle.
 * Thematically close archetypes (e.g. WIND/Winged Beast) end up together.
 * The last group of each tier may be smaller (2 or 3).
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
    // Group by theme, then shuffle within each cluster
    const themed = clusterByTheme(tiers[t]!, archetypes)
    const shuffled = themedShuffle(themed, archetypes, seed + t * 777)
    allGroups.push(...chunkGroups(shuffled, groupSize))
  }
  return mergeSmallGroups(allGroups)
}

/**
 * Shuffle that preserves thematic proximity: shuffles within each thematic
 * cluster, then concatenates clusters (in random order for variety).
 */
function themedShuffle (
  themed: string[],
  archetypes: Record<string, ArchetypeState>,
  seed: number
): string[] {
  // Re-split by cluster to shuffle each cluster independently
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
 * Builds groups by Elo proximity (refinement).
 * First separated by card count tier, then by theme (attribute+race),
 * then within each subgroup: sort by Elo desc → split into blocks → intra-block shuffle.
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
    // Sub-group by theme within each tier
    const themeClusters = new Map<string, string[]>()
    for (const name of tiers[t]!) {
      const key = thematicKey(name, archetypes)
      if (!themeClusters.has(key)) themeClusters.set(key, [])
      themeClusters.get(key)!.push(name)
    }
    // Sort each cluster by Elo, then chunk
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
  return mergeSmallGroups(allGroups)
}

/**
 * Swiss pairing: pool sorted by card count desc, then score, then Elo.
 * Adjacent pairs, avoids rematches.
 * Prefers: same card count → same theme → same score → progressively relaxes.
 * Returns [nameA, nameB] or null if no pair available.
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
    // First by number of representative cards (desc)
    const cardsA = entryA?.representativeCards?.length ?? 0
    const cardsB = entryB?.representativeCards?.length ?? 0
    if (cardsB !== cardsA) return cardsB - cardsA
    // Then by score (wins - losses)
    const scoreA = (entryA?.wins ?? 0) - (entryA?.losses ?? 0)
    const scoreB = (entryB?.wins ?? 0) - (entryB?.losses ?? 0)
    if (scoreB !== scoreA) return scoreB - scoreA
    return (entryB?.elo ?? 1000) - (entryA?.elo ?? 1000)
  })

  // Increasing tolerances: same cards + same theme → same cards → all
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
