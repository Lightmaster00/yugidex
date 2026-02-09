import type { PersonalRankingState, Vote } from '~/types/ranking'
import { INITIAL_ELO } from '~/types/tournament'
import { applyElo } from '~/utils/elo'

const STORAGE_KEY = 'yugidex-ranking'
const K = 32

function uuid (): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/x/g, () =>
    ((Math.random() * 16) | 0).toString(16)
  )
}

/** Retourne un userId persistant (créé une fois en local). */
export function getOrCreateUserId (): string {
  if (import.meta.server) return ''
  try {
    let data: PersonalRankingState | null = null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      data = JSON.parse(raw) as PersonalRankingState
      if (data?.userId) return data.userId
    }
    const userId = uuid()
    const state: PersonalRankingState = { userId, votes: data?.votes ?? [] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return userId
  } catch {
    return uuid()
  }
}

/** Charge l’état du classement personnel (votes). */
export function loadPersonalRanking (): PersonalRankingState | null {
  if (import.meta.server) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PersonalRankingState
    if (!data?.userId) {
      data.userId = uuid()
    }
    if (!Array.isArray(data.votes)) data.votes = []
    return data
  } catch {
    return null
  }
}

/** Enregistre un vote (A préféré à B) et persiste. */
export function saveVote (winnerId: string, loserId: string): void {
  if (import.meta.server) return
  const state = loadPersonalRanking()
  if (!state) return
  const vote: Vote = {
    winnerId,
    loserId,
    timestamp: new Date().toISOString()
  }
  state.votes = [...state.votes, vote]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

/** Recalcule les ratings (Elo) à partir de l’historique des votes. */
export function getRatingsFromVotes (
  votes: Vote[],
  knownArchetypeIds?: Set<string>
): Record<string, number> {
  const ratings: Record<string, number> = {}
  const allIds = new Set<string>(knownArchetypeIds)
  for (const v of votes) {
    allIds.add(v.winnerId)
    allIds.add(v.loserId)
  }
  for (const id of allIds) {
    ratings[id] = INITIAL_ELO
  }
  for (const v of votes) {
    const winnerElo = ratings[v.winnerId] ?? INITIAL_ELO
    const loserElo = ratings[v.loserId] ?? INITIAL_ELO
    const { newWinner, newLoser } = applyElo(winnerElo, loserElo, K)
    ratings[v.winnerId] = newWinner
    ratings[v.loserId] = newLoser
  }
  return ratings
}
