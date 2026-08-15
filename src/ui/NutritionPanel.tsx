/**
 * Nährwertanzeige eines Gerichts.
 *
 * Die gestalterische Kernentscheidung steht in der Fußzeile: **Wie viele
 * Zutaten in die Zahl eingegangen sind, steht immer dabei.** Eine
 * Kalorienangabe ohne diese Angabe wäre eine Behauptung — bei Rezepten mit
 * „Öl nach Geschmack" fehlen schnell 200 Kilokalorien, und wer das nicht
 * weiß, plant falsch.
 *
 * Reicht die Grundlage nicht (unter der Hälfte der Zutaten), wird die Zahl
 * gar nicht erst gezeigt. Lieber ein ehrlicher Hinweis als ein Wert, der um
 * den Faktor zwei danebenliegt.
 */

import { StyleSheet, Text, View } from 'react-native';

import {
  coverageLabel,
  isTrustworthy,
  type NutritionFacts,
  type RecipeNutrition,
} from '../domain/nutrition';
import { colors, fonts, radius, spacing } from './theme';

interface Props {
  nutrition: RecipeNutrition;
  /** Kompakt: nur Kalorien als eine Zeile, für Listenkarten. */
  compact?: boolean;
}

const g = (v: number | undefined) => (v === undefined ? '—' : `${v} g`);

export function NutritionPanel({ nutrition, compact }: Props) {
  const p = nutrition.perServing;
  const belastbar = isTrustworthy(nutrition);

  if (compact) {
    return (
      <View style={s.compact}>
        <Text style={s.compactValue}>
          {belastbar && p.kcal !== undefined ? `${p.kcal} kcal` : '— kcal'}
        </Text>
        <Text style={s.compactLabel}>je Portion · {coverageLabel(nutrition)}</Text>
      </View>
    );
  }

  return (
    <View style={s.panel}>
      <View style={s.head}>
        <Text style={s.title}>Nährwerte</Text>
        <Text style={s.per}>je Portion · {nutrition.servings} Portionen</Text>
      </View>

      {belastbar ? (
        <>
          <View style={s.kcalRow}>
            <Text style={s.kcal}>{p.kcal ?? '—'}</Text>
            <Text style={s.kcalUnit}>kcal</Text>
          </View>

          <View style={s.grid}>
            <Macro label="Fett" value={g(p.fat)} sub={`davon gesättigt ${g(p.saturatedFat)}`} />
            <Macro label="Kohlenhydrate" value={g(p.carbs)} sub={`davon Zucker ${g(p.sugar)}`} />
            <Macro label="Eiweiß" value={g(p.protein)} />
            <Macro label="Salz" value={g(p.salt)} />
          </View>
        </>
      ) : (
        <Text style={s.tooThin}>
          Zu wenig Grundlage für eine Zahl — nur {coverageLabel(nutrition)} konnten
          gerechnet werden. Lieber nichts als eine Angabe, die um die Hälfte
          danebenliegt.
        </Text>
      )}

      <View style={s.foot}>
        <Text style={s.footHead}>Gerechnet aus {coverageLabel(nutrition)}</Text>

        {nutrition.missing.length > 0 ? (
          <Text style={s.footText}>
            Nicht enthalten: {nutrition.missing.map((m) => m.name).join(', ')}
          </Text>
        ) : (
          <Text style={s.footText}>Alle Zutaten konnten berücksichtigt werden.</Text>
        )}

        {/* Geschätzt heißt: Durchschnittswert statt Herstellerangabe. Der
            Unterschied gehört sichtbar — bei Gemüse ist er klein, bei Käse
            und Wurst streuen die echten Werte deutlich. */}
        {nutrition.estimated.length > 0 ? (
          <Text style={s.footEstimated}>
            Geschätzt aus Durchschnittswerten: {nutrition.estimated.join(', ')} — der
            Händler meldet dafür keine Nährwerte.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Macro({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.macro}>
      <Text style={s.macroValue}>{value}</Text>
      <Text style={s.macroLabel}>{label}</Text>
      {sub ? <Text style={s.macroSub}>{sub}</Text> : null}
    </View>
  );
}

/** Platzhalter, solange gerechnet wird — statt eines leeren Kastens. */
export function NutritionSkeleton() {
  return (
    <View style={s.panel}>
      <View style={s.head}>
        <Text style={s.title}>Nährwerte</Text>
        <Text style={s.per}>wird gerechnet …</Text>
      </View>
      <View style={s.kcalRow}>
        <View style={[s.bone, { width: 92, height: 40 }]} />
      </View>
      <View style={s.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={s.macro}>
            <View style={[s.bone, { width: 54, height: 20 }]} />
            <View style={[s.bone, { width: 78, height: 12, marginTop: 6 }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.text },
  per: { fontSize: 12, color: colors.textFaint },

  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  kcal: { fontFamily: fonts.heading, fontSize: 40, fontWeight: '800', color: colors.primary, letterSpacing: -1 },
  kcalUnit: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  macro: { minWidth: 120, flexGrow: 1, flexBasis: '40%' },
  macroValue: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '700', color: colors.text },
  macroLabel: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  macroSub: { fontSize: 11, color: colors.textFaint, marginTop: 1 },

  tooThin: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },

  foot: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 2 },
  footHead: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  footText: { fontSize: 11, color: colors.textFaint, lineHeight: 16 },
  footEstimated: { fontSize: 11, color: colors.seed, lineHeight: 16, marginTop: 2 },

  compact: { gap: 1 },
  compactValue: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.primary },
  compactLabel: { fontSize: 11, color: colors.textFaint },

  bone: { backgroundColor: colors.border, borderRadius: radius.sm, opacity: 0.6 },
});
