import type { TournamentState } from '~/types/tournament'

/** Top 10 par Elo décroissant. En mode duels fixe : uniquement les archétypes ayant joué au moins 1 match. */
export function getTop10 (state: TournamentState): Array<{
  rank: number
  name: string
  elo: number
  wins: number
  losses: number
  matchesPlayed: number
}> {
  const names =
    state.phase2Threshold === 0
      ? state.remainingNames
      : state.remainingNames.filter(n => !state.archetypes[n]?.eliminated)

  const list = names
    .map(n => ({ name: n, ...state.archetypes[n] }))
    .filter(a => a.elo != null)
    .filter(a => ((a.wins ?? 0) + (a.losses ?? 0)) >= 1)
    .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
    .slice(0, 10)

  return list.map((a, i) => ({
    rank: i + 1,
    name: a.name,
    elo: a.elo ?? 0,
    wins: a.wins ?? 0,
    losses: a.losses ?? 0,
    matchesPlayed: (a.wins ?? 0) + (a.losses ?? 0)
  }))
}

const CSV_HEADERS =
  'Rank,Archetype,Elo,Wins,Losses,Matches Played'

function escapeCsv (s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Génère le CSV UTF-8 du Top 10. */
export function exportTop10Csv (state: TournamentState): string {
  const top = getTop10(state)
  const rows = [CSV_HEADERS, ...top.map(
    r =>
      `${r.rank},${escapeCsv(r.name)},${r.elo},${r.wins},${r.losses},${r.matchesPlayed}`
  )]
  return '\uFEFF' + rows.join('\r\n')
}

/** Déclenche le téléchargement du fichier CSV. */
export function downloadTop10Csv (state: TournamentState): void {
  const csv = exportTop10Csv(state)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `yugidex-top10-${state.runId.slice(0, 8)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
