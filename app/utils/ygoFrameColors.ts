/**
 * Yu-Gi-Oh! frame colors by type (TCG/OCG).
 * Reference: Yugipedia Card colors
 */
export type YgoFrameType =
  | 'normal'
  | 'effect'
  | 'ritual'
  | 'fusion'
  | 'synchro'
  | 'xyz'
  | 'link'
  | 'pendulum'
  | 'spell'
  | 'trap'

export interface FrameStyle {
  /** Couleur de fond du cadre (bandeau nom + bordure) */
  bg: string
  /** Couleur du texte du nom (noir ou blanc selon contraste) */
  nameColor: string
  /** Couleur fond zone description */
  descBg: string
  /** Couleur texte description */
  descColor: string
}

const FRAME_STYLES: Record<string, FrameStyle> = {
  normal: {
    bg: '#d4a84b',
    nameColor: '#0a0a0a',
    descBg: '#c9a035',
    descColor: '#0a0a0a'
  },
  effect: {
    bg: '#e68e22',
    nameColor: '#0a0a0a',
    descBg: '#d67a10',
    descColor: '#0a0a0a'
  },
  ritual: {
    bg: '#4a6db5',
    nameColor: '#ffffff',
    descBg: '#3d5d9e',
    descColor: '#ffffff'
  },
  fusion: {
    bg: '#a549a5',
    nameColor: '#ffffff',
    descBg: '#8e3d8e',
    descColor: '#ffffff'
  },
  synchro: {
    bg: '#e8e8e8',
    nameColor: '#0a0a0a',
    descBg: '#d0d0d0',
    descColor: '#1a1a1a'
  },
  xyz: {
    bg: '#2d2d2d',
    nameColor: '#ffffff',
    descBg: '#1a1a1a',
    descColor: '#e0e0e0'
  },
  link: {
    bg: '#1e5a9e',
    nameColor: '#ffffff',
    descBg: '#164a82',
    descColor: '#ffffff'
  },
  pendulum: {
    bg: '#1d9e74',
    nameColor: '#ffffff',
    descBg: '#178060',
    descColor: '#ffffff'
  },
  spell: {
    bg: '#1d9e74',
    nameColor: '#ffffff',
    descBg: '#178060',
    descColor: '#ffffff'
  },
  trap: {
    bg: '#bc5a84',
    nameColor: '#ffffff',
    descBg: '#9e4a6e',
    descColor: '#ffffff'
  }
}

const DEFAULT_FRAME: FrameStyle = FRAME_STYLES.effect!

export function getFrameStyle (frameType: string | undefined): FrameStyle {
  if (!frameType) return DEFAULT_FRAME
  const key = frameType.toLowerCase()
  return FRAME_STYLES[key] ?? DEFAULT_FRAME
}
