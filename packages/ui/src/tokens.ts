// Design tokens from DESIGN.md and prototype/src/00-head.html, 00b-components.html, 00c-motion.html.
// Platform-neutral: the app kit and the admin console (CSS variables) both read this file.

export type ThemeName = 'sunflower' | 'palm' | 'plum' | 'night';
export const THEMES: ThemeName[] = ['sunflower', 'palm', 'plum', 'night'];

/** Colours that never change with the app theme. */
export const base = {
  night: '#1A1100',
  ink: '#111827',
  ink2: '#4B5563',
  ink3: '#6B7280',
  line: '#E5E7EB',
  surface: '#F3F4F6',
  white: '#FFFFFF',
  sun: '#F9C623',
  brown: '#6B3F1D',
  olive: '#5F6B3A',
  mauve: '#8B5E83',
  slate: '#263238',
  star: '#E8A600',
  ok: '#15803D',
  okT: '#DCFCE7',
  warn: '#B45309',
  warnT: '#FEF3C7',
  err: '#B91C1C',
  errT: '#FEE2E2',
  info: '#1D4ED8',
  infoT: '#DBEAFE',
  live: '#4ADE80',
  hlY: '#FDE68A',
  hlG: '#BBF7D0',
  hlB: '#BFDBFE',
  hlP: '#FBCFE8',
  /** Text on night pills, toasts and night chips' links. */
  nightOn: '#FFD9A8',
  /** Toggle off track, radio ring, sheet grab handle. */
  control: '#D1D5DB',
  /** Skeleton shimmer highlight. */
  shimmer: '#ECEEF1',
  // callout text tones
  infoInk: '#1E3A8A',
  warnInk: '#7A3B06',
  okInk: '#14532D',
  errInk: '#7F1D1D',
  /** Brand callout and end-card inner border. */
  brandLine: '#F6D7AE',
} as const;

export interface ThemeColors {
  /** Main colour: hero bands, main buttons, selections, active tab, focus. */
  org: string;
  orgRgb: string;
  /** Main-colour text on white. */
  orgInk: string;
  orgTint: string;
  orgTint2: string;
  /** Text and icons on the main colour. */
  onOrg: string;
  onOrgRgb: string;
  /** Accent: progress, rings, rank numbers, counts, unread dots. */
  acc: string;
  accOn: string;
  /** Sunflower petals on bands: rgba(petalRgb, a × petalK). */
  petalRgb: string;
  petalK: number;
  /** Small sun on light tiles. */
  sunRgb: string;
}

export const themes: Record<ThemeName, ThemeColors> = {
  sunflower: {
    org: '#F5931F', orgRgb: '245,147,31', orgInk: '#9A4F00', orgTint: '#FDEEDB', orgTint2: '#FFF6EA',
    onOrg: '#4A2600', onOrgRgb: '74,38,0', acc: '#5E7A35', accOn: '#FFFFFF',
    petalRgb: '255,214,90', petalK: 1, sunRgb: '122,143,62',
  },
  palm: {
    org: '#2F6B4F', orgRgb: '47,107,79', orgInk: '#2F6B4F', orgTint: '#E3F0E8', orgTint2: '#F3F8F5',
    onOrg: '#FFFFFF', onOrgRgb: '255,255,255', acc: '#E8902A', accOn: '#4A2600',
    petalRgb: '255,255,255', petalK: 0.42, sunRgb: '214,168,74',
  },
  plum: {
    org: '#6B4A8E', orgRgb: '107,74,142', orgInk: '#5E3F80', orgTint: '#EEE7F6', orgTint2: '#F8F4FB',
    onOrg: '#FFFFFF', onOrgRgb: '255,255,255', acc: '#E0A030', accOn: '#4A2600',
    petalRgb: '255,255,255', petalK: 0.42, sunRgb: '214,168,74',
  },
  night: {
    org: '#2A211A', orgRgb: '42,33,26', orgInk: '#9A4F00', orgTint: '#F1ECE6', orgTint2: '#F8F5F1',
    onOrg: '#FFF6EA', onOrgRgb: '255,246,234', acc: '#F5931F', accOn: '#4A2600',
    petalRgb: '245,147,31', petalK: 0.6, sunRgb: '217,139,43',
  },
};

export const themeMeta: Record<ThemeName, { label: string; feel: string }> = {
  sunflower: { label: 'Sunflower', feel: 'Bright orange with olive accents' },
  palm: { label: 'Palm', feel: 'Deep green with warm orange' },
  plum: { label: 'Plum', feel: 'Muted purple with marigold' },
  night: { label: 'Night', feel: 'Warm black with sunflower' },
};

export const rgba = (rgb: string, a: number) => `rgba(${rgb},${a})`;

/** Font families: display (Bricolage Grotesque), ui (Inter), reading (Literata). */
export type FontFamily = 'display' | 'ui' | 'reading';
export type FontWeight = 400 | 500 | 600 | 700 | 800;

export interface TypeStyle {
  family: FontFamily;
  weight: FontWeight;
  size: number;
  /** Unitless multiplier, as in CSS. */
  lineHeight: number;
  /** In em, as in CSS. */
  letterSpacing?: number;
  italic?: boolean;
}

/** Type scale from prototype/src/00b-components.html (.t-*). */
export const type = {
  display: { family: 'display', weight: 800, size: 34, lineHeight: 1, letterSpacing: -0.025 },
  h1: { family: 'display', weight: 800, size: 28, lineHeight: 1.05, letterSpacing: -0.02 },
  h2: { family: 'display', weight: 800, size: 22, lineHeight: 1.1, letterSpacing: -0.015 },
  h3: { family: 'display', weight: 800, size: 18, lineHeight: 1.2, letterSpacing: -0.01 },
  title: { family: 'ui', weight: 600, size: 15, lineHeight: 1.3 },
  body: { family: 'ui', weight: 400, size: 15, lineHeight: 1.5 },
  sm: { family: 'ui', weight: 400, size: 13.5, lineHeight: 1.45 },
  xs: { family: 'ui', weight: 400, size: 12, lineHeight: 1.4 },
  label: { family: 'ui', weight: 600, size: 13, lineHeight: 1.45 },
  reading: { family: 'reading', weight: 400, size: 15.5, lineHeight: 1.65 },
  /** Device default: 14px, line-height 1.45. */
  base: { family: 'ui', weight: 400, size: 14, lineHeight: 1.45 },
} as const satisfies Record<string, TypeStyle>;
export type TypeVariant = keyof typeof type;

/** 4-pt spacing scale; screen gutter 16; section rhythm 24. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, gutter: 16, section: 24 } as const;

export const radius = { chip: 8, input: 12, button: 12, buttonSm: 10, card: 14, sheet: 20, pill: 999 } as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  fill: 700,
  /** ease-out-quint: everything that arrives or responds. */
  ease: [0.22, 1, 0.36, 1] as const,
  /** in-out: things that move across the screen. */
  easeIO: [0.65, 0, 0.35, 1] as const,
  rise: 8,
  stagger: 45,
  /** One turn of the sunflower petals. */
  drift: 140_000,
  shimmer: 1_400,
  press: { button: 0.97, icon: 0.9, row: 0.99, cover: 0.96, tab: 0.94 },
} as const;

/** Admin console motion (DESIGN.md: calmer, slightly faster arrivals). */
export const motionAdmin = { ...motion, slow: 280, fill: 600, rise: 6, stagger: 40 } as const;

export const z = { content: 0, sticky: 10, tabbar: 20, backdrop: 30, sheet: 40, toast: 50 } as const;

/** Sample cover gradients from the prototype (.cv.c1–c8): [from, to, angle in deg, text colour]. */
export const covers = {
  c1: ['#C9772B', '#7A2E14', 160, '#FFFFFF'],
  c2: ['#1F4D3F', '#0E2620', 170, '#FFFFFF'],
  c3: ['#F4EFE6', '#E3DACB', 165, '#8E1111'],
  c4: ['#30386E', '#141836', 170, '#FFFFFF'],
  c5: ['#8C2D4B', '#3F0F22', 160, '#FFFFFF'],
  c6: ['#D9A21B', '#8A5A08', 170, '#FFFFFF'],
  c7: ['#0F766E', '#134E4A', 165, '#FFFFFF'],
  c8: ['#4B2A6B', '#1E1030', 160, '#FFFFFF'],
} as const;
export type CoverTone = keyof typeof covers;

/** Avatar backgrounds (.av.m/.o/.b/.t/.r/.k/.n/.g). */
export const avatarTones = {
  m: base.mauve, o: base.olive, b: base.brown, t: '#1F6F78', r: '#A23B2A', k: '#3F4A8A', n: base.night, g: '#C26A12',
} as const;
export type AvatarTone = keyof typeof avatarTones;
