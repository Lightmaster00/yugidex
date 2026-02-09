/** Espérance de victoire de A contre B. */
export function expectedScore (eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400))
}

/** Met à jour les Elo après un duel 1v1 : winner bat loser. */
export function applyElo (winnerElo: number, loserElo: number, K: number = 32): { newWinner: number, newLoser: number } {
  const eWinner = expectedScore(winnerElo, loserElo)
  const eLoser = expectedScore(loserElo, winnerElo)
  const newWinner = winnerElo + K * (1 - eWinner)
  const newLoser = loserElo + K * (0 - eLoser)
  return { newWinner: Math.round(newWinner), newLoser: Math.round(newLoser) }
}

/** Met à jour les Elo après un duel groupe (1 gagnant, N perdants). */
export function applyGroupElo (
  winnerElo: number,
  loserElos: number[],
  K: number
): { newWinner: number, newLosers: number[] } {
  let winnerDelta = 0
  const loserDeltas: number[] = []
  for (const loserElo of loserElos) {
    const eW = expectedScore(winnerElo, loserElo)
    winnerDelta += K * (1 - eW)
    loserDeltas.push(Math.round(-K * (1 - expectedScore(loserElo, winnerElo))))
  }
  return {
    newWinner: Math.round(winnerElo + winnerDelta),
    newLosers: loserElos.map((e, i) => e + loserDeltas[i]!)
  }
}
