/**
 * Schritt 2: Supermarkt wählen.
 *
 * Nicht verfügbare Märkte werden angezeigt statt versteckt, mit Begründung.
 * Ein ausgegrauter Eintrag, der erklärt warum, ist ehrlicher als eine
 * Auswahl, die stumm nichts liefert.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Recipe } from '../domain/types';
import { PROVIDERS } from '../supermarkets/registry';
import { Card, Header, Screen } from '../ui/components';
import { colors, spacing } from '../ui/theme';

interface Props {
  recipes: Recipe[];
  onSelect: (providerId: string) => void;
  onBack: () => void;
}

export function SupermarketScreen({ recipes, onSelect, onBack }: Props) {
  const ingredientCount = recipes.reduce((n, r) => n + r.ingredients.length, 0);

  return (
    <Screen>
      <Header
        title="Wo kaufst du ein?"
        subtitle={`${recipes.length} ${recipes.length === 1 ? 'Rezept' : 'Rezepte'} · ${ingredientCount} Zutaten`}
        onBack={onBack}
      />

      <ScrollView contentContainerStyle={s.body}>
        {PROVIDERS.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => p.available && onSelect(p.id)}
            disabled={!p.available}
          >
            <Card style={p.available ? undefined : s.cardDisabled}>
              <View style={s.row}>
                <View style={s.text}>
                  <Text style={[s.name, !p.available && s.nameDisabled]}>{p.displayName}</Text>
                  <Text style={s.status}>
                    {p.available ? 'Live-Preise verfügbar' : 'Derzeit nicht verfügbar'}
                  </Text>
                </View>
                {p.available ? <Text style={s.arrow}>›</Text> : null}
              </View>

              {p.unavailableReason ? (
                <Text style={s.reason}>{p.unavailableReason}</Text>
              ) : null}
            </Card>
          </Pressable>
        ))}

        <Text style={s.footnote}>
          Die Preise stammen live aus dem Sortiment des gewählten Marktes. Sie
          sind Momentaufnahmen und können im Laden abweichen — Aktionen und
          Filialunterschiede sind nicht immer abgebildet.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  cardDisabled: { opacity: 0.6, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
  name: { fontSize: 18, fontWeight: '600', color: colors.text },
  nameDisabled: { color: colors.textMuted },
  status: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  arrow: { fontSize: 26, color: colors.textFaint },
  reason: {
    marginTop: spacing.md,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  footnote: {
    fontSize: 12,
    color: colors.textFaint,
    lineHeight: 18,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
