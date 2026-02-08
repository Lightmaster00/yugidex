import type { CardLanguage } from '~/composables/useYgoApi'

const translations: Record<string, Record<CardLanguage, string>> = {
  'start.brand': {
    en: 'Yu-Gi-Oh!',
    fr: 'Yu-Gi-Oh!',
    de: 'Yu-Gi-Oh!',
    it: 'Yu-Gi-Oh!',
    pt: 'Yu-Gi-Oh!'
  },
  'start.title': {
    en: 'Archetype\nTournament',
    fr: 'Tournoi\nd\'Archétypes',
    de: 'Archetyp\nTurnier',
    it: 'Torneo\ndi Archetipi',
    pt: 'Torneio\nde Arquétipos'
  },
  'start.tagline': {
    en: 'Choose your favorite archetype.\nDuel by duel.',
    fr: 'Choisissez votre archétype favori.\nDuel après duel.',
    de: 'Wähle deinen Lieblingsarchetyp.\nDuell für Duell.',
    it: 'Scegli il tuo archetipo preferito.\nDuello dopo duello.',
    pt: 'Escolha o seu arquétipo favorito.\nDuelo a duelo.'
  },
  'start.cta': {
    en: 'Start tournament',
    fr: 'Lancer le tournoi',
    de: 'Turnier starten',
    it: 'Inizia torneo',
    pt: 'Iniciar torneio'
  },
  'header.tournament': {
    en: 'Archetype Tournament',
    fr: 'Tournoi d\'Archétypes',
    de: 'Archetyp Turnier',
    it: 'Torneo di Archetipi',
    pt: 'Torneio de Arquétipos'
  },
  'loading.shuffle': {
    en: 'Shuffling deck…',
    fr: 'Mélange du deck…',
    de: 'Deck wird gemischt…',
    it: 'Mescolando il mazzo…',
    pt: 'Embaralhando o deck…'
  },
  'loading.prepare': {
    en: 'Preparing your duel',
    fr: 'Préparation du duel',
    de: 'Dein Duell wird vorbereitet',
    it: 'Preparazione del duello',
    pt: 'Preparando o duelo'
  },
  'loading.next': {
    en: 'Next duel…',
    fr: 'Prochain duel…',
    de: 'Nächstes Duell…',
    it: 'Prossimo duello…',
    pt: 'Próximo duelo…'
  },
  'phase1.badge': {
    en: 'Phase 1 — Elimination',
    fr: 'Phase 1 — Élimination',
    de: 'Phase 1 — Eliminierung',
    it: 'Fase 1 — Eliminazione',
    pt: 'Fase 1 — Eliminação'
  },
  'phase2.badge': {
    en: 'Phase 2 — Elo Ranking',
    fr: 'Phase 2 — Classement Elo',
    de: 'Phase 2 — Elo-Rangliste',
    it: 'Fase 2 — Classifica Elo',
    pt: 'Fase 2 — Ranking Elo'
  },
  'duel.instruction': {
    en: 'Tap the card',
    fr: 'Touchez la carte',
    de: 'Tippe auf die Karte',
    it: 'Tocca la carta',
    pt: 'Toque na carta'
  },
  'duel.instruction.suffix': {
    en: ' of the winner.',
    fr: ' du gagnant.',
    de: ' des Gewinners.',
    it: ' del vincitore.',
    pt: ' do vencedor.'
  },
  'btn.previous': {
    en: 'Previous',
    fr: 'Précédent',
    de: 'Zurück',
    it: 'Precedente',
    pt: 'Anterior'
  },
  'btn.reset': {
    en: 'Reset',
    fr: 'Réinitialiser',
    de: 'Zurücksetzen',
    it: 'Ripristina',
    pt: 'Reiniciar'
  },
  'btn.finish': {
    en: 'Finish tournament',
    fr: 'Terminer le tournoi',
    de: 'Turnier beenden',
    it: 'Termina torneo',
    pt: 'Finalizar torneio'
  },
  'btn.finishEarly': {
    en: 'Finish early',
    fr: 'Terminer plus tôt',
    de: 'Früher beenden',
    it: 'Termina prima',
    pt: 'Terminar mais cedo'
  },
  'roundProgress': {
    en: 'Choice',
    fr: 'Choix',
    de: 'Duell',
    it: 'Scelta',
    pt: 'Escolha'
  },
  'btn.changeCard': {
    en: 'Change card',
    fr: 'Changer de carte',
    de: 'Karte wechseln',
    it: 'Cambia carta',
    pt: 'Trocar carta'
  },
  'results.label': {
    en: 'Final Rankings',
    fr: 'Classement Final',
    de: 'Endergebnis',
    it: 'Classifica Finale',
    pt: 'Classificação Final'
  },
  'results.title': {
    en: 'Top 10',
    fr: 'Top 10',
    de: 'Top 10',
    it: 'Top 10',
    pt: 'Top 10'
  },
  'btn.downloadCsv': {
    en: 'Download CSV',
    fr: 'Télécharger CSV',
    de: 'CSV herunterladen',
    it: 'Scarica CSV',
    pt: 'Baixar CSV'
  },
  'btn.playAgain': {
    en: 'Play again',
    fr: 'Rejouer',
    de: 'Nochmal spielen',
    it: 'Gioca ancora',
    pt: 'Jogar novamente'
  },
  'round': {
    en: 'Round',
    fr: 'Tour',
    de: 'Runde',
    it: 'Round',
    pt: 'Rodada'
  },
  'swissRound': {
    en: 'Swiss round',
    fr: 'Tour suisse',
    de: 'Schweizer Runde',
    it: 'Round svizzero',
    pt: 'Rodada suíça'
  }
}

export function t (key: string, lang: CardLanguage): string {
  return translations[key]?.[lang] ?? translations[key]?.en ?? key
}
