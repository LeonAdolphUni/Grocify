/**
 * Gemeinsame Gestaltungswerte.
 *
 * Alle Screens greifen hierauf zu, damit Farben und Abstände nicht in jeder
 * Datei neu erfunden werden.
 */

export const colors = {
  bg: '#f7f7f5',
  surface: '#ffffff',
  border: '#e3e3df',
  text: '#1a1a1a',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  primary: '#12351f',
  accent: '#c2410c',
  danger: '#991b1b',
  dangerBg: '#fef2f2',
  successBg: '#f0fdf4',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const radius = { sm: 6, md: 10, lg: 12 } as const;

/** Maximale Inhaltsbreite, damit die App am Desktop nicht auseinanderläuft. */
export const CONTENT_MAX_WIDTH = 720;

export const euro = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
