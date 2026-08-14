/**
 * Rezept anlegen und bearbeiten.
 *
 * Der schnelle Weg ist eine einzige Zeile: „Milch 0,5 l" eintippen, fertig.
 * Die App zerlegt das in Name, Menge und Einheit und sucht **sofort** das
 * passende Produkt im Sortiment. Passt der Treffer nicht, tauscht ein Tipp
 * ihn gegen ein selbst gewähltes.
 *
 * Alle Felder bleiben trotzdem einzeln bearbeitbar — eine Automatik, die
 * man nicht korrigieren kann, ist keine Hilfe, sondern eine Zumutung.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { parseIngredientInput } from '../domain/parseIngredient';
import { findProductFor } from '../domain/shoppingList';
import { isPantryStaple, normalizeKey, toDutchSearchTerm } from '../domain/translate';
import type { Ingredient, PinnedProduct, Product, Recipe } from '../domain/types';
import { formatQuantity, type Unit } from '../domain/units';
import { newId } from '../domain/id';
import { getProvider, SEARCH_PROVIDER_ID } from '../supermarkets/registry';
import { Button, Card, Header, Screen } from '../ui/components';
import { colors, euro, radius, spacing } from '../ui/theme';
import { ProductSearchScreen } from './ProductSearchScreen';

const UNITS: Unit[] = [
  'g', 'kg', 'ml', 'l', 'Stueck', 'EL', 'TL', 'Prise', 'Bund', 'Zehe', 'Packung', 'Dose',
];

const unitLabel = (u: Unit) => (u === 'Stueck' ? 'Stk' : u);

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

/** Stand der automatischen Produktsuche für eine Zeile. */
type Lookup = 'idle' | 'searching' | 'done' | 'nothing' | 'error';

interface Draft {
  key: string;
  name: string;
  amount: string;
  unit: Unit;
  pinned?: PinnedProduct;
  /** Preis des gefundenen Produkts, nur zur Anzeige. */
  price?: number;
  imageUrl?: string;
  lookup: Lookup;
  /** Aufgeklappte Detailfelder — standardmäßig zu, das spart Fläche. */
  open?: boolean;
}

function toDraft(ing: Ingredient): Draft {
  return {
    key: newId(),
    name: ing.name,
    amount: String(ing.quantity.amount),
    unit: ing.quantity.unit,
    pinned: ing.pinnedProduct,
    lookup: ing.pinnedProduct ? 'done' : 'idle',
  };
}

interface Props {
  recipe?: Recipe;
  onSave: (recipe: Recipe) => void;
  onCancel: () => void;
}

export function RecipeEditScreen({ recipe, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [drafts, setDrafts] = useState<Draft[]>(recipe?.ingredients.map(toDraft) ?? []);
  const [quick, setQuick] = useState('');
  const [searchingKey, setSearchingKey] = useState<string | null>(null);

  const provider = getProvider(SEARCH_PROVIDER_ID);

  const update = useCallback(
    (key: string, patch: Partial<Draft>) =>
      setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r))),
    [],
  );

  /** Sucht im Hintergrund das passende Produkt und heftet es an die Zeile. */
  const lookup = useCallback(
    async (key: string, name: string, amount: number, unit: Unit) => {
      if (!provider?.available) return;
      update(key, { lookup: 'searching' });
      try {
        const product = await findProductFor(
          {
            id: normalizeKey(name),
            name,
            quantity: { amount, unit },
            searchTermNl: toDutchSearchTerm(name),
          },
          provider,
        );
        if (!product) return update(key, { lookup: 'nothing' });
        update(key, {
          lookup: 'done',
          price: product.price,
          imageUrl: product.imageUrl,
          pinned: {
            provider: product.provider,
            id: product.id,
            title: product.title,
            packageSize: product.packageSize,
          },
        });
      } catch {
        update(key, { lookup: 'error' });
      }
    },
    [provider, update],
  );

  /** „Milch 0,5 l" → Zeile anlegen und sofort suchen. */
  const addQuick = useCallback(() => {
    const parsed = parseIngredientInput(quick);
    if (!parsed) return;

    const key = newId();
    setDrafts((rows) => [
      ...rows,
      {
        key,
        name: parsed.name,
        amount: String(parsed.quantity.amount),
        unit: parsed.quantity.unit,
        lookup: 'idle',
        // Wurde keine Einheit erkannt, ist die Annahme „1 Stück" oft falsch.
        // Dann öffnet die Zeile sich, damit man es gleich sieht.
        open: !parsed.hasUnit && !parsed.hasAmount,
      },
    ]);
    setQuick('');
    void lookup(key, parsed.name, parsed.quantity.amount, parsed.quantity.unit);
  }, [quick, lookup]);

  const handlePick = (product: Product) => {
    if (!searchingKey) return;
    const row = drafts.find((d) => d.key === searchingKey);
    update(searchingKey, {
      name: row?.name.trim() ? row.name : product.title,
      unit: row?.amount.trim() ? row.unit : unitForProduct(product),
      price: product.price,
      imageUrl: product.imageUrl,
      lookup: 'done',
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

  const preview = parseIngredientInput(quick);
  const searchingRow = drafts.find((d) => d.key === searchingKey);

  return (
    <Screen>
      <Header
        title={recipe ? 'Rezept bearbeiten' : 'Neues Rezept'}
        subtitle={`${filled.length} ${filled.length === 1 ? 'Zutat' : 'Zutaten'}`}
        onBack={onCancel} tone="sun"
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

        {/* ── Schnelleingabe ── */}
        <Card style={s.quickCard}>
          <Text style={s.quickLabel}>Zutat eintippen</Text>
          <View style={s.quickRow}>
            <TextInput
              style={[s.input, s.flex]}
              value={quick}
              onChangeText={setQuick}
              onSubmitEditing={addQuick}
              placeholder="Milch 0,5 l"
              returnKeyType="done"
              autoCorrect={false}
            />
            <Pressable
              onPress={addQuick}
              disabled={!preview}
              style={({ pressed }) => [s.addBtn, !preview && s.addBtnOff, pressed && s.pressed]}
            >
              <Text style={s.addBtnText}>+</Text>
            </Pressable>
          </View>

          {preview ? (
            <Text style={s.preview}>
              {preview.name} · {formatQuantity(preview.quantity)}
              {!preview.hasUnit && !preview.hasAmount ? '  (Menge geraten)' : ''}
            </Text>
          ) : (
            <Text style={s.quickHint}>
              Menge und Einheit dürfen vorn oder hinten stehen: „500 g Mehl", „Mehl 500g",
              „2 Zehen Knoblauch", „1/2 l Sahne".
            </Text>
          )}
        </Card>

        {/* ── Zutatenliste ── */}
        {drafts.map((d) => (
          <Card key={d.key} style={s.row}>
            <View style={s.rowMain}>
              {d.imageUrl ? (
                <Image source={{ uri: d.imageUrl }} style={s.thumb} />
              ) : (
                <View style={[s.thumb, s.thumbEmpty]} />
              )}

              <Pressable style={s.rowBody} onPress={() => update(d.key, { open: !d.open })}>
                <Text style={s.rowName}>
                  {d.name || 'Ohne Namen'}
                  <Text style={s.rowQty}>
                    {'  '}
                    {d.amount || '?'} {unitLabel(d.unit)}
                  </Text>
                </Text>

                {d.lookup === 'searching' ? (
                  <View style={s.lookupRow}>
                    <ActivityIndicator size="small" />
                    <Text style={s.lookupText}>wird im Laden gesucht …</Text>
                  </View>
                ) : d.lookup === 'done' && d.pinned ? (
                  <Text style={s.found} numberOfLines={1}>
                    ✓ {d.pinned.title}
                    {d.pinned.packageSize ? ` · ${d.pinned.packageSize}` : ''}
                    {d.price !== undefined ? ` · ${euro(d.price)}` : ''}
                  </Text>
                ) : d.lookup === 'nothing' ? (
                  <Text style={s.notFound}>Kein Produkt gefunden — bitte selbst wählen</Text>
                ) : d.lookup === 'error' ? (
                  <Text style={s.notFound}>Suche fehlgeschlagen</Text>
                ) : null}
              </Pressable>

              <View style={s.rowActions}>
                <Pressable onPress={() => setSearchingKey(d.key)} hitSlop={8}>
                  <Text style={s.change}>{d.pinned ? 'ändern' : 'wählen'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDrafts((rows) => rows.filter((r) => r.key !== d.key))}
                  hitSlop={8}
                >
                  <Text style={s.remove}>✕</Text>
                </Pressable>
              </View>
            </View>

            {/* Detailfelder, aufklappbar */}
            {d.open ? (
              <View style={s.details}>
                <View style={s.detailRow}>
                  <TextInput
                    style={[s.input, s.flex]}
                    value={d.name}
                    onChangeText={(name) => update(d.key, { name })}
                    placeholder="Zutat"
                  />
                  <TextInput
                    style={[s.input, s.amountInput]}
                    value={d.amount}
                    onChangeText={(amount) => update(d.key, { amount })}
                    keyboardType="decimal-pad"
                  />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {UNITS.map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => update(d.key, { unit: u })}
                      style={[s.chip, d.unit === u && s.chipOn]}
                    >
                      <Text style={[s.chipText, d.unit === u && s.chipTextOn]}>
                        {unitLabel(u)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {isPantryStaple(d.name) && d.name.trim() ? (
                  <Text style={s.staple}>
                    Als Vorrat eingestuft — kommt nicht auf die Einkaufsliste
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Card>
        ))}

        {drafts.length === 0 ? (
          <Text style={s.empty}>
            Noch keine Zutaten. Tippe oben eine ein — die App sucht das Produkt sofort
            im Sortiment.
          </Text>
        ) : null}
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
  flex: { flex: 1 },

  quickCard: { borderColor: colors.primary, gap: spacing.sm },
  quickLabel: { fontSize: 13, fontWeight: '600', color: colors.primary },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  addBtn: {
    width: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnOff: { opacity: 0.35 },
  pressed: { opacity: 0.75 },
  addBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 26 },
  preview: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  quickHint: { fontSize: 12, color: colors.textFaint, lineHeight: 17 },

  row: { gap: spacing.sm },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbEmpty: { backgroundColor: '#f0f0ee', borderWidth: 1, borderColor: colors.border },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowQty: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  lookupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  lookupText: { fontSize: 12, color: colors.textMuted },
  found: { fontSize: 12, color: colors.primary, marginTop: 3 },
  notFound: { fontSize: 12, color: colors.alarm, marginTop: 3 },
  rowActions: { alignItems: 'flex-end', gap: spacing.sm },
  change: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },
  remove: { fontSize: 15, color: colors.textFaint },

  details: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  detailRow: { flexDirection: 'row', gap: spacing.sm },
  amountInput: { width: 84, textAlign: 'right' },
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
  staple: { fontSize: 12, color: colors.alarm },

  empty: {
    textAlign: 'center',
    color: colors.textFaint,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    lineHeight: 20,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
