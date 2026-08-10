/**
 * Rezept anlegen und bearbeiten.
 *
 * Zwei Wege, eine Zutat einzutragen:
 *
 * 1. **Aus dem Sortiment wählen** — Produktsuche öffnen, echtes Produkt
 *    antippen. Damit steht die Zuordnung fest; beim Bauen der Einkaufsliste
 *    wird weder übersetzt noch geraten, nur der Preis frisch geholt.
 * 2. **Frei eintippen** — für alles, was nicht im Sortiment steht, und für
 *    schnelles Erfassen. Die Zuordnung übernimmt dann die Heuristik.
 *
 * Ab Sprint 3 kommt der Import aus Text, Link und Foto dazu. Dieser Screen
 * bleibt als Korrekturansicht bestehen: Eine automatische Erkennung, die
 * man nicht nachbessern kann, ist wertlos.
 */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { isPantryStaple, normalizeKey, toDutchSearchTerm } from '../domain/translate';
import type { Ingredient, PinnedProduct, Product, Recipe } from '../domain/types';
import type { Unit } from '../domain/units';
import { newId } from '../storage/recipeStore';
import { SEARCH_PROVIDER_ID } from '../supermarkets/registry';
import { Button, Card, Header, Screen } from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';
import { ProductSearchScreen } from './ProductSearchScreen';

const UNITS: Unit[] = [
  'g', 'kg', 'ml', 'l', 'Stueck', 'EL', 'TL', 'Prise', 'Bund', 'Zehe', 'Packung', 'Dose',
];

const unitLabel = (u: Unit) => (u === 'Stueck' ? 'Stk' : u);

/**
 * Sinnvolle Einheit für ein gewähltes Produkt.
 * Rezepte nennen Gramm und Milliliter, Gebinde nennen Kilo und Liter —
 * deshalb wird heruntergerechnet statt übernommen.
 */
function unitForProduct(product: Product): Unit {
  switch (product.packageQuantity?.unit) {
    case 'kg':
    case 'g':
      return 'g';
    case 'l':
    case 'ml':
      return 'ml';
    case 'Stueck':
      return 'Stueck';
    default:
      return 'g';
  }
}

/** Zeile im Formular — Mengen sind hier Text, weil "1," ein gültiger Zwischenstand ist. */
interface Draft {
  key: string;
  name: string;
  amount: string;
  unit: Unit;
  pinned?: PinnedProduct;
}

function toDraft(ing: Ingredient): Draft {
  return {
    key: newId(),
    name: ing.name,
    amount: String(ing.quantity.amount),
    unit: ing.quantity.unit,
    pinned: ing.pinnedProduct,
  };
}

const emptyDraft = (): Draft => ({ key: newId(), name: '', amount: '', unit: 'g' });

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
  /** Schlüssel der Zeile, für die gerade die Produktsuche offen ist. */
  const [searchingKey, setSearchingKey] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handlePick = (product: Product) => {
    if (!searchingKey) return;
    const row = drafts.find((d) => d.key === searchingKey);
    update(searchingKey, {
      // Einen bereits getippten Namen nicht überschreiben — der Nutzer hat
      // sich etwas dabei gedacht. Nur die leere Zeile wird gefüllt.
      name: row?.name.trim() ? row.name : product.title,
      unit: row?.amount.trim() ? row.unit : unitForProduct(product),
      pinned: {
        provider: product.provider,
        id: product.id,
        title: product.title,
        packageSize: product.packageSize,
      },
    });
    setSearchingKey(null);
  };

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
        pinnedProduct: d.pinned,
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

  const searchingRow = drafts.find((d) => d.key === searchingKey);

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
            placeholder="z. B. Spaghetti Bolognese"
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

            {d.pinned ? (
              <View style={s.pinned}>
                <View style={s.flex}>
                  <Text style={s.pinnedTitle}>✓ {d.pinned.title}</Text>
                  <Text style={s.pinnedMeta}>
                    {d.pinned.packageSize} · fest gewählt, wird nicht gesucht
                  </Text>
                </View>
                <Pressable onPress={() => update(d.key, { pinned: undefined })} hitSlop={8}>
                  <Text style={s.pinnedClear}>lösen</Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.pickRow}>
                <Pressable
                  onPress={() => setSearchingKey(d.key)}
                  style={({ pressed }) => [s.pick, pressed && s.pickPressed]}
                >
                  <Text style={s.pickText}>Produkt aus dem Sortiment wählen</Text>
                </Pressable>
                {d.name.trim() ? (
                  <Text style={s.hint}>sonst gesucht als „{toDutchSearchTerm(d.name.trim())}"</Text>
                ) : null}
              </View>
            )}

            {isPantryStaple(d.name) && d.name.trim() ? (
              <Text style={s.staple}>Als Vorrat eingestuft — kommt nicht auf die Einkaufsliste</Text>
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

      <Modal
        visible={searchingKey !== null}
        animationType="slide"
        onRequestClose={() => setSearchingKey(null)}
      >
        <ProductSearchScreen
          providerId={SEARCH_PROVIDER_ID}
          initialQuery={
            searchingRow?.name.trim() ? toDutchSearchTerm(searchingRow.name.trim()) : ''
          }
          onPick={handlePick}
          onCancel={() => setSearchingKey(null)}
        />
      </Modal>
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

  pickRow: { gap: spacing.xs },
  pick: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  pickPressed: { backgroundColor: '#f0f4f1' },
  pickText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  hint: { fontSize: 12, color: colors.textFaint, fontStyle: 'italic', textAlign: 'center' },

  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pinnedTitle: { fontSize: 14, fontWeight: '600', color: colors.primary },
  pinnedMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  pinnedClear: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },

  staple: { fontSize: 12, color: colors.accent },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
