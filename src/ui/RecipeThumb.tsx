/**
 * Vorschaubild eines Gerichts, mit Monogramm als Rückfall.
 *
 * **Warum überhaupt Bilder.** Eine Liste aus zwölf Zeilen Text zwingt zum
 * Lesen; eine Liste mit Bildern lässt sich überfliegen. Beim Aussuchen
 * eines Abendessens ist das der ganze Unterschied — man erkennt ein
 * Gericht, bevor man seinen Namen gelesen hat.
 *
 * **Warum trotzdem das Monogramm bleibt.** Nicht jedes Rezept hat ein Bild:
 * Selbst angelegte haben keins, und bei Allerhande lässt sich das Bild aus
 * der Trefferliste nicht immer sicher zuordnen. Ein leerer grauer Kasten
 * wäre eine sichtbare Lücke; das Monogramm ist eine Antwort. Auch ein Bild,
 * das nicht lädt — abgelaufene URL, kein Netz — fällt darauf zurück, statt
 * ein kaputtes Symbol zu zeigen.
 *
 * Die Bilder liegen auf AHs Bildserver und werden von dort geladen. Wir
 * kopieren sie nicht: Verschwindet ein Rezept bei AH, verschwindet auch
 * sein Bild — das ist richtig so.
 */

import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Monogram } from './Monogram';
import { colors } from './theme';

interface Props {
  title: string;
  imageUrl?: string;
  size?: number;
  /** Eckenradius. Standard ist rund, wie das Monogramm. */
  radius?: number;
}

export function RecipeThumb({ title, imageUrl, size = 36, radius }: Props) {
  const [kaputt, setKaputt] = useState(false);

  if (!imageUrl || kaputt) {
    // Bei eckiger Vorgabe braucht auch der Rückfall eine Ecke, sonst
    // springt das Layout, sobald ein Bild fehlt.
    if (radius === undefined) return <Monogram title={title} size={size} />;
    return (
      <View style={[s.box, { width: size, height: size, borderRadius: radius }]}>
        <Monogram title={title} size={size} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={[
        s.img,
        { width: size, height: size, borderRadius: radius ?? size / 2 },
      ]}
      onError={() => setKaputt(true)}
      accessibilityIgnoresInvertColors
      accessibilityLabel={`Foto von ${title}`}
    />
  );
}

const s = StyleSheet.create({
  img: { backgroundColor: colors.bg, resizeMode: 'cover' },
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
