import { branding } from './branding.config';

const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const safeColor = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }
  return hexRegex.test(value.trim()) ? value.trim() : fallback;
};

const clampChannel = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(255, value));
};

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  const chunk = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;
  const value = parseInt(chunk, 16);
  return [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255
  ];
};

const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');
  return `#${toHex(clampChannel(r))}${toHex(clampChannel(g))}${toHex(clampChannel(b))}`;
};

const adjustColor = (hex: string, amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const factor = amount / 100;
  return rgbToHex(
    clampChannel(r + 255 * factor),
    clampChannel(g + 255 * factor),
    clampChannel(b + 255 * factor)
  );
};

const getContrastColor = (hex: string): string => {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? '#111111' : '#FFFFFF';
};

const fallbackPalette = {
  primary: '#BF1B1B',
  surface: '#FFFFFF',
  text: '#1F1F1F',
  muted: '#F4F4F5'
};

const [primary, surface, text, muted] = branding.colors;

const resolvedPrimary = safeColor(primary, fallbackPalette.primary);
const resolvedSurface = safeColor(surface, fallbackPalette.surface);
const resolvedText = safeColor(text, fallbackPalette.text);
const resolvedMuted = safeColor(muted, fallbackPalette.muted);

const radiusScale: Record<string, string> = {
  none: '0px',
  xs: '2px',
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '18px',
  pill: '999px'
};

const resolvedRadius = radiusScale[branding.borderRadius] || radiusScale.md;

export const brandTheme = {
  colors: {
    primary: resolvedPrimary,
    primaryHover: adjustColor(resolvedPrimary, -12),
    primarySoft: adjustColor(resolvedPrimary, 65),
    text: resolvedText,
    textMuted: adjustColor(resolvedText, 35),
    surface: resolvedSurface,
    surfaceAlt: adjustColor(resolvedSurface, -4),
    surfaceMuted: resolvedMuted,
    border: adjustColor(resolvedText, 75),
    outline: adjustColor(resolvedText, 55)
  },
  radius: {
    base: resolvedRadius,
    large: `calc(${resolvedRadius} * 1.5)`
  },
  typography: {
    onPrimary: getContrastColor(resolvedPrimary)
  }
};

const CSS_VAR_MAP: Record<string, string> = {
  '--brand-primary': brandTheme.colors.primary,
  '--brand-primary-hover': brandTheme.colors.primaryHover,
  '--brand-primary-soft': brandTheme.colors.primarySoft,
  '--brand-text': brandTheme.colors.text,
  '--brand-text-muted': brandTheme.colors.textMuted,
  '--brand-surface': brandTheme.colors.surface,
  '--brand-surface-alt': brandTheme.colors.surfaceAlt,
  '--brand-surface-muted': brandTheme.colors.surfaceMuted,
  '--brand-border': brandTheme.colors.border,
  '--brand-outline': brandTheme.colors.outline,
  '--brand-radius': brandTheme.radius.base,
  '--brand-radius-lg': brandTheme.radius.large,
  '--brand-on-primary': brandTheme.typography.onPrimary
};

export const applyBrandingTheme = (): void => {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  Object.entries(CSS_VAR_MAP).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
};

export type BrandCssVar = keyof typeof CSS_VAR_MAP;
