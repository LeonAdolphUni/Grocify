/**
 * Icons als SVG.
 *
 * Vorher standen an den wichtigsten Stellen Emoji — 🪷 für den Wochenplan,
 * 📖 für die Rezepte, 🥫 für den Vorrat. Das war schnell gebaut und hat drei
 * Nachteile, die zusammen den Eindruck von Provisorium erzeugen:
 *
 *   1. Jedes System zeichnet sie anders. Auf Windows sieht der Lotus anders
 *      aus als auf dem iPhone, und beide sehen anders aus als in Chrome.
 *   2. Sie tragen ihre eigene Farbe. In einer Palette, die aus fünf
 *      abgestimmten Tönen besteht, sitzt ein bunter Emoji wie ein Aufkleber.
 *   3. Sie sind nicht steuerbar — keine Strichstärke, keine Größe im
 *      Verhältnis zur Schrift, kein Halbtransparent.
 *
 * Diese Icons erben `color` und `size` vom Aufrufer. Ein einheitlicher Strich
 * (1,8 px bei 24 px Größe, mit runden Enden) hält sie als Familie zusammen.
 *
 * **Nicht ersetzt werden die Abteilungssymbole der Einkaufsliste.** 🥕 vor
 * „Groente" ist kein Icon, sondern eine Orientierungshilfe im Laden — dort
 * ist die bunte, sofort erkennbare Form genau richtig.
 */

import { Circle, Path, Rect, Svg } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  /** Zweite Farbe für Flächen; standardmäßig durchsichtig. */
  fill?: string;
}

const STROKE = 1.8;

/** Kalenderblatt — der Wochenplan. */
export function CalendarIcon({ size = 24, color = 'currentColor', fill = 'none' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="16" rx="3" stroke={color} strokeWidth={STROKE} fill={fill} />
      <Path d="M3 10h18" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Path d="M8 3v4M16 3v4" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx="8" cy="14.5" r="1.4" fill={color} />
      <Circle cx="12" cy="14.5" r="1.4" fill={color} />
      <Circle cx="16" cy="14.5" r="1.4" fill={color} />
    </Svg>
  );
}

/** Aufgeschlagenes Buch — die Rezepte. */
export function BookIcon({ size = 24, color = 'currentColor', fill = 'none' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill={fill}
      />
      <Path d="M12 6.5v13" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

/** Vorratsglas — was zu Hause steht. */
export function JarIcon({ size = 24, color = 'currentColor', fill = 'none' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 3h8v2.2a4 4 0 0 0 .9 2.5l.5.6A4 4 0 0 1 18 11v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-7a4 4 0 0 1 .6-2.7l.5-.6A4 4 0 0 0 8 5.2V3Z"
        stroke={color} strokeWidth={STROKE} strokeLinejoin="round" fill={fill} />
      <Path d="M6.4 14h11.2" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

/** Einkaufswagen — die Liste. */
export function CartIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 4h2l2.2 9.5a2 2 0 0 0 2 1.5h7.3a2 2 0 0 0 1.9-1.4L20.5 8H6"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="10" cy="19" r="1.6" fill={color} />
      <Circle cx="17" cy="19" r="1.6" fill={color} />
    </Svg>
  );
}

/** Herunterladen — der Import. */
export function DownloadIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3v11" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Path d="M7.5 10 12 14.5 16.5 10" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

/** Teller mit Besteck — ein Gericht ohne eigenes Symbol. */
export function PlateIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={STROKE} />
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={STROKE} opacity={0.5} />
    </Svg>
  );
}

/** Pfeil nach rechts — weiterführende Zeilen. */
export function ChevronIcon({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m9 5 7 7-7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
