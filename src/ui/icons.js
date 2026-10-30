// The icon set: hand-drawn SVG on a 24 x 24 grid, stroke based, so one theme variable set changes the
// whole family (stroke width, cap and join come from CSS: --ico-w, --ico-cap, --ico-join).
// Data files name icons by id or by a legacy emoji / unicode symbol; `ico()` resolves both to SVG, so the UI
// never renders an emoji (they differ per platform and cannot be themed). Unknown symbols fall back to a spark.
const F = 'fill="currentColor" stroke="none"'; // solid parts

const P = {
  // ---- menu and status
  dice: `<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" ${F}/><circle cx="15" cy="15" r="1.2" ${F}/><circle cx="12" cy="12" r="1.2" ${F}/><circle cx="15" cy="9" r="1.2" ${F}/><circle cx="9" cy="15" r="1.2" ${F}/>`,
  backpack: `<path d="M7 9a5 5 0 0 1 10 0v10a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19z"/><path d="M10 5V4a2 2 0 0 1 4 0v1M9 15h6M9 12h6"/>`,
  base: `<rect x="4" y="4" width="16" height="16"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>`,
  cart: `<path d="M3 4h2.5l2.4 11h9.7l2-8H6.5"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>`,
  gift: `<rect x="4" y="11" width="16" height="9"/><rect x="3" y="8" width="18" height="3"/><path d="M12 8v12M12 8c-3-4-6-3-5 0M12 8c3-4 6-3 5 0"/>`,
  swords: `<path d="M5 19L18 6M18 6V3h3v3h-3M6 14l4 4M3 21l3-3"/><path d="M19 19L6 6M6 6V3H3v3h3M18 14l-4 4M21 21l-3-3"/>`,
  flask: `<path d="M9 3h6M10 3v6L4.8 18.2A1.5 1.5 0 0 0 6.1 21h11.8a1.5 1.5 0 0 0 1.3-2.8L14 9V3"/><path d="M7.5 15h9"/>`,
  cycle: `<path d="M20 11a8 8 0 0 0-14.3-4M4 5v4h4M4 13a8 8 0 0 0 14.3 4M20 19v-4h-4"/>`,
  book: `<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h12M9 8h6"/>`,
  help: `<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9"/><circle cx="12" cy="17" r=".9" ${F}/>`,
  gear: `<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>`,
  coin: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.2"/><path d="M12 9v6M10.2 10.6h3.1M10.2 13.4h3.4"/>`,
  bolt: `<path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z"/>`,
  star: `<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1-5.4-3-5.4 3 1.1-6.1-4.5-4.3 6.1-.8z"/>`,
  clover: `<circle cx="12" cy="7.3" r="3.3"/><circle cx="12" cy="16.7" r="3.3"/><circle cx="7.3" cy="12" r="3.3"/><circle cx="16.7" cy="12" r="3.3"/><path d="M12 12l3 8.5"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="3.8" ry="9"/><path d="M3 12h18M4.2 7.5h15.6M4.2 16.5h15.6"/>`,
  gauge: `<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l4.2-5.2M12 8.5V10M6.5 11l1 .9M17.5 11l-1 .9"/><circle cx="12" cy="17" r="1.2" ${F}/>`,
  pulse: `<path d="M2 12h4.5l2-6 4 12 2.5-6H22"/>`,
  lock: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="16" r="1.2" ${F}/>`,
  check: `<path d="M4 12.5l5 5L20 6.5"/>`,
  cross: `<path d="M5 5l14 14M19 5L5 19"/>`,
  warning: `<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v5"/><circle cx="12" cy="17.6" r=".9" ${F}/>`,
  undo: `<path d="M9 5L4 10l5 5"/><path d="M4 10h9a6 6 0 0 1 0 11h-3"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l6 6"/>`,
  trophy: `<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 3 3M16 6h4v1a3 3 0 0 1-3 3M12 13v4M8 21h8M10 17h4"/>`,
  calendar: `<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M8 3v4M16 3v4"/>`,
  scroll: `<path d="M7 4h11v13a3 3 0 0 1-3 3H5a3 3 0 0 0 3-3z"/><path d="M7 4a3 3 0 0 0-3 3v1h3M11 9h4M11 13h4"/>`,
  box: `<path d="M12 3l8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>`,
  chest: `<path d="M4 10a8 6 0 0 1 16 0v9H4z"/><path d="M4 12h16M12 11v4"/>`,
  ticket: `<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M10 7v10" stroke-dasharray="1.5 2"/>`,
  tag: `<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3" ${F}/>`,
  shield: `<path d="M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6z"/>`,
  sparkle: `<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18 16v4M16 18h4"/>`,
  arrowUp: `<path d="M12 20V5M6 11l6-6 6 6"/>`,
  arrowRight: `<path d="M4 12h16M14 6l6 6-6 6"/>`,
  times: `<path d="M6 6l12 12M18 6L6 18"/>`,
  fast: `<path d="M4 6l7 6-7 6zM13 6l7 6-7 6z"/>`,
  timer: `<circle cx="12" cy="13.500" r="7.500"/><path d="M12 13.500V9M9.500 3h5M12 3v3M18.500 6.500l1.200-1.200"/>`,
  hand: `<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6M11 10V4a1.5 1.5 0 0 1 3 0v7M14 10V6a1.5 1.5 0 0 1 3 0v8c0 4-2 6-5 6-3 0-4-2-5-4l-2-4a1.5 1.5 0 0 1 3-1z"/>`,
  // ---- item shapes (also used by templates through their `shape`)
  drill: `<path d="M4 9c3-5 12-6 16-1"/><path d="M12 6.4L8 21"/><path d="M4 9l2 1M20 8l-2 1.5"/>`,
  pump: `<ellipse cx="12" cy="6" rx="6" ry="2.5"/><path d="M6 6v11c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6M18 10h3v4"/><path d="M9 12v3M12 12v3M15 12v3"/>`,
  forge: `<path d="M3 7h13l5 4h-5c0 3-2.5 4.5-5 5v3h5v2H6v-2h5v-3C8 15 6.5 13 6.5 11H3z"/>`,
  vat: `<path d="M8 3.5h8M9 3.5v4L6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8l-3-3.5v-4"/><path d="M6.5 14c2-1.5 3 1.5 5.5 0s3.500 1.500 5.500 0"/>`,
  mine: `<path d="M3 20l4-9 3 4 3-9 3 7 3-3 2 10z"/><path d="M10 15l2 5M13 12l-1 8"/>`,
  belt: `<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8 12h2.500l-1-1.200M8 12l1.500 1.200M14 12h2.500l-1-1.200M14 12l1.500 1.200"/>`,
  ring: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><path d="M12 3.500v4M12 16.500v4M3.500 12h4M16.500 12h4"/>`,
  prism: `<path d="M12 3l8.500 15h-17z"/><path d="M12 3v15M2 11l6.500 2.500M15.500 13.500L22 11"/>`,
  furnace: `<rect x="4" y="9" width="16" height="12" rx="1.500"/><path d="M8 9V4h8v5"/><path d="M12 19c-2 0-3-1.300-3-3 0-1.400 1.500-2 1.500-3.500 1.500 1 3 2 3 3.700 0 1.500-.5 2.800-1.500 2.800z"/>`,
  stall: `<path d="M3 9l2-5h14l2 5"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v8h14v-8"/><path d="M9 20v-5h6v5"/>`,
  tuner: `<path d="M6 4v16M12 4v16M18 4v16"/><rect x="4" y="7" width="4" height="3" ${F}/><rect x="10" y="13" width="4" height="3" ${F}/><rect x="16" y="9" width="4" height="3" ${F}/>`,
  dynamo: `<circle cx="12" cy="12" r="8.500"/><path d="M13 6.500L8.500 12.500h3l-.5 5 4.500-6h-3z"/>`,
  shrine: `<path d="M3 21h18M5 21V11M19 21V11M9 21v-6M15 21v-6M2.500 11L12 4l9.500 7z"/>`,
  turret: `<rect x="5" y="14" width="14" height="6" rx="1.500"/><circle cx="12" cy="12" r="4"/><path d="M14.500 10L21 5.500M12 8V5"/>`,
  tower: `<path d="M8 21V9L6 4h12l-2 5v12z"/><path d="M9 9h6M10.500 13h3M10.500 17h3"/>`,
  weapon: `<path d="M3 10h14l2-2h2v5h-6l-1 5.500H9L10 13H3z"/>`,
  sword: `<path d="M5 19L19 5M19 5v5M19 5h-5M8 16l-3 1-1 3 3-1M7 14l3 3"/>`,
  wand: `<path d="M4 20L16 8M15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 12l.7 1.300 1.300.7-1.300.7L19 16l-.7-1.300-1.300-.7 1.300-.7z"/>`,
  flame: `<path d="M12 3c1 4 5.500 5.500 5.500 10.500a5.500 5.500 0 0 1-11 0c0-2 1-3.500 2.500-4.500 0 2 1 3 2 3C11.500 9 10.500 6.500 12 3z"/>`,
  snow: `<path d="M12 3v18M4.500 7.500l15 9M19.500 7.500l-15 9"/><path d="M10 4.500l2 1.500 2-1.500M10 19.500L12 18l2 1.500"/>`,
  burst: `<path d="M12 2.500l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z"/>`,
  // ---- mutations and generic glyphs
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>`,
  rainbow: `<path d="M3 18a9 9 0 0 1 18 0M6.500 18a5.500 5.500 0 0 1 11 0M10 18a2 2 0 0 1 4 0"/>`,
  galaxy: `<path d="M12 12m-1.500 0a1.500 1.500 0 1 1 3 0 3.500 3.500 0 1 1-7 0 5.500 5.500 0 1 1 11 0 7.500 7.500 0 1 1-15 0"/>`,
  crown: `<path d="M3 18l2-10 5 5 2-7 2 7 5-5 2 10z"/><path d="M3 21h18"/>`,
  skull: `<path d="M5 11a7 7 0 0 1 14 0c0 2-1 3.500-2.500 4.500V19h-9v-3.500C6 14.500 5 13 5 11z"/><circle cx="9" cy="11" r="1.500" ${F}/><circle cx="15" cy="11" r="1.500" ${F}/><path d="M10.500 19v-2M13.500 19v-2"/>`,
  wind: `<path d="M3 8h11a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M3 18h8"/>`,
  medal: `<circle cx="12" cy="15" r="5.500"/><path d="M8.500 3.500L11 10.500M15.500 3.500L13 10.500M12 12.500v5M10 14.500h4"/>`,
  gem: `<path d="M6 4h12l4 5-10 12L2 9z"/><path d="M2 9h20M9 4l-1.500 5L12 21l4.500-12L15 4"/>`,
  atom: `<circle cx="12" cy="12" r="1.600" ${F}/><ellipse cx="12" cy="12" rx="9" ry="3.800"/><ellipse cx="12" cy="12" rx="9" ry="3.800" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.800" transform="rotate(120 12 12)"/>`,
  fleur: `<path d="M12 21V8M12 8c-4-1-5-5-3-6 1 2 3 2 3 4M12 8c4-1 5-5 3-6-1 2-3 2-3 4M8 14c-3 1-5-1-4-4 2 1 4 0 8 4M16 14c3 1 5-1 4-4-2 1-4 0-8 4"/>`,
  spiral: `<path d="M12 12a1.500 1.500 0 1 1 3 0 4 4 0 1 1-8 0 6.500 6.500 0 1 1 13 0"/>`,
  orb: `<circle cx="12" cy="12" r="8.500"/><path d="M6.500 9a7 7 0 0 1 4-3.200"/><circle cx="12" cy="12" r="3" ${F}/>`,
  helix: `<path d="M7 3c10 4 0 14 10 18M17 3C7 7 17 17 7 21M8 8h8M8 16h8"/>`,
  eye: `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
  planet: `<circle cx="12" cy="12" r="5.500"/><path d="M3 15c-1-3 4-7 12-9.500M21 9c1 3-4 7-12 9.500"/>`,
  diamond: `<path d="M12 2.500l7.500 9.500-7.500 9.500L4.500 12z"/>`,
  comet: `<circle cx="16.500" cy="7.500" r="3.500"/><path d="M14 10L3 21M12 6L4 14M18 12l-8 8"/>`,
  crystal: `<path d="M12 2.500l5 6-2 13h-6l-2-13z"/><path d="M7 8.500h10M12 2.500v19"/>`,
  // ---- monsters
  bow: `<path d="M6 3c8 3 8 15 0 18M6 3v18M6 12h14M16 9l4 3-4 3"/>`,
  fang: `<path d="M3 8c3-3 15-3 18 0v3L18 8l-2 5-2-5-2 6-2-6-2 5-2-5-3 3z"/><circle cx="8" cy="15" r="1.100" ${F}/><circle cx="16" cy="15" r="1.100" ${F}/>`,
  mask: `<path d="M5 4L3 9l3 1v5a6 6 0 0 0 12 0v-5l3-1-2-5-3 3H8z"/><circle cx="9.500" cy="12" r="1.200" ${F}/><circle cx="14.500" cy="12" r="1.200" ${F}/><path d="M10 16.500h4"/>`,
  golem: `<rect x="6" y="3" width="12" height="9" rx="1"/><rect x="3" y="13" width="18" height="8" rx="1"/><circle cx="9.500" cy="7.500" r="1.100" ${F}/><circle cx="14.500" cy="7.500" r="1.100" ${F}/>`,
  bat: `<path d="M12 8l-2-4v5L3 6c1 4 2 7 5 8l4 3 4-3c3-1 4-4 5-8l-7 3V4z"/>`,
  wizard: `<path d="M12 2.500l5.500 15h-11z"/><path d="M3 20h18M9.500 12h5"/>`,
  creature1: `<circle cx="12" cy="13" r="6.500"/><path d="M7 8L4 3M17 8l3-5"/><circle cx="9.500" cy="12" r="1.200" ${F}/><circle cx="14.500" cy="12" r="1.200" ${F}/><path d="M9.500 16c1.500 1 3.500 1 5 0"/>`,
  creature2: `<circle cx="12" cy="9" r="5.500"/><path d="M6 14c-2 3-2 5-1 7M10 15c-1 3-1 5 0 6M14 15c1 3 1 5 0 6M18 14c2 3 2 5 1 7"/><circle cx="10" cy="8.500" r="1.100" ${F}/><circle cx="14" cy="8.500" r="1.100" ${F}/>`,
  creature3: `<circle cx="12" cy="12" r="4"/><path d="M8 9L3 5M8 15l-5 4M16 9l5-4M16 15l5 4M12 8V3M12 16v5"/><circle cx="11" cy="11" r=".9" ${F}/><circle cx="13" cy="11" r=".9" ${F}/>`,
  creature4: `<path d="M4 20c0-8 3-14 8-14s8 6 8 14z"/><path d="M8 6L5 2M16 6l3-4"/><circle cx="9.500" cy="12" r="1.200" ${F}/><circle cx="14.500" cy="12" r="1.200" ${F}/><path d="M8 17h8"/>`,
  // ---- themes
  factory: `<path d="M3 21V11l6 4v-4l6 4V6h3v15z"/><path d="M6 21v-3M11 21v-3M16 21v-3"/>`,
  alien: `<path d="M12 3c5 0 8 4 8 8 0 5-4 9-8 10-4-1-8-5-8-10 0-4 3-8 8-8z"/><path d="M6.500 11c2-1 3 0 4 2M17.500 11c-2-1-3 0-4 2"/>`,
  rocket: `<path d="M12 2.500c4 2 6 7 5 13H7c-1-6 1-11 5-13z"/><circle cx="12" cy="9.500" r="1.800"/><path d="M7 15.500L4 19l3.500-.5M17 15.500l3 3.500-3.500-.5M10 18.500l2 3 2-3"/>`,
  robot: `<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M10 4h4M2.500 13h2.500M19 13h2.500"/><circle cx="9.500" cy="12.500" r="1.500"/><circle cx="14.500" cy="12.500" r="1.500"/><path d="M9.500 16.500h5"/>`,
};

// Tier / rarity symbols drawn as SVG shapes (solid, so they read at 14 px)
const R = {
  '●': '<circle cx="12" cy="12" r="7" />',
  '◆': '<path d="M12 3l8 9-8 9-8-9z"/>',
  '▲': '<path d="M12 3l9 17H3z"/>',
  '★': '<path d="M12 2.500l2.900 6.100 6.600.8-4.900 4.600 1.300 6.600L12 17.300 6.100 20.600l1.300-6.600L2.500 9.400l6.600-.8z"/>',
  '✦': '<path d="M12 2c1 5.500 4.500 9 10 10-5.500 1-9 4.500-10 10-1-5.500-4.500-9-10-10 5.500-1 9-4.500 10-10z"/>',
  '✪': '<circle cx="12" cy="12" r="9.500" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6l1.700 3.600 3.900.5-2.900 2.700.8 3.900L12 14.800 8.500 16.700l.8-3.900-2.900-2.700 3.900-.5z"/>',
  '❖': '<path d="M12 2l4 4-4 4-4-4zM2 12l4-4 4 4-4 4zM14 12l4-4 4 4-4 4zM12 14l4 4-4 4-4-4z"/>',
  '✹': '<path d="M12 1.500l2.200 6.300 6.300-2.300-2.300 6.300 6.300 2.200-6.300 2.200 2.300 6.300-6.300-2.300L12 22.500l-2.200-6.300-6.300 2.300 2.300-6.300L1.500 12l6.300-2.200-2.300-6.300 6.300 2.300z"/>',
  '☄': '<circle cx="16.500" cy="7.500" r="4.500"/><path d="M13.500 10.500L2.500 21.500M11 5.500L3 13.500M18.500 13l-8 8" fill="none" stroke="currentColor" stroke-width="2"/>',
  '♾': '<path d="M12 12c-2-3-4-4.500-6.500-4.500a4.500 4.500 0 0 0 0 9C8 16.500 10 15 12 12s4-4.500 6.500-4.500a4.500 4.500 0 0 1 0 9C16 16.500 14 15 12 12z" fill="none" stroke="currentColor" stroke-width="2.400"/>',
  '∞': '<path d="M12 12c-2-3-4-4.500-6.500-4.500a4.500 4.500 0 0 0 0 9C8 16.500 10 15 12 12s4-4.500 6.500-4.500a4.500 4.500 0 0 1 0 9C16 16.500 14 15 12 12z" fill="none" stroke="currentColor" stroke-width="2.400"/>',
  'Ω': '<path d="M5 20h5v-2.500C7 16 5 13.500 5 10.500a7 7 0 0 1 14 0c0 3-2 5.500-5 7V20h5" fill="none" stroke="currentColor" stroke-width="2.400"/>',
  '⬢': '<path d="M12 2.500l8.500 4.800v9.400L12 21.500l-8.500-4.800V7.300z"/>',
  '⬣': '<path d="M12 2.500l8.500 4.800v9.400L12 21.500l-8.500-4.800V7.300z" fill="none" stroke="currentColor" stroke-width="2.400"/><circle cx="12" cy="12" r="2.600"/>',
  '✺': '<path d="M12 2l1.600 5.400L18 4l-1.800 5.200L22 10l-5 3.200L20.500 18l-5.600-1.500L13.500 22 12 17l-1.500 5-1.400-5.500L3.500 18 7 13.200 2 10l5.800-.8L6 4l4.400 3.400z"/>',
  '❂': '<circle cx="12" cy="12" r="4.500"/><circle cx="12" cy="12" r="8.500" fill="none" stroke="currentColor" stroke-width="2"/>',
  '⌘': '<path d="M9 9V6.500A2.500 2.500 0 1 0 6.500 9H9zm0 0h6m-6 0v6m6-6V6.500A2.500 2.500 0 1 1 17.500 9H15zm0 0v6m0 0h2.500a2.500 2.500 0 1 1-2.500 2.500V15zm0 0H9m0 0H6.500A2.500 2.500 0 1 0 9 17.500V15z" fill="none" stroke="currentColor" stroke-width="2"/>',
  '☸': '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4" stroke="currentColor" stroke-width="1.600"/>',
  '⚝': '<path d="M12 2.500l2.900 6.100 6.600.8-4.900 4.600 1.300 6.600L12 17.300 6.100 20.600l1.300-6.600L2.500 9.400l6.600-.8z" fill="none" stroke="currentColor" stroke-width="2.200"/>',
  '✵': '<path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4.300 4.300M14.700 14.700L19 19M19 5l-4.300 4.300M9.300 14.700L5 19" stroke="currentColor" stroke-width="2.600" stroke-linecap="round"/><circle cx="12" cy="12" r="2.500"/>',
};

// Legacy emoji / symbols used as ids in data files -> icon ids. (The UI never shows the emoji itself.)
const MAP = {
  '🎲': 'dice', '🎒': 'backpack', '🏗': 'base', '🛒': 'cart', '🎁': 'gift', '⚔': 'swords', '⚗': 'flask', '🔄': 'cycle', '⚙': 'gear', '💰': 'coin', '🪙': 'coin', '💵': 'coin',
  '⚡': 'bolt', '🌟': 'star', '⭐': 'star', '🍀': 'clover', '🗺': 'globe', '🔒': 'lock', '✔': 'check', '✕': 'cross', '✖': 'times', '⚠': 'warning', '🏆': 'trophy', '🏅': 'medal',
  '📅': 'calendar', '📜': 'scroll', '📚': 'book', '📖': 'book', '📦': 'box', '🧰': 'chest', '🎟': 'ticket', '🏷': 'tag', '🛡': 'shield', '🎽': 'shield', '✨': 'sparkle', '🧩': 'gear',
  '➡': 'arrowRight', '⬆': 'arrowUp', '📈': 'arrowUp', '✋': 'hand', '💡': 'bolt', '❔': 'help', '🏛': 'shrine', '🤝': 'hand', '🕊': 'wind', '🧱': 'golem', '🏟': 'base',
  '⛏': 'drill', '🛢': 'pump', '🔨': 'forge', '🔧': 'forge', '🧪': 'vat', '🕳': 'mine', '🚄': 'belt', '🔷': 'prism', '🌩': 'dynamo', '🏪': 'stall', '🏬': 'stall', '🎯': 'turret', '💎': 'gem',
  '🔫': 'weapon', '🗡': 'sword', '🔪': 'sword', '🪄': 'wand', '🔥': 'flame', '🌋': 'flame', '❄': 'snow', '🧊': 'snow', '💥': 'burst', '💨': 'wind',
  '☀': 'sun', '🌈': 'rainbow', '🌌': 'galaxy', '👑': 'crown', '💀': 'skull', '🥇': 'medal', '⚛': 'atom', '⚜': 'fleur', '🌀': 'spiral', '🔮': 'orb', '🔱': 'fleur', '🧬': 'helix', '🧿': 'eye', '🪐': 'planet',
  '💠': 'diamond', '🔶': 'diamond', '☄': 'comet', '✦': 'sparkle', '♾': 'spiral',
  '🏹': 'bow', '🐺': 'fang', '👹': 'mask', '🗿': 'golem', '🦇': 'bat', '🧙': 'wizard',
  '🐉': 'creature1', '🐙': 'creature2', '🧟': 'creature4', '🕷': 'creature3', '🦂': 'creature3', '🦑': 'creature2', '👾': 'alien', '🏭': 'factory', '🚀': 'rocket', '🤖': 'robot', '⏩': 'fast', '⏱': 'timer',
};

/** Strip variation selectors / skin tones so "⚔️" and "⚔" are the same key. */
const key = (s) => String(s).replace(/[︎️‍]/g, '');

/** SVG for an icon id, a legacy emoji, or a tier symbol. `label` makes it a named image; otherwise it is decorative. */
export function ico(id, { label = '', cls = '' } = {}) {
  const k = key(id);
  let name = P[k] ? k : MAP[k] || null;
  const shape = !name && R[k] ? R[k] : null;
  const body = shape || (name && P[name]) || P.sparkle;
  if (!name && !shape) name = 'sparkle';
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  const solid = shape ? ' ico-solid' : '';
  return `<svg class="ico ico-${shape ? 'tier' : name}${solid}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" ${a11y}>${body}</svg>`;
}

export const ICON_IDS = Object.keys(P);
export const KNOWN_SYMBOLS = new Set([...Object.keys(MAP), ...Object.keys(R)]);
export const hasIcon = (id) => !!(P[key(id)] || MAP[key(id)] || R[key(id)]);
