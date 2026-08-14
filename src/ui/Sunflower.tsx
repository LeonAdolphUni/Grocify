/**
 * Die Sonnenblume als Messinstrument.
 *
 * Zwei Größen desselben Gedankens:
 *
 * `Sunflower` — die große Blüte in der Statistik. Von zwölf Blättern sind so
 * viele gelb wie die Verwertungsquote hergibt, der Rest bleibt grau. Man
 * liest den Wert am Bild ab, bevor man die Zahl in der Mitte gelesen hat.
 *
 * `Petals` — dieselbe Idee als schmale Reihe für jede Zeile der
 * Einkaufsliste. Zehn Blättchen, fünf gelb heißt fünfzig Prozent. Das erste
 * fehlende färbt sich orange, damit das Problem auffällt, bevor man liest.
 */

import { View } from 'react-native';
import { Circle, Ellipse, G, Svg, Text as SvgText } from 'react-native-svg';

import { colors, spacing } from './theme';

interface SunflowerProps {
  /** Verwertung 0…1. `null` heißt: nicht berechenbar, alle Blätter grau. */
  value: number | null;
  size?: number;
  /** Beschriftung in der Blütenmitte. Standard ist der Prozentwert. */
  label?: string;
  /**
   * Anzahl der Blätter. Sieben ergibt eine Wochenanzeige — ein Blatt je
   * Tag —, zwölf eine feinere Skala für die Verwertungsquote.
   */
  petalCount?: number;
}

export function Sunflower({ value, size = 132, label, petalCount = 12 }: SunflowerProps) {
  const filled = value === null ? 0 : Math.round(value * petalCount);
  const center = 56;

  return (
    <Svg width={size} height={size} viewBox="0 0 112 112">
      <G>
        {Array.from({ length: petalCount }, (_, i) => {
          const angle = (360 / petalCount) * i;
          const on = i < filled;
          return (
            <Ellipse
              key={i}
              cx={center}
              cy={17}
              rx={6.5}
              ry={15}
              fill={on ? colors.sun : '#dfe7db'}
              transform={`rotate(${angle} ${center} ${center})`}
            />
          );
        })}
      </G>

      <Circle cx={center} cy={center} r="23" fill={colors.seed} />
      <Circle cx={center} cy={center} r="17" fill="#6b5029" />
      <SvgText
        x={center}
        y={center + 6}
        textAnchor="middle"
        fontSize="17"
        fontWeight="800"
        fill={colors.sunSoft}
      >
        {label ?? (value === null ? '—' : `${Math.round(value * 100)}%`)}
      </SvgText>
    </Svg>
  );
}

interface PetalsProps {
  /** Verwertung 0…1. */
  value: number;
  count?: number;
}

export function Petals({ value, count = 10 }: PetalsProps) {
  const filled = Math.round(value * count);
  const poor = value < 0.6;

  return (
    <View style={{ flexDirection: 'row', gap: 2, marginTop: spacing.xs }}>
      {Array.from({ length: count }, (_, i) => {
        const on = i < filled;
        // Das erste fehlende Blatt trägt die Warnfarbe: Es markiert genau
        // die Stelle, an der die Packung nicht aufgeht.
        const isFirstMissing = i === filled && poor;
        return (
          <View
            key={i}
            style={{
              width: 7,
              height: 7,
              backgroundColor: on ? colors.sun : isFirstMissing ? colors.alarm : '#e0e7dc',
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
              borderBottomLeftRadius: 0,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        );
      })}
    </View>
  );
}
