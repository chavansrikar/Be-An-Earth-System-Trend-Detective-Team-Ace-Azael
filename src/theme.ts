import * as THREE from 'three';

/**
 * A theme is a whole printed world: the ground the hologram sits on, the ink its lines are
 * drawn in, and one accent for "this part". Light grounds turn the glow off and read like a
 * technical poster; dark grounds glow.
 */
export interface Theme {
  id: string;
  name: string;
  ground: string;
  ink: string;
  accent: string;
  /** Text on the ground. */
  text: string;
  muted: string;
  line: string;
  /** Card / chip fill and its text. */
  panel: string;
  panelText: string;
  glow: boolean;
}

export const THEMES: Record<string, Theme> = {
  floatation: {
    id: 'floatation', name: 'Floatation',
    ground: '#E4572E', ink: '#FFF3EA', accent: '#14204D',
    text: '#FFF3EA', muted: '#FFD3BF', line: '#F59877', panel: '#FFF3EA', panelText: '#14204D', glow: false,
  },
  riso: {
    id: 'riso', name: 'Riso',
    ground: '#2B44B8', ink: '#F4EFE4', accent: '#FF4FA3',
    text: '#F4EFE4', muted: '#B9C3F2', line: '#5468CC', panel: '#F4EFE4', panelText: '#1D2E80', glow: false,
  },
  bench: {
    id: 'bench', name: 'Bench',
    ground: '#E3E1DA', ink: '#1E2BFF', accent: '#FF3B14',
    text: '#14161F', muted: '#5E6070', line: '#C6C3B9', panel: '#14161F', panelText: '#E3E1DA', glow: false,
  },
  midnight: {
    id: 'midnight', name: 'Midnight riso',
    ground: '#0D0E27', ink: '#E7E3FF', accent: '#FF4FA3',
    text: '#E7E3FF', muted: '#9A97C8', line: '#2B2C5A', panel: '#E7E3FF', panelText: '#0D0E27', glow: true,
  },
};

// v2 console screens: a phosphor CRT (default for the Apollo console) and a daylight print.
THEMES.console = {
  id: 'console', name: 'CRT console',
  ground: '#07090A', ink: '#9CF5B4', accent: '#FFB020',
  text: '#E8E3D6', muted: '#8F8B7F', line: '#24302A', panel: '#E8E3D6', panelText: '#161817', glow: true,
};
THEMES.daylight = {
  id: 'daylight', name: 'Daylight console',
  ground: '#ECE8DF', ink: '#1B1D1C', accent: '#E0392B',
  text: '#1B1D1C', muted: '#5E5B52', line: '#C9C2B2', panel: '#1B1D1C', panelText: '#ECE8DF', glow: false,
};

export function pickTheme(): Theme {
  const p = new URLSearchParams(location.search);
  const q = p.get('theme');
  if (THEMES[q || '']) return THEMES[q!];
  // The Apollo console (the v2 default look) runs on the CRT screen unless told otherwise.
  return (p.get('look') ?? 'apollo') === 'apollo' ? THEMES.console : THEMES.riso;
}

export function applyCss(t: Theme) {
  const r = document.documentElement.style;
  r.setProperty('--ground', t.ground);
  r.setProperty('--bone', t.text);
  r.setProperty('--bone-2', t.text);
  r.setProperty('--muted', t.muted);
  r.setProperty('--line', t.line);
  r.setProperty('--signal', t.accent);
  r.setProperty('--panel', t.panel);
  r.setProperty('--panel-text', t.panelText);
  document.documentElement.style.colorScheme = isDark(t.ground) ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.ground);
}

export function isDark(hex: string) {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.35;
}

export const theme = pickTheme();
