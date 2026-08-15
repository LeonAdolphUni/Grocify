/**
 * Monogramm eines Gerichts — der erste Buchstabe in einem farbigen Kreis.
 *
 * Ersetzt die Gerichts-Emoji. Ein Teller für „Carbonara" und ein Teller für
 * „Gurkensalat" unterscheiden nichts; der Anfangsbuchstabe unterscheidet
 * jedes Gericht von jedem anderen. Die Farbe wird aus dem Titel gerechnet
 * und bleibt damit über Sitzungen hinweg dieselbe.
 */

import { StyleSheet, Text, View } from 'react-native';

import { fonts, recipeMonogram } from './theme';

export function Monogram({ title, size = 36 }: { title: string; size?: number }) {
  const { letter, color } = recipeMonogram(title);

  return (
    <View
      style={[
        s.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[s.letter, { fontSize: size * 0.44 }]}>{letter}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: fonts.heading, fontWeight: '800', color: '#ffffff' },
});
