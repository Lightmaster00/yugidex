import type { PersonalRankingState, Vote } from '~/types/ranking'

const STORAGE_KEY = 'yugidex-ranking'

function uuid (): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/x/g, () =>
    ((Math.random() * 16) | 0).toString(16)
  )
}

/** Returns a persistent userId (created once locally). */
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

/** Loads personal ranking state (votes). */
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

/** Saves a vote (A preferred over B) and persists. */
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
