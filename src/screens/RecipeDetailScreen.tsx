/**
 * Ein Rezept ansehen.
 *
 * Diese Ansicht fehlte: Bisher konnte man ein Rezept nur *bearbeiten* — wer
 * nur nachsehen wollte, was drin ist, landete in Eingabefeldern. Zutaten
 * lesen und Zutaten ändern sind zwei verschiedene Absichten.
 *
 * Hier hängen auch die Nährwerte. Sie werden erst beim Öffnen gerechnet, weil
 * jede Zutat eine Produktsuche und ein Nährwertblatt braucht — das wäre in
 * einer Liste über acht Rezepte hinweg zu teuer.
 */

import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { nutritionForRecipe, type RecipeNutrition } from '../domain/nutrition';
import { scalingLabel } from '../domain/portions';
import type { Recipe } from '../domain/types';
import { formatQuantity } from '../domain/units';
import { getProvider, SEARCH_PROVIDER_ID } from '../supermarkets/registry';
import { Kees } from '../ui/Kees';
import { NutritionPanel, NutritionSkeleton } from '../ui/NutritionPanel';
import { Button, Header, Screen } from '../ui/components';
import { colors, fonts, radius, recipeIcon, spacing } from '../ui/theme';

interface Props {
  recipe: Recipe;
  providerId: string;
  onEdit: () => void;
  onBack: () => void;
}

export function RecipeDetailScreen({ recipe, providerId, onEdit, onBack }: Props) {
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rechnen = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = getProvider(providerId) ?? getProvider(SEARCH_PROVIDER_ID);
      if (!provider) throw new Error('Kein Anbieter verfügbar');
      setNutrition(await nutritionForRecipe(recipe, provider));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [recipe, providerId]);

  useEffect(() => {
    void rechnen();
  }, [rechnen]);

  const staples = recipe.ingredients.filter((i) => i.isPantryStaple);
  const kaufen = recipe.ingredients.filter((i) => !i.isPantryStaple);

  return (
    <Screen>
      <Header
        tone="pond"
        title={recipe.title}
        subtitle={`${recipe.servings} ${recipe.servings === 1 ? 'Portion' : 'Portionen'} · ${recipe.ingredients.length} Zutaten`}
        onBack={onBack}
        right={<Button label="Bearbeiten" variant="secondary" onPress={onEdit} />}
      />

      <ScrollView contentContainerStyle={s.body}>
        <View style={s.hero}>
          <Text style={s.heroIcon}>{recipeIcon(recipe.title)}</Text>

          {/* Stille Umrechnung wäre ein Vertrauensbruch: Wer „500 g
              Hackfleisch" im Original kennt und hier „125 g" liest, muss
              erfahren warum. */}
          {scalingLabel(recipe) ? (
            <View style={s.scaledBadge}>
              <Text style={s.scaledText}>⤵ {scalingLabel(recipe)}</Text>
            </View>
          ) : null}

          {recipe.sourceUrl ? (
            <Pressable onPress={() => void Linking.openURL(recipe.sourceUrl!)} hitSlop={8}>
              <Text style={s.source}>Zubereitung beim Original ansehen ↗</Text>
            </Pressable>
          ) : (
            <Text style={s.sourceMuted}>Selbst angelegt</Text>
          )}
        </View>

        {loading ? (
          <NutritionSkeleton />
        ) : error ? (
          <View style={s.errorBox}>
            <Kees size={48} mood="meh" />
            <Text style={s.errorText}>Nährwerte konnten nicht geholt werden.</Text>
            <Text style={s.errorHint}>{error}</Text>
            <Button label="Nochmal versuchen" variant="secondary" onPress={() => void rechnen()} />
          </View>
        ) : nutrition ? (
          <NutritionPanel nutrition={nutrition} />
        ) : null}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Zutaten</Text>
          {kaufen.map((ing, i) => (
            <View key={`${ing.id}-${i}`} style={s.row}>
              <Text style={s.amount}>{formatQuantity(ing.quantity)}</Text>
              <Text style={s.name}>{ing.name}</Text>
            </View>
          ))}
        </View>

        {staples.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Hast du zu Hause</Text>
            <Text style={s.sectionHint}>
              Steht nicht auf der Einkaufsliste — für die Nährwerte wird es
              trotzdem mitgerechnet, sofern eine Menge angegeben ist.
            </Text>
            {staples.map((ing, i) => (
              <View key={`${ing.id}-s-${i}`} style={s.row}>
                <Text style={[s.amount, s.amountMuted]}>{formatQuantity(ing.quantity)}</Text>
                <Text style={[s.name, s.nameMuted]}>{ing.name}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },

  hero: { alignItems: 'center', gap: spacing.xs },
  heroIcon: { fontSize: 52 },
  scaledBadge: {
    backgroundColor: colors.sunSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  scaledText: { fontSize: 12, color: colors.seed, fontWeight: '700' },
  source: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  sourceMuted: { fontSize: 13, color: colors.textFaint },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionHint: { fontSize: 12, color: colors.textFaint, lineHeight: 17, marginBottom: spacing.sm },

  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: 5, alignItems: 'baseline' },
  amount: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    minWidth: 86,
  },
  amountMuted: { color: colors.textFaint },
  name: { fontSize: 15, color: colors.text, flex: 1 },
  nameMuted: { color: colors.textMuted },

  errorBox: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: { fontSize: 14, fontWeight: '600', color: colors.text },
  errorHint: { fontSize: 12, color: colors.textFaint, textAlign: 'center' },
});
