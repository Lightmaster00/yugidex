import type { CardLanguage } from '~/composables/useYgoApi'

/** All UI strings in English. Other languages fall back to English. */
const translations: Record<string, Partial<Record<CardLanguage, string>> & { en: string }> = {
  'start.brand': { en: 'Yu-Gi-Oh!' },
  'start.title': { en: 'ArcheDuel' },
  'start.tagline': { en: 'Choose your favorite archetype.\nDuel by duel.' },
  'start.cta': { en: 'Start tournament' },
  'header.tournament': { en: 'ArcheDuel' },
  'loading.shuffle': { en: 'Shuffling deck…' },
  'loading.prepare': { en: 'Preparing your duel' },
  'loading.next': { en: 'Next duel…' },
  'phase1.badge': { en: 'Phase 1 — Coverage' },
  'phase2.badge': { en: 'Phase 2 — Refinement' },
  'duel.instruction': { en: 'Tap the card' },
  'duel.instruction.suffix': { en: ' of the winner.' },
  'btn.previous': { en: 'Previous' },
  'btn.reset': { en: 'Reset' },
  'btn.finish': { en: 'Finish tournament' },
  'btn.finishEarly': { en: 'Finish early' },
  'roundProgress': { en: 'Choice' },
  'btn.changeCard': { en: 'Change card' },
  'results.label': { en: 'Final Rankings' },
  'results.title': { en: 'Top 10' },
  'btn.downloadCsv': { en: 'Download CSV' },
  'btn.playAgain': { en: 'Play again' },
  'round': { en: 'Round' },
  'swissRound': { en: 'Swiss round' },
  'phase3.badge': { en: 'Phase 3' },
  'cardCategory.extra': { en: 'Extra Deck' },
  'cardCategory.main': { en: 'Main Deck Monster' },
  'cardCategory.spell': { en: 'Spell' },
  'cardCategory.trap': { en: 'Trap' }
}

export function t (key: string, lang: CardLanguage): string {
  return translations[key]?.[lang] ?? translations[key]?.en ?? key
}
