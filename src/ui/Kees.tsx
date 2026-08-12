/**
 * Kees, der Frosch.
 *
 * Ein Maskottchen, das nur herumsitzt, ist Dekoration. Kees bekommt eine
 * Aufgabe: Er reagiert auf die Verwertungsquote — genau die Zahl, die diese
 * App von jeder anderen Einkaufsliste unterscheidet. Wer gut einkauft,
 * bekommt ein Grinsen; wer die halbe Packung stehen lässt, einen schiefen
 * Blick.
 *
 * Vier Stufen, nicht mehr: Feinere Abstufungen kann man am Gesicht ohnehin
 * nicht ablesen.
 */

import { Circle, Ellipse, G, Path, Svg } from 'react-native-svg';

import { colors } from './theme';

export type Mood = 'happy' | 'content' | 'meh' | 'grumpy';

/** Ordnet eine Verwertungsquote (0…1) einer Stimmung zu. */
export function moodForUtilization(utilization: number | null): Mood {
  if (utilization === null) return 'content';
  if (utilization >= 0.85) return 'happy';
  if (utilization >= 0.7) return 'content';
  if (utilization >= 0.55) return 'meh';
  return 'grumpy';
}

/** Was Kees zur Lage sagt. Kurz — ein Satz, keine Tabelle. */
export function keesSays(mood: Mood, leftoverValue: number): string {
  switch (mood) {
    case 'happy':
      return leftoverValue < 1
        ? 'Kwak! Fast nichts bleibt übrig.'
        : 'Kwak! Sauber geplant.';
    case 'content':
      return 'Solide. Ein Rest ist erlaubt.';
    case 'meh':
      return 'Da bleibt einiges liegen …';
    case 'grumpy':
      return 'Die halbe Packung? Wirklich?';
  }
}

interface Props {
  size?: number;
  mood?: Mood;
}

export function Kees({ size = 64, mood = 'content' }: Props) {
  // Das Gesicht ist der einzige Unterschied zwischen den Stimmungen —
  // Körper und Haltung bleiben gleich, damit er als dieselbe Figur lesbar
  // bleibt statt wie vier verschiedene Frösche zu wirken.
  const pupilOffsetX = mood === 'meh' ? 3 : 0;
  const pupilOffsetY = mood === 'grumpy' ? 2 : 0;

  const mouth =
    mood === 'happy'
      ? 'M24 34 Q33 44 42 34'
      : mood === 'content'
        ? 'M26 35 Q33 39 40 35'
        : mood === 'meh'
          ? 'M26 37 L40 36'
          : 'M25 39 Q33 33 41 39';

  return (
    <Svg width={size} height={size * (58 / 66)} viewBox="0 0 66 58">
      {/* Schatten, damit er auf etwas sitzt statt zu schweben */}
      <Ellipse cx="33" cy="54" rx="21" ry="4" fill={colors.border} />

      {/* Körper */}
      <Ellipse cx="33" cy="36" rx="22" ry="17" fill={colors.frog} />
      <Ellipse cx="33" cy="42" rx="14" ry="9" fill={colors.frogBelly} />

      {/* Beine */}
      <Ellipse cx="9" cy="44" rx="7" ry="4" fill="#4d9130" transform="rotate(-18 9 44)" />
      <Ellipse cx="57" cy="44" rx="7" ry="4" fill="#4d9130" transform="rotate(18 57 44)" />

      {/* Augenhügel */}
      <Circle cx="21" cy="19" r="10" fill={colors.frog} />
      <Circle cx="45" cy="19" r="10" fill={colors.frog} />
      <Circle cx="21" cy="18" r="6" fill="#ffffff" />
      <Circle cx="45" cy="18" r="6" fill="#ffffff" />
      <Circle cx={21 + pupilOffsetX} cy={18 + pupilOffsetY} r="3.2" fill={colors.text} />
      <Circle cx={45 + pupilOffsetX} cy={18 + pupilOffsetY} r="3.2" fill={colors.text} />

      {/* Zusammengezogene Brauen nur beim Grummeln */}
      {mood === 'grumpy' ? (
        <G>
          <Path d="M11 13 L30 17" stroke={colors.text} strokeWidth="2.2" strokeLinecap="round" />
          <Path d="M55 13 L36 17" stroke={colors.text} strokeWidth="2.2" strokeLinecap="round" />
        </G>
      ) : null}

      <Path d={mouth} stroke={colors.text} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </Svg>
  );
}
