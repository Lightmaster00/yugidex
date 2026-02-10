/**
 * ═══════════════════════════════════════════════════════════════════════
 *  ARCHETYPE INTELLIGENCE  —  Evidence-Based Detection, Intrinsic
 *  Clustering, Display-Entity Generation & Representative Card Scoring
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  P1  Reject false / generic archetypes
 *  P2  Clean card assignment (Members vs Supports, intrusion detection)
 *  P3  Discover missing archetypes from card text
 *  P4  Build HIDING intrinsic clusters (EdgeImp+Fluffal+Frightfur → 1 entity)
 *  P5  Pick truly representative cards (boss, searcher, pivot, connector)
 */

import type { YgoCard } from '~/types/api'

// ═══════════════════════════════════════════════════════════════════════
// §1  TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface CardData {
  id: number
  name: string          // English
  desc: string          // English
  type: string          // "Effect Monster", "Spell Card" …
  frameType: string     // "effect", "fusion", "spell" …
  externalArchetype: string | null
}

export type ArchetypeStatus = 'accepted' | 'rejected' | 'suspect'

export interface ArchetypeEvidence {
  mentionsCount: number
  nameMatchCount: number
  internalDensity: number
  pivotCount: number
  contaminationScore: number
  contaminationBy: string | null
  anchorCardIds: number[]
  rejectionReasons: string[]
}

export interface InferredArchetype {
  label: string
  key: string
  confidenceScore: number
  status: ArchetypeStatus
  memberIds: number[]
  supportIds: number[]
  evidence: ArchetypeEvidence
}

export interface LinkSignals {
  crossAB: number   // fraction of members(A) mentioning "B"
  crossBA: number   // fraction of members(B) mentioning "A"
  pivotCohesion: number
  supportOverlap: number
  score: number
}

export interface IntrinsicCluster {
  id: string
  headKey: string
  archetypeKeys: string[]
  links: Array<{ a: string; b: string; signals: LinkSignals }>
  labelDisplay: string
  isHiding: true
}

export interface DisplayEntity {
  entityId: string
  entityType: 'cluster' | 'archetype'
  labelDisplay: string
  memberCardIds: number[]
  supportCardIds: number[]
  representativeCardIds: number[]
  representativeReasons: Map<number, string[]>
  containedArchetypes: string[]
}

export interface PipelineResult {
  archetypes: Map<string, InferredArchetype>
  clusters: IntrinsicCluster[]
  displayEntities: DisplayEntity[]
  /** For the app: display entity labels (used as tournament entries). */
  validNames: string[]
  /** For the app: entity label → partner archetype keys (for card fetching). */
  partnerMap: Record<string, string[]>
  /** For the app: entity label → pre-computed representative card IDs. */
  representativeMap: Record<string, number[]>
  dashboard: {
    totalCards: number
    totalLabels: number
    candidates: number
    accepted: number
    rejected: number
    suspect: number
    clusters: number
    entities: number
    issues: string[]
  }
}

export interface PipelineConfig {
  // Archetype inference
  minMentionCards: number
  labelMinLen: number
  minDensity: number
  minPivots: number
  maxContamination: number
  acceptScore: number
  acceptScoreExternal: number
  // Intrinsic clusters
  intrinsicBiMin: number
  intrinsicAsymMax: number
  intrinsicPivotMin: number
  maxClusterSize: number
  clusterW1: number   // min(cross)
  clusterW2: number   // max(cross)
  clusterW3: number   // pivot_cohesion
  clusterW4: number   // support_overlap
  clusterW5: number   // generality_penalty
  // Representative cards
  repTopK: number
  repInboundWeight: number
  repPivotWeight: number
  repConnectorWeight: number
  repBossWeight: number
  repGenericPenalty: number
  repDiversityBoss: number
  repDiversityPivot: number
  // Card assignment
  minInboundAsMember: number
  // Misc
  knownBadLabels: Set<string>
  clusterOverrides: Array<[string, string]>
  minCardsForDisplay: number
}

// ═══════════════════════════════════════════════════════════════════════
// §2  CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

const KNOWN_BAD_LABELS: Set<string> = new Set([
  'dragon', 'spellcaster', 'magician', 'warrior', 'zombie', 'fiend',
  'machine', 'aqua', 'pyro', 'rock', 'plant', 'insect', 'dinosaur',
  'beast', 'winged beast', 'fairy', 'thunder', 'wyrm', 'cyberse',
  'sea serpent', 'reptile', 'psychic', 'beast-warrior', 'fish',
  'divine-beast', 'creator god',
  'light', 'dark', 'fire', 'water', 'wind', 'earth', 'divine',
  'spell card', 'trap card', 'monster card', 'normal monster',
  'effect monster', 'ritual monster', 'fusion monster',
  'synchro monster', 'xyz monster', 'link monster',
  'pendulum monster', 'tuner monster', 'tuner', 'token',
  'fusion', 'synchro', 'xyz', 'link', 'pendulum', 'ritual',
  'normal summon', 'special summon', 'tribute summon',
  'monster', 'spell', 'trap', 'card', 'effect', 'level', 'rank',
  'counter', 'material', 'overlay unit', 'equip spell',
])

export const DEFAULT_CONFIG: PipelineConfig = {
  minMentionCards: 4,
  labelMinLen: 3,
  minDensity: 0.12,
  minPivots: 1,
  maxContamination: 0.75,
  acceptScore: 0.45,
  acceptScoreExternal: 0.28,
  intrinsicBiMin: 0.20,
  intrinsicAsymMax: 0.45,
  intrinsicPivotMin: 0.10,
  maxClusterSize: 8,
  clusterW1: 0.45, clusterW2: 0.15, clusterW3: 0.25,
  clusterW4: 0.15, clusterW5: 0.20,
  repTopK: 10,
  repInboundWeight: 0.8,
  repPivotWeight: 1.0,
  repConnectorWeight: 0.4,
  repBossWeight: 0.5,
  repGenericPenalty: 1.2,
  repDiversityBoss: 1,
  repDiversityPivot: 1,
  minInboundAsMember: 2,
  knownBadLabels: KNOWN_BAD_LABELS,
  clusterOverrides: [],
  minCardsForDisplay: 3,
}

// ═══════════════════════════════════════════════════════════════════════
// §3  TEXT ANALYSIS
// ═══════════════════════════════════════════════════════════════════════

function normalizeText (s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/\s+/g, ' ').trim()
}

export function normalizeKey (label: string): string {
  return normalizeText(label).replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
}

const QUOTED_RE = /"([^"]{2,60})"/g

function extractQuotedLabels (desc: string): string[] {
  const out: string[] = []
  QUOTED_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = QUOTED_RE.exec(desc)) !== null) {
    const raw = m[1]!.trim()
    if (raw.length >= 2) out.push(raw)
  }
  return out
}

function hasPivotPattern (descLower: string, labelKey: string): boolean {
  if (!descLower.includes(`"${labelKey}"`)) return false
  return (
    descLower.includes('always treated as') ||
    descLower.includes('name becomes') ||
    descLower.includes('is also a') ||
    descLower.includes('counts as') ||
    (descLower.includes('add') && (descLower.includes('deck') || descLower.includes('hand'))) ||
    descLower.includes('special summon') ||
    descLower.includes('if you control') ||
    descLower.includes('destroy all') ||
    descLower.includes('target')
  )
}

// ── Label Index ──────────────────────────────────────────────────────

interface LabelIndex {
  labelToCards: Map<string, Set<number>>
  cardToLabels: Map<number, Set<string>>
  pivotToCards: Map<string, Set<number>>
  nameToId: Map<string, number>
  labelDisplay: Map<string, string>
}

function buildLabelIndex (cards: CardData[]): LabelIndex {
  const cardById = new Map(cards.map(c => [c.id, c]))
  const labelToCards = new Map<string, Set<number>>()
  const cardToLabels = new Map<number, Set<string>>()
  const pivotToCards = new Map<string, Set<number>>()
  const nameToId = new Map<string, number>()
  const labelDisplay = new Map<string, string>()

  for (const card of cards) {
    nameToId.set(normalizeKey(card.name), card.id)
    const rawLabels = extractQuotedLabels(card.desc)
    const keySet = new Set<string>()
    for (const raw of rawLabels) {
      const key = normalizeKey(raw)
      if (!key || key.length < 2) continue
      keySet.add(key)
      if (!labelToCards.has(key)) labelToCards.set(key, new Set())
      labelToCards.get(key)!.add(card.id)
      if (!labelDisplay.has(key)) labelDisplay.set(key, raw)
    }
    cardToLabels.set(card.id, keySet)
  }

  for (const [labelKey, cardIds] of labelToCards) {
    for (const cardId of cardIds) {
      const card = cardById.get(cardId)
      if (!card) continue
      if (hasPivotPattern(card.desc.toLowerCase(), labelKey)) {
        if (!pivotToCards.has(labelKey)) pivotToCards.set(labelKey, new Set())
        pivotToCards.get(labelKey)!.add(cardId)
      }
    }
  }

  return { labelToCards, cardToLabels, pivotToCards, nameToId, labelDisplay }
}

// ═══════════════════════════════════════════════════════════════════════
// §4  SCORING & ACCEPTANCE
// ═══════════════════════════════════════════════════════════════════════

function intersect (a: Set<number>, b: Set<number>): number {
  let n = 0
  const [s, l] = a.size < b.size ? [a, b] : [b, a]
  for (const v of s) if (l.has(v)) n++
  return n
}

function expandedCardSet (labelKey: string, index: LabelIndex): Set<number> {
  const direct = index.labelToCards.get(labelKey)
  if (!direct) return new Set()
  const exp = new Set(direct)
  for (const [otherKey, otherIds] of index.labelToCards) {
    if (otherKey === labelKey) continue
    if (otherKey.includes(labelKey) && otherKey.length > labelKey.length) {
      for (const id of otherIds) exp.add(id)
    }
  }
  return exp
}

function countNameMatches (labelKey: string, cardNames: Map<number, string>): number {
  let count = 0
  for (const name of cardNames.values()) {
    if (name.includes(labelKey)) count++
  }
  return count
}

function computeEvidence (
  labelKey: string,
  index: LabelIndex,
  cardNames: Map<number, string>,
  _config: PipelineConfig
): ArchetypeEvidence {
  const cards = expandedCardSet(labelKey, index)
  const mentionsCount = cards.size
  const nameMatchCount = countNameMatches(labelKey, cardNames)
  const pivotCards = index.pivotToCards.get(labelKey) ?? new Set()
  const pivotCount = pivotCards.size

  // Internal density
  let connected = 0
  for (const cardId of cards) {
    const cLabels = index.cardToLabels.get(cardId) ?? new Set()
    let found = false
    for (const other of cLabels) {
      if (other === labelKey) continue
      const otherCards = index.labelToCards.get(other) ?? new Set()
      if (intersect(cards, otherCards) >= Math.min(2, cards.size * 0.12)) { found = true; break }
    }
    if (found || pivotCards.has(cardId)) connected++
  }
  const internalDensity = mentionsCount > 0 ? connected / mentionsCount : 0

  // Contamination
  let contaminationScore = 0
  let contaminationBy: string | null = null
  for (const [otherKey, otherIds] of index.labelToCards) {
    if (otherKey === labelKey || otherKey.length < 3) continue
    if (otherKey.includes(labelKey)) continue // superset names ok
    const overlap = intersect(cards, otherIds)
    const ratio = mentionsCount > 0 ? overlap / mentionsCount : 0
    if (ratio > contaminationScore) { contaminationScore = ratio; contaminationBy = otherKey }
  }

  return {
    mentionsCount, nameMatchCount, internalDensity, pivotCount,
    contaminationScore, contaminationBy,
    anchorCardIds: [...cards].slice(0, 5),
    rejectionReasons: [],
  }
}

function decideAcceptance (
  labelKey: string,
  evidence: ArchetypeEvidence,
  isExternal: boolean,
  config: PipelineConfig
): { status: ArchetypeStatus; confidence: number; reasons: string[] } {
  const reasons: string[] = []

  if (config.knownBadLabels.has(labelKey))
    return { status: 'rejected', confidence: 0, reasons: ['known_bad_label'] }
  if (labelKey.replace(/[^a-z]/g, '').length < config.labelMinLen)
    return { status: 'rejected', confidence: 0, reasons: ['label_too_short'] }

  // ── Score ──
  let score = 0
  score += isExternal ? 0.18 : 0
  score += Math.min(0.18, evidence.mentionsCount / 20 * 0.18)
  score += evidence.internalDensity * 0.18
  score += Math.min(0.14, evidence.pivotCount / 4 * 0.14)
  score += Math.min(0.16, evidence.nameMatchCount / 6 * 0.16)
  score -= evidence.contaminationScore * 0.10
  if (evidence.mentionsCount >= 8) score += 0.04
  score = Math.max(0, Math.min(1, score))

  // ── Hard fails ──
  if (evidence.mentionsCount < config.minMentionCards && !isExternal) {
    reasons.push(`insufficient_mentions:${evidence.mentionsCount}`)
    return { status: 'rejected', confidence: score, reasons }
  }
  if (evidence.contaminationScore > config.maxContamination) {
    reasons.push(`high_contamination:${evidence.contaminationBy}`)
    if (score < config.acceptScoreExternal)
      return { status: 'rejected', confidence: score, reasons }
  }

  // ── Two-tier acceptance ──
  const threshold = isExternal ? config.acceptScoreExternal : config.acceptScore
  if (score >= threshold) return { status: 'accepted', confidence: score, reasons }
  if (score >= 0.15) return { status: 'suspect', confidence: score, reasons }
  return { status: 'rejected', confidence: score, reasons }
}

// ═══════════════════════════════════════════════════════════════════════
// §5  CARD ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════

function isExplicitMember (descLower: string, labelKey: string): boolean {
  if (!descLower.includes(`"${labelKey}"`)) return false
  return descLower.includes('always treated as') ||
    descLower.includes('name becomes') ||
    descLower.includes('is also a')
}

function deriveMembers (
  labelKey: string,
  index: LabelIndex,
  allCards: Map<number, CardData>,
  config: PipelineConfig
): { memberIds: number[]; supportIds: number[] } {
  const supportSet = expandedCardSet(labelKey, index)
  const members = new Set<number>()

  // Build inbound index for pool
  const nameInbound = new Map<number, number>()
  for (const cardId of supportSet) {
    const card = allCards.get(cardId)
    if (!card) continue
    const nameKey = normalizeKey(card.name)
    let inbound = 0
    for (const otherId of supportSet) {
      if (otherId === cardId) continue
      const otherLabels = index.cardToLabels.get(otherId) ?? new Set()
      if (otherLabels.has(nameKey)) inbound++
    }
    nameInbound.set(cardId, inbound)
  }

  for (const cardId of supportSet) {
    const card = allCards.get(cardId)
    if (!card) continue
    const descLower = card.desc.toLowerCase()
    const nameNorm = normalizeKey(card.name)
    const ib = nameInbound.get(cardId) ?? 0
    // A) Explicit member: "always treated as an X card"
    if (isExplicitMember(descLower, labelKey)) { members.add(cardId); continue }
    // B) Strongly referenced by other archetype cards
    if (ib >= config.minInboundAsMember) { members.add(cardId); continue }
    // C) Name contains archetype AND at least 1 inbound reference
    if (nameNorm.includes(labelKey) && ib >= 1) { members.add(cardId); continue }
    // D) Name contains archetype AND description mentions archetype
    //    (prevents name-only false positives like "Cipher Soldier" in Cipher)
    if (labelKey.length >= 5 && nameNorm.includes(labelKey) && descLower.includes(labelKey)) {
      members.add(cardId); continue
    }
  }

  // External archetype hint — require real connection, not just name
  for (const [cardId, card] of allCards) {
    if (members.has(cardId) || supportSet.has(cardId)) continue
    const ext = normalizeKey(card.externalArchetype ?? '')
    if (!ext) continue
    if (ext === labelKey || ext.includes(labelKey) || labelKey.includes(ext)) {
      const nameMatch = normalizeKey(card.name).includes(labelKey)
      if (!nameMatch) continue
      const descLower = card.desc.toLowerCase()
      // Require description to mention the archetype (ecosystem connection)
      if (descLower.includes(labelKey)) { members.add(cardId); continue }
      // Or at least one card in the archetype references this card
      const cardNameKey = normalizeKey(card.name)
      for (const sid of supportSet) {
        const otherLabels = index.cardToLabels.get(sid) ?? new Set()
        if (otherLabels.has(cardNameKey)) { members.add(cardId); break }
      }
    }
  }

  return {
    memberIds: [...members],
    supportIds: [...supportSet].filter(id => !members.has(id)),
  }
}

// ═══════════════════════════════════════════════════════════════════════
// §6  LINK SIGNALS & INTRINSIC CLUSTERS
// ═══════════════════════════════════════════════════════════════════════

function computeLinkSignals (
  aKey: string,
  bKey: string,
  archetypes: Map<string, InferredArchetype>,
  index: LabelIndex,
  config: PipelineConfig
): LinkSignals {
  const archA = archetypes.get(aKey)!
  const archB = archetypes.get(bKey)!
  const membersA = new Set(archA.memberIds)
  const membersB = new Set(archB.memberIds)

  // S1 — cross_mention
  let aMentionsB = 0
  for (const id of membersA) {
    const labels = index.cardToLabels.get(id) ?? new Set()
    if (labels.has(bKey)) aMentionsB++
  }
  let bMentionsA = 0
  for (const id of membersB) {
    const labels = index.cardToLabels.get(id) ?? new Set()
    if (labels.has(aKey)) bMentionsA++
  }
  const crossAB = membersA.size > 0 ? aMentionsB / membersA.size : 0
  const crossBA = membersB.size > 0 ? bMentionsA / membersB.size : 0

  // S2 — pivot_cohesion
  const pivotsA = index.pivotToCards.get(aKey) ?? new Set()
  const pivotsB = index.pivotToCards.get(bKey) ?? new Set()
  let pivotAMentionsB = 0
  for (const id of pivotsA) {
    const labels = index.cardToLabels.get(id) ?? new Set()
    if (labels.has(bKey)) pivotAMentionsB++
  }
  let pivotBMentionsA = 0
  for (const id of pivotsB) {
    const labels = index.cardToLabels.get(id) ?? new Set()
    if (labels.has(aKey)) pivotBMentionsA++
  }
  const pA = pivotsA.size > 0 ? pivotAMentionsB / pivotsA.size : 0
  const pB = pivotsB.size > 0 ? pivotBMentionsA / pivotsB.size : 0
  const pivotCohesion = Math.max(pA, pB)

  // S3 — support_overlap (Jaccard)
  const supA = new Set(archA.supportIds)
  const supB = new Set(archB.supportIds)
  const inter = intersect(supA, supB)
  const union = supA.size + supB.size - inter
  const supportOverlap = union > 0 ? inter / union : 0

  // Combined score
  const minCross = Math.min(crossAB, crossBA)
  const maxCross = Math.max(crossAB, crossBA)
  const score =
    config.clusterW1 * minCross +
    config.clusterW2 * maxCross +
    config.clusterW3 * pivotCohesion +
    config.clusterW4 * supportOverlap

  return { crossAB, crossBA, pivotCohesion, supportOverlap, score }
}

function isIntrinsicLink (signals: LinkSignals, config: PipelineConfig): boolean {
  const minCross = Math.min(signals.crossAB, signals.crossBA)
  const maxCross = Math.max(signals.crossAB, signals.crossBA)
  // Test I — strong bilateral
  if (minCross >= config.intrinsicBiMin) return true
  // Test II — asymmetric dependent
  if (maxCross >= config.intrinsicAsymMax && signals.pivotCohesion >= config.intrinsicPivotMin) return true
  return false
}

class UnionFind {
  parent: Map<string, string> = new Map()
  rank: Map<string, number> = new Map()
  add (x: string) { if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0) } }
  find (x: string): string {
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!))
    return this.parent.get(x)!
  }
  union (a: string, b: string) {
    const ra = this.find(a), rb = this.find(b)
    if (ra === rb) return
    const rka = this.rank.get(ra)!, rkb = this.rank.get(rb)!
    if (rka < rkb) this.parent.set(ra, rb)
    else if (rka > rkb) this.parent.set(rb, ra)
    else { this.parent.set(rb, ra); this.rank.set(ra, rka + 1) }
  }
}

/** Find pairs of archetypes that share at least one support/member card. */
function findPotentialPartners (archetypes: Map<string, InferredArchetype>): Map<string, Set<string>> {
  const cardToArchs = new Map<number, Set<string>>()
  for (const [key, arch] of archetypes) {
    if (arch.status !== 'accepted') continue
    for (const id of [...arch.memberIds, ...arch.supportIds]) {
      if (!cardToArchs.has(id)) cardToArchs.set(id, new Set())
      cardToArchs.get(id)!.add(key)
    }
  }
  const partners = new Map<string, Set<string>>()
  for (const archKeys of cardToArchs.values()) {
    if (archKeys.size < 2) continue
    for (const a of archKeys) {
      for (const b of archKeys) {
        if (a >= b) continue
        if (!partners.has(a)) partners.set(a, new Set())
        if (!partners.has(b)) partners.set(b, new Set())
        partners.get(a)!.add(b)
        partners.get(b)!.add(a)
      }
    }
  }
  return partners
}

function buildIntrinsicClusters (
  archetypes: Map<string, InferredArchetype>,
  index: LabelIndex,
  config: PipelineConfig
): IntrinsicCluster[] {
  const accepted = [...archetypes.entries()].filter(([, a]) => a.status === 'accepted')
  const acceptedKeys = accepted.map(([k]) => k)
  const potential = findPotentialPartners(archetypes)

  const uf = new UnionFind()
  for (const k of acceptedKeys) uf.add(k)

  const allLinks: Array<{ a: string; b: string; signals: LinkSignals }> = []

  // Compute link signals only for potential partners
  for (let i = 0; i < acceptedKeys.length; i++) {
    const a = acceptedKeys[i]!
    const aPartners = potential.get(a)
    if (!aPartners) continue
    for (const b of aPartners) {
      if (a >= b) continue // avoid duplicate
      const signals = computeLinkSignals(a, b, archetypes, index, config)
      if (isIntrinsicLink(signals, config)) {
        uf.union(a, b)
        allLinks.push({ a, b, signals })
      }
    }
  }

  // Apply overrides
  for (const [oa, ob] of config.clusterOverrides) {
    const ka = normalizeKey(oa), kb = normalizeKey(ob)
    if (uf.parent.has(ka) && uf.parent.has(kb)) uf.union(ka, kb)
  }

  // Collect components
  const components = new Map<string, string[]>()
  for (const k of acceptedKeys) {
    const root = uf.find(k)
    if (!components.has(root)) components.set(root, [])
    components.get(root)!.push(k)
  }

  const clusters: IntrinsicCluster[] = []
  for (const keys of components.values()) {
    if (keys.length < 2) continue
    // Anti mega-cluster
    if (keys.length > config.maxClusterSize) continue

    // Head = archetype with most members
    const sorted = [...keys].sort((a, b) => {
      const ma = archetypes.get(a)?.memberIds.length ?? 0
      const mb = archetypes.get(b)?.memberIds.length ?? 0
      return mb - ma || a.localeCompare(b)
    })
    const headKey = sorted[0]!
    const headArch = archetypes.get(headKey)!
    const links = allLinks.filter(l => keys.includes(l.a) && keys.includes(l.b))

    clusters.push({
      id: headKey,
      headKey,
      archetypeKeys: sorted,
      links,
      labelDisplay: headArch.label,
      isHiding: true,
    })
  }

  return clusters
}

// ═══════════════════════════════════════════════════════════════════════
// §7  DISPLAY ENTITIES
// ═══════════════════════════════════════════════════════════════════════

function buildDisplayEntities (
  archetypes: Map<string, InferredArchetype>,
  clusters: IntrinsicCluster[],
): DisplayEntity[] {
  const entities: DisplayEntity[] = []
  const clusteredKeys = new Set<string>()

  // Cluster entities (hiding)
  for (const cluster of clusters) {
    for (const k of cluster.archetypeKeys) clusteredKeys.add(k)
    const memberIds = new Set<number>()
    const supportIds = new Set<number>()
    for (const k of cluster.archetypeKeys) {
      const a = archetypes.get(k)
      if (!a) continue
      for (const id of a.memberIds) memberIds.add(id)
      for (const id of a.supportIds) supportIds.add(id)
    }
    entities.push({
      entityId: cluster.id,
      entityType: 'cluster',
      labelDisplay: cluster.labelDisplay,
      memberCardIds: [...memberIds],
      supportCardIds: [...supportIds].filter(id => !memberIds.has(id)),
      representativeCardIds: [],
      representativeReasons: new Map(),
      containedArchetypes: cluster.archetypeKeys,
    })
  }

  // Singleton entities
  for (const [key, arch] of archetypes) {
    if (arch.status !== 'accepted') continue
    if (clusteredKeys.has(key)) continue
    entities.push({
      entityId: key,
      entityType: 'archetype',
      labelDisplay: arch.label,
      memberCardIds: [...arch.memberIds],
      supportCardIds: [...arch.supportIds],
      representativeCardIds: [],
      representativeReasons: new Map(),
      containedArchetypes: [key],
    })
  }

  return entities
}

// ═══════════════════════════════════════════════════════════════════════
// §8  REPRESENTATIVE CARD SCORING
// ═══════════════════════════════════════════════════════════════════════

function scoreCardImportance (
  cardId: number,
  entityLabels: Set<string>,
  entityMemberSet: Set<number>,
  index: LabelIndex,
  allCards: Map<number, CardData>,
  config: PipelineConfig
): { score: number; reasons: string[] } {
  const card = allCards.get(cardId)
  if (!card) return { score: 0, reasons: [] }
  const reasons: string[] = []
  let score = 0
  const descLower = card.desc.toLowerCase()
  const cardNameKey = normalizeKey(card.name)

  // R1 — Inbound mentions (how many other members cite this card's name)
  let inbound = 0
  for (const otherId of entityMemberSet) {
    if (otherId === cardId) continue
    const otherLabels = index.cardToLabels.get(otherId) ?? new Set()
    if (otherLabels.has(cardNameKey)) inbound++
  }
  score += inbound * config.repInboundWeight
  if (inbound >= 2) reasons.push(`inbound:${inbound}`)

  // R2 — Pivot PSCT (card has search/summon patterns for entity labels)
  let isPivot = false
  for (const label of entityLabels) {
    if (hasPivotPattern(descLower, label)) { isPivot = true; break }
  }
  if (isPivot) { score += config.repPivotWeight; reasons.push('pivot') }

  // R3 — Connectivity (mentions multiple entity labels)
  const cardLabels = index.cardToLabels.get(cardId) ?? new Set()
  let connectedLabels = 0
  for (const label of entityLabels) { if (cardLabels.has(label)) connectedLabels++ }
  score += connectedLabels * config.repConnectorWeight
  if (connectedLabels >= 2) reasons.push(`connector:${connectedLabels}`)

  // R4 — Boss heuristic (Extra Deck with archetype conditions)
  const ft = card.frameType.toLowerCase()
  const isExtra = ['fusion', 'synchro', 'xyz', 'link'].some(t => ft.includes(t))
  if (isExtra) {
    let hasCondition = false
    for (const label of entityLabels) {
      if (descLower.includes(`"${label}"`)) { hasCondition = true; break }
    }
    if (hasCondition) { score += config.repBossWeight; reasons.push('boss') }
  }

  // R5 — Anti-noise (generic card penalty)
  let mentionsAny = false
  for (const label of entityLabels) {
    if (cardLabels.has(label) || cardNameKey.includes(label)) { mentionsAny = true; break }
  }
  if (!mentionsAny) { score -= config.repGenericPenalty; reasons.push('generic_penalty') }

  return { score, reasons }
}

function pickRepresentativeCards (
  entity: DisplayEntity,
  index: LabelIndex,
  allCards: Map<number, CardData>,
  config: PipelineConfig
): { ids: number[]; reasons: Map<number, string[]> } {
  const entityLabels = new Set(entity.containedArchetypes)
  const memberSet = new Set(entity.memberCardIds)

  // Score only MONSTER cards (no spells/traps as representatives)
  const pool = [...new Set([...entity.memberCardIds, ...entity.supportCardIds])]
  const scored: Array<{ id: number; score: number; reasons: string[]; cat: string }> = []
  for (const id of pool) {
    const card = allCards.get(id)
    if (!card) continue
    const t = card.type.toLowerCase()
    if (t.includes('token') || t.includes('skill')) continue
    // Exclude spells and traps — representative cards must be monsters
    if (t.includes('spell') || t.includes('trap')) continue
    const { score, reasons } = scoreCardImportance(id, entityLabels, memberSet, index, allCards, config)
    const cat = reasons.includes('boss') ? 'boss' : reasons.includes('pivot') ? 'pivot' : 'other'
    scored.push({ id, score, reasons, cat })
  }
  scored.sort((a, b) => b.score - a.score)

  // Greedy diversification
  const selected: typeof scored = []
  const catCount = { boss: 0, pivot: 0, other: 0 }
  const topK = config.repTopK
  const usedIds = new Set<number>()

  function tryAdd (item: typeof scored[0]) {
    if (!item || usedIds.has(item.id) || selected.length >= topK) return false
    selected.push(item)
    usedIds.add(item.id)
    catCount[item.cat as keyof typeof catCount]++
    return true
  }

  // Ensure diversity minimums
  for (const item of scored) {
    if (item.cat === 'boss' && catCount.boss < config.repDiversityBoss) tryAdd(item)
    if (selected.length >= topK) break
  }
  for (const item of scored) {
    if (item.cat === 'pivot' && catCount.pivot < config.repDiversityPivot) tryAdd(item)
    if (selected.length >= topK) break
  }
  // Fill remaining with highest scores
  for (const item of scored) { tryAdd(item); if (selected.length >= topK) break }

  // For cluster entities: ensure sub-archetype coverage
  if (entity.entityType === 'cluster' && entity.containedArchetypes.length > 1) {
    const represented = new Set<string>()
    for (const item of selected) {
      const card = allCards.get(item.id)
      if (!card) continue
      for (const arch of entity.containedArchetypes) {
        if (normalizeKey(card.name).includes(arch) ||
            (index.cardToLabels.get(item.id) ?? new Set()).has(arch)) {
          represented.add(arch)
        }
      }
    }
    // If some sub-archetypes not represented, swap the weakest "other" card
    for (const arch of entity.containedArchetypes) {
      if (represented.has(arch)) continue
      const candidate = scored.find(s =>
        !usedIds.has(s.id) &&
        (normalizeKey(allCards.get(s.id)?.name ?? '').includes(arch) ||
          (index.cardToLabels.get(s.id) ?? new Set()).has(arch))
      )
      if (candidate && selected.length > 0) {
        // Replace weakest "other"
        const weakIdx = selected.length - 1
        if (weakIdx >= 0 && selected[weakIdx]) {
          usedIds.delete(selected[weakIdx]!.id)
          selected[weakIdx] = candidate
          usedIds.add(candidate.id)
        }
      }
    }
  }

  const reasons = new Map<number, string[]>()
  for (const item of selected) reasons.set(item.id, item.reasons)

  return { ids: selected.map(s => s.id), reasons }
}

// ═══════════════════════════════════════════════════════════════════════
// §9  PIPELINE
// ═══════════════════════════════════════════════════════════════════════

/**
 * An archetype must have enough MONSTER cards to be displayed.
 * Archetypes composed only of spells/traps (no monsters) are rejected.
 */
function hasEnoughCards (
  memberIds: number[],
  supportIds: number[],
  allCards: Map<number, CardData>,
  config: PipelineConfig
): boolean {
  const pool = [...new Set([...memberIds, ...supportIds])]
  const monsters = pool.filter(id => {
    const c = allCards.get(id)
    if (!c) return false
    const t = c.type.toLowerCase()
    if (t.includes('token') || t.includes('skill')) return false
    if (t.includes('spell') || t.includes('trap')) return false
    return true
  })
  return monsters.length >= config.minCardsForDisplay
}

function displayLabel (raw: string): string {
  const s = raw.trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function runPipeline (
  cards: CardData[],
  userConfig?: Partial<PipelineConfig>
): PipelineResult {
  const config: PipelineConfig = { ...DEFAULT_CONFIG, ...userConfig }
  const allCards = new Map(cards.map(c => [c.id, c]))
  const cardNames = new Map(cards.map(c => [c.id, normalizeKey(c.name)]))
  const issues: string[] = []

  // ── Step 0: external archetypes ──
  const externalArchetypes = new Set<string>()
  const externalToLabel = new Map<string, string>()
  for (const card of cards) {
    const ext = card.externalArchetype?.trim()
    if (ext) {
      const key = normalizeKey(ext)
      externalArchetypes.add(key)
      if (!externalToLabel.has(key)) externalToLabel.set(key, ext)
    }
  }

  // ── Step 1: label index ──
  const index = buildLabelIndex(cards)

  // ── Step 2: candidates ──
  const candidateKeys = new Set<string>()
  for (const key of index.labelToCards.keys()) candidateKeys.add(key)
  for (const key of externalArchetypes) candidateKeys.add(key)

  // ── Step 3-4: score, accept, derive members ──
  const archetypes = new Map<string, InferredArchetype>()
  let acceptedCount = 0, rejectedCount = 0, suspectCount = 0

  for (const key of candidateKeys) {
    const evidence = computeEvidence(key, index, cardNames, config)
    const isExternal = externalArchetypes.has(key)
    const { status, confidence, reasons } = decideAcceptance(key, evidence, isExternal, config)
    evidence.rejectionReasons = reasons

    if (status === 'rejected') { rejectedCount++; continue }
    if (status === 'suspect') { suspectCount++; continue }
    acceptedCount++

    const textLabel = index.labelDisplay.get(key)
    const extLabel = externalToLabel.get(key)
    const label = displayLabel(textLabel ?? extLabel ?? key)

    const { memberIds, supportIds } = deriveMembers(key, index, allCards, config)
    if (!hasEnoughCards(memberIds, supportIds, allCards, config)) {
      rejectedCount++
      issues.push(`${label}: accepted but too few displayable cards`)
      continue
    }

    archetypes.set(key, {
      label, key, confidenceScore: confidence, status,
      memberIds, supportIds, evidence,
    })
  }

  // ── Step 5-6: intrinsic clusters ──
  const clusters = buildIntrinsicClusters(archetypes, index, config)

  // ── Step 7: display entities ──
  const entities = buildDisplayEntities(archetypes, clusters)

  // ── Step 8: representative cards ──
  for (const entity of entities) {
    const { ids, reasons } = pickRepresentativeCards(entity, index, allCards, config)
    entity.representativeCardIds = ids
    entity.representativeReasons = reasons
  }

  // ── Step 9: final output ──
  const validNames: string[] = []
  const partnerMap: Record<string, string[]> = {}
  const representativeMap: Record<string, number[]> = {}

  for (const entity of entities) {
    validNames.push(entity.labelDisplay)
    representativeMap[entity.labelDisplay] = entity.representativeCardIds
    if (entity.entityType === 'cluster' && entity.containedArchetypes.length > 1) {
      // Partners = all archetype labels except the entity label itself
      const partners = entity.containedArchetypes
        .filter(k => k !== entity.entityId)
        .map(k => archetypes.get(k)?.label ?? k)
      if (partners.length > 0) partnerMap[entity.labelDisplay] = partners
    }
  }

  validNames.sort((a, b) => a.localeCompare(b))

  return {
    archetypes,
    clusters,
    displayEntities: entities,
    validNames,
    partnerMap,
    representativeMap,
    dashboard: {
      totalCards: cards.length,
      totalLabels: index.labelToCards.size,
      candidates: candidateKeys.size,
      accepted: acceptedCount,
      rejected: rejectedCount,
      suspect: suspectCount,
      clusters: clusters.length,
      entities: entities.length,
      issues,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════
// §10  HELPERS
// ═══════════════════════════════════════════════════════════════════════

export function ygoCardToCardData (card: YgoCard): CardData {
  return {
    id: card.id,
    name: (card.name_en ?? card.name).trim(),
    desc: card.desc ?? '',
    type: card.type ?? '',
    frameType: card.frameType ?? '',
    externalArchetype: card.archetype?.trim() ?? null,
  }
}
