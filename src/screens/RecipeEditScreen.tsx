/**
 * Rezept anlegen und bearbeiten.
 *
 * Zutaten werden hier von Hand eingetragen. Ab Sprint 3 übernimmt das die
 * Claude API aus Text, Link oder Foto — dieser Screen bleibt dann als
 * Korrekturansicht bestehen, denn eine automatische Erkennung, die man
 * nicht nachbessern kann, ist wertlos.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { isPantryStaple, normalizeKey, toDutchSearchTerm } from '../domain/translate';
import type { Ingredient, Recipe } from '../domain/types';
import type { Unit } from '../domain/units';
import { newId } from '../storage/recipeStore';
import { Button, Card, Header, Screen } from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

const UNITS: Unit[] = [
  'g', 'kg', 'ml', 'l', 'Stueck', 'EL', 'TL', 'Prise', 'Bund', 'Zehe', 'Packung', 'Dose',
];

const unitLabel = (u: Unit) => (u === 'Stueck' ? 'Stk' : u);

/** Zeile im Formular — Mengen sind hier Text, weil "1," ein gültiger Zwischenstand ist. */
interface Draft {
  key: string;
  name: string;
  amount: string;
  unit: Unit;
}

function toDraft(ing: Ingredient): Draft {
  return {
    key: newId(),
    name: ing.name,
    amount: String(ing.quantity.amount),
    unit: ing.quantity.unit,
  };
}

function emptyDraft(): Draft {
  return { key: newId(), name: '', amount: '', unit: 'g' };
}

interface Props {
  recipe?: Recipe;
  onSave: (recipe: Recipe) => void;
  onCancel: () => void;
}

export function RecipeEditScreen({ recipe, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [drafts, setDrafts] = useState<Draft[]>(
    recipe?.ingredients.length ? recipe.ingredients.map(toDraft) : [emptyDraft()],
  );

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const filled = drafts.filter((d) => d.name.trim() && d.amount.trim());
  const canSave = title.trim().length > 0 && filled.length > 0;

  const handleSave = () => {
    if (!canSave) return;

    const ingredients: Ingredient[] = filled.map((d) => {
      const name = d.name.trim();
      // Komma als Dezimaltrennzeichen zulassen — deutsche Eingabegewohnheit.
      const amount = Number.parseFloat(d.amount.replace(',', '.')) || 0;
      return {
        id: normalizeKey(name),
        name,
        searchTermNl: toDutchSearchTerm(name),
        quantity: { amount, unit: d.unit },
        rawText: `${d.amount} ${unitLabel(d.unit)} ${name}`,
        isPantryStaple: isPantryStaple(name),
      };
    });

    onSave({
      id: recipe?.id ?? newId(),
      title: title.trim(),
      servings: Math.max(1, Number.parseInt(servings, 10) || 1),
      ingredients,
      sourceUrl: recipe?.sourceUrl,
    });
  };

  return (
    <Screen>
      <Header
        title={recipe ? 'Rezept bearbeiten' : 'Neues Rezept'}
        subtitle={`${filled.length} ${filled.length === 1 ? 'Zutat' : 'Zutaten'}`}
        onBack={onCancel}
      />

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={s.label}>Titel</Text>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="z. B. Pfannkuchen"
          />

          <Text style={[s.label, s.labelSpaced]}>Portionen</Text>
          <TextInput
            style={[s.input, s.inputNarrow]}
            value={servings}
            onChangeText={setServings}
            keyboardType="number-pad"
          />
        </Card>

        <Text style={s.section}>Zutaten</Text>

        {drafts.map((d) => (
          <Card key={d.key} style={s.ingredientCard}>
            <View style={s.rowTop}>
              <TextInput
                style={[s.input, s.flex]}
                value={d.name}
                onChangeText={(name) => update(d.key, { name })}
                placeholder="Zutat, z. B. Weizenmehl"
              />
              <TextInput
                style={[s.input, s.amountInput]}
                value={d.amount}
                onChangeText={(amount) => update(d.key, { amount })}
                placeholder="200"
                keyboardType="decimal-pad"
              />
              {drafts.length > 1 ? (
                <Pressable
                  onPress={() => setDrafts((rows) => rows.filter((r) => r.key !== d.key))}
                  hitSlop={8}
                  style={s.remove}
                >
                  <Text style={s.removeText}>✕</Text>
                </Pressable>
              ) : null}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.units}>
              {UNITS.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => update(d.key, { unit: u })}
                  style={[s.chip, d.unit === u && s.chipOn]}
                >
                  <Text style={[s.chipText, d.unit === u && s.chipTextOn]}>{unitLabel(u)}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {d.name.trim() ? (
              <Text style={s.hint}>
                Suche im Supermarkt als „{toDutchSearchTerm(d.name.trim())}"
                {isPantryStaple(d.name) ? ' · als Vorrat eingestuft, nicht auf der Liste' : ''}
              </Text>
            ) : null}
          </Card>
        ))}

        <Button
          label="+ Zutat hinzufügen"
          variant="secondary"
          onPress={() => setDrafts((rows) => [...rows, emptyDraft()])}
        />
      </ScrollView>

      <View style={s.footer}>
        <Button
          label={canSave ? 'Speichern' : 'Titel und mindestens eine Zutat fehlen'}
          onPress={handleSave}
          disabled={!canSave}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  labelSpaced: { marginTop: spacing.lg },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  inputNarrow: { width: 96 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  ingredientCard: { gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  amountInput: { width: 84, textAlign: 'right' },
  remove: { padding: spacing.xs },
  removeText: { color: colors.textFaint, fontSize: 17 },
  units: { marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  hint: { fontSize: 12, color: colors.textFaint, fontStyle: 'italic' },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
