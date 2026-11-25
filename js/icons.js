// ==========================================================================
// cash-map — Crisp Inline SVG Icon Library (Zero External Dependencies)
// ==========================================================================

const ICONS = {
  // Navigation & Core UI
  home: `<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6"/>`,
  list: `<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>`,
  map: `<path d="M3 12h4.5c2.2 0 3.2-6 6-6H21"/><path d="M3 12h18"/><path d="M3 12h4.5c2.2 0 3.2 6 6 6H21"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="19" cy="18" r="2"/>`,
  sliders: `<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2.2" fill="currentColor"/><circle cx="15" cy="12" r="2.2" fill="currentColor"/><circle cx="10" cy="18" r="2.2" fill="currentColor"/>`,
  plus: `<path d="M12 5v14"/><path d="M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  x: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  check: `<path d="M20 6 9 17l-5-5"/>`,
  chevronLeft: `<path d="m15 18-6-6 6-6"/>`,
  chevronRight: `<path d="m9 18 6-6-6-6"/>`,
  chevronUp: `<path d="m18 15-6-6-6 6"/>`,
  chevronDown: `<path d="m6 9 6 6 6-6"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>`,
  eye: `<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>`,
  eyeOff: `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.4 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.6 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>`,
  search: `<circle cx="11" cy="11" r="7.5"/><path d="m20 20-3.8-3.8"/>`,
  transfer: `<path d="m17 3 4 4-4 4"/><path d="M3 7h18"/><path d="m7 21-4-4 4-4"/><path d="M21 17H3"/>`,
  download: `<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>`,
  upload: `<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 19h16"/>`,
  share: `<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>`,
  copy: `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  trash: `<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`,
  edit: `<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>`,
  backspace: `<path d="M21 5H9l-7 7 7 7h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>`,
  calendar: `<rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
  zap: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
  sparkles: `<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
  moon: `<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>`,
  refresh: `<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>`,
  info: `<circle cx="12" cy="12" r="9.5"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8.2" r="0.6" fill="currentColor"/>`,
  arrowUpRight: `<path d="M7 17 17 7"/><path d="M7 7h10v10"/>`,
  arrowDownLeft: `<path d="M17 7 7 17"/><path d="M17 17H7V7"/>`,
  piggy: `<path d="M19 11c0-3.3-3.1-6-7-6-2.5 0-4.7 1.1-6 2.8L4 7.5 3 11l1.5 1.5c.3 1.3 1 2.4 2 3.2V19h2.5v-1.6c.9.3 1.9.4 3 .4s2.1-.1 3-.4V19H17v-3.2c1.2-1 2-2.7 2-4.8Z"/><path d="M19 10h2v3h-2"/><circle cx="8.5" cy="10" r="0.8" fill="currentColor"/>`,

  // Category Icons
  house: `<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9 21v-6h6v6"/>`,
  car: `<path d="M5 17H3.5A1.5 1.5 0 0 1 2 15.5V12l2.6-5.2A2 2 0 0 1 6.4 5.5h11.2a2 2 0 0 1 1.8 1.3L22 12v3.5a1.5 1.5 0 0 1-1.5 1.5H19"/><circle cx="7.5" cy="17" r="2.2"/><circle cx="16.5" cy="17" r="2.2"/><path d="M9.7 17h4.6"/><path d="M3.5 11.5h17"/>`,
  cart: `<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3.5h2.8l2.2 11a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.45-1.15L21 7H6.2"/>`,
  sauna: `<path d="M12 3c.5 2.5-2.5 3.8-2.5 6.3a3.5 3.5 0 0 0 7 0c0-2-1.2-3.5-2.2-4.8"/><path d="M6.5 15.5c-1.5.7-2.5 1.6-2.5 2.6 0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2c0-1-1-1.9-2.5-2.6"/><path d="M7 5.5c-.6 1.2-.6 2.3 0 3.5"/><path d="M17 5.5c-.6 1.2-.6 2.3 0 3.5"/>`,
  shirt: `<path d="M20.4 6 16 3.5a4 4 0 0 1-8 0L3.6 6 2 10.5l3.5 1.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8l3.5-1.5L20.4 6Z"/>`,
  shield: `<path d="M12 2.5 4 6v5.5c0 5.1 3.4 9.5 8 10.5 4.6-1 8-5.4 8-10.5V6l-8-3.5Z"/><path d="m9 12 2 2 4-4"/>`,
  dumbbell: `<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>`,
  smartphone: `<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><line x1="10.5" y1="18" x2="13.5" y2="18"/>`,
  cloud: `<path d="M17.5 19H7a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.7-1.2A4 4 0 0 1 17.5 19Z"/>`,
  trending: `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>`,
  lifebuoy: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.8"/><line x1="5.6" y1="5.6" x2="9.3" y2="9.3"/><line x1="14.7" y1="14.7" x2="18.4" y2="18.4"/><line x1="18.4" y1="5.6" x2="14.7" y2="9.3"/><line x1="9.3" y1="14.7" x2="5.6" y2="18.4"/>`,
  coffee: `<path d="M17 8h1.5a3 3 0 0 1 0 6H17"/><path d="M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z"/><line x1="7" y1="3" x2="7" y2="5"/><line x1="11" y1="3" x2="11" y2="5"/>`,
  plane: `<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z"/>`,
  heart: `<path d="M19.5 12.6 12 20l-7.5-7.4a5 5 0 0 1 7.5-6.5 5 5 0 0 1 7.5 6.5Z"/>`,
  gift: `<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>`,
  wallet: `<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><path d="M21 11h-5a2 2 0 0 0 0 4h5v-4Z"/>`,
  music: `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`,
  book: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>`,
  pet: `<circle cx="11" cy="5.5" r="2"/><circle cx="17" cy="7.5" r="2"/><circle cx="6.5" cy="9.5" r="2"/><circle cx="19.5" cy="12.5" r="1.8"/><path d="M12.5 10.5c-2.6 0-5.5 2.4-5.5 5.2 0 1.8 1.5 3.3 3.4 3.3 1.1 0 1.9-.5 2.6-.5s1.5.5 2.6.5c1.9 0 3.4-1.5 3.4-3.3 0-2.8-2.9-5.2-6.5-5.2Z"/>`,
  laptop: `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>`,
  wrench: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/>`,
};

export const CATEGORY_ICON_KEYS = [
  'house', 'cart', 'car', 'trending', 'shield', 'shirt', 'sauna',
  'dumbbell', 'smartphone', 'cloud', 'lifebuoy', 'coffee', 'plane',
  'heart', 'gift', 'wallet', 'music', 'book', 'pet', 'laptop', 'wrench'
];

export const CATEGORY_COLORS = [
  '#5B8CFF', // Sapphire
  '#10D99B', // Emerald
  '#F59E0B', // Amber
  '#F472B6', // Rose Pink
  '#A78BFA', // Violet
  '#2DD4BF', // Teal
  '#FB7185', // Coral
  '#38BDF8', // Sky
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#EC4899', // Magenta
];

export function icon(name, size = 20, className = '') {
  const inner = ICONS[name] || ICONS.wallet;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${className ? ` class="${className}"` : ''} aria-hidden="true">${inner}</svg>`;
}
