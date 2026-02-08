import { INITIAL_ELO, K_FACTOR } from '~/types/tournament'

/** Espérance de victoire de A contre B. */
export function expectedScore (eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400))
}

/** Met à jour les Elo après un duel 1v1 : winner bat loser. */
export function applyElo (winnerElo: number, loserElo: number): { newWinner: number, newLoser: number } {
  const eWinner = expectedScore(winnerElo, loserElo)
  const eLoser = expectedScore(loserElo, winnerElo)
  const newWinner = winnerElo + K_FACTOR * (1 - eWinner)
  const newLoser = loserElo + K_FACTOR * (0 - eLoser)
  return { newWinner: Math.round(newWinner), newLoser: Math.round(newLoser) }
}

export { INITIAL_ELO, K_FACTOR }
