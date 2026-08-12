/**
 * Die fertige Einkaufsliste.
 *
 * Drei Dinge, die über eine reine Auflistung hinausgehen:
 *
 * 1. **Verwertung** — wie viel vom Gekauften tatsächlich verkocht wird.
 *    Das ist der Grund, warum sich ein Wochenplan lohnt, und ohne die Zahl
 *    bleibt er eine Behauptung.
 * 2. **Restverwertung** — welches deiner anderen Rezepte die Reste
 *    aufbrauchen würde. Ein Hinweis „700 g Reis übrig" ohne Vorschlag ist
 *    nur ein Vorwurf.
 * 3. **Produkt tauschen** — jede Zeile lässt sich neu belegen. Keine
 *    Heuristik trifft immer richtig; ein Tipp ist ehrlicher als noch eine
 *    Regel.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { suggestRecipesForLeftovers } from '../domain/leftoverUse';
import { buildShoppingList } from '../domain/shoppingList';
import { calculateStats, calculateTotal, type Product, type Recipe, type ShoppingList, type ShoppingListItem } from '../domain/types';
import { formatQuantity } from '../domain/units';
import { getProvider } from '../supermarkets/registry';
import { Header, Notice, Screen } from '../ui/components';
import { Kees, keesSays, moodForUtilization } from '../ui/Kees';
import { Petals, Sunflower } from '../ui/Sunflower';
import { categoryIcon, colors, euro, radius, spacing } from '../ui/theme';
import { ProductSearchScreen } from './ProductSearchScreen';

interface Props {
  /** Rezepte, aus denen die Liste entsteht. */
  recipes: Recipe[];
  /** Alle bekannten Rezepte — Grundlage für die Restverwertungs-Vorschläge. */
  allRecipes: Recipe[];
  providerId: string;
  onBack: () => void;
}

const itemKey = (i: ShoppingListItem) => `${i.ingredient.id}-${i.ingredient.quantity.unit}`;

function groupByCategory(items: ShoppingListItem[]): [string, ShoppingListItem[]][] {
  const map = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    const key = item.product?.category ?? 'Ohne Zuordnung';
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'));
}


export function ShoppingListScreen({ recipes, allRecipes, providerId, onBack }: Props) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [statsOpen, setStatsOpen] = useState(false);
  /** Für welche Zeile gerade ein Ersatzprodukt gesucht wird. */
  const [swapping, setSwapping] = useState<ShoppingListItem | null>(null);

  const provider = getProvider(providerId);

  useEffect(() => {
    let cancelled = false;
    if (!provider) {
      setError(`Unbekannter Supermarkt: ${providerId}`);
      return;
    }

    (async () => {
      try {
        const result = await buildShoppingList(recipes, provider, {
          onProgress: (done, total, label) => {
            if (!cancelled) setProgress({ done, total, label });
          },
        });
        if (!cancelled) setList(result);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recipes, provider, providerId]);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** Ersetzt das Produkt einer Zeile und rechnet Preis und Rest neu. */
  const applySwap = useCallback(
    (product: Product) => {
      if (!list || !swapping) return;
      const target = itemKey(swapping);

      const items = list.items.map((item) => {
        if (itemKey(item) !== target) return item;
        // Packungszahl bewusst beibehalten: Der Nutzer hat dieses Produkt
        // gewählt, nicht eine Menge. Verwertung und Rest werden neu
        // gerechnet, sobald die Liste neu gebaut wird.
        const packages = Math.max(1, item.packagesToBuy);
        return {
          ...item,
          product,
          packagesToBuy: packages,
          lineTotal: Math.round(packages * product.price * 100) / 100,
          needsManualMatch: false,
          note: 'Von dir gewählt',
          utilization: undefined,
          leftover: undefined,
          leftoverValue: 0,
        };
      });

      setList({ ...list, items, total: calculateTotal(items) });
      setSwapping(null);
    },
    [list, swapping],
  );

  const stats = useMemo(() => (list ? calculateStats(list) : null), [list]);
  const suggestions = useMemo(
    () => (list ? suggestRecipesForLeftovers(list, allRecipes) : []),
    [list, allRecipes],
  );

  if (error) {
    return (
      <Screen>
        <Header title="Einkaufsliste" onBack={onBack} />
        <Notice tone="warn">{error}</Notice>
      </Screen>
    );
  }

  if (!list || !stats) {
    return (
      <Screen>
        <Header title="Einkaufsliste" subtitle="wird zusammengestellt …" onBack={onBack} />
        <View style={s.loading}>
          <ActivityIndicator size="large" />
          <Text style={s.loadingText}>
            {progress.total > 0
              ? `${progress.done} von ${progress.total} — ${progress.label}`
              : 'Zutaten werden zusammengefasst …'}
          </Text>
        </View>
      </Screen>
    );
  }

  const groups = groupByCategory(list.items);
  const doneCount = list.items.filter((i) => checked.has(itemKey(i))).length;

  return (
    <Screen>
      <Header
        title="Einkaufsliste"
        subtitle={`${provider?.displayName} · ${doneCount} von ${list.items.length} erledigt`}
        onBack={onBack}
      />

      {/* Kopfzeile mit den drei Zahlen, die zählen */}
      <Pressable onPress={() => setStatsOpen(true)} style={s.summary}>
        <View style={s.summaryCell}>
          <Text style={s.summaryValue}>{euro(list.total)}</Text>
          <Text style={s.summaryLabel}>Gesamt</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryCell}>
          <Text style={s.summaryValue}>
            {stats.pricePerServing !== null ? euro(stats.pricePerServing) : '—'}
          </Text>
          <Text style={s.summaryLabel}>je Portion</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryCell}>
          <Text style={s.summaryValue}>
            {stats.utilization !== null ? `${Math.round(stats.utilization * 100)} %` : '—'}
          </Text>
          <Text style={s.summaryLabel}>verwertet</Text>
        </View>
        <Text style={s.summaryMore}>›</Text>
      </Pressable>

      {stats.unmatched > 0 ? (
        <Notice tone="warn">
          {stats.unmatched} {stats.unmatched === 1 ? 'Zutat konnte' : 'Zutaten konnten'} keinem
          Produkt zugeordnet werden und fehlen in der Summe. Tippe die Zeile an, um selbst
          eines zu wählen.
        </Notice>
      ) : null}

      <FlatList
        data={groups}
        keyExtractor={([category]) => category}
        contentContainerStyle={s.list}
        renderItem={({ item: [category, entries] }) => (
          <View style={s.group}>
            <Text style={s.groupTitle}>
              <Text style={s.groupIcon}>{categoryIcon(category)}</Text> {category}
            </Text>
            {entries.map((entry) => {
              const key = itemKey(entry);
              const isChecked = checked.has(key);
              return (
                <View key={key} style={[s.item, isChecked && s.itemChecked]}>
                  <Pressable onPress={() => toggle(key)} style={s.checkArea} hitSlop={6}>
                    <View style={[s.box, isChecked && s.boxOn]}>
                      {isChecked ? <Text style={s.boxMark}>✓</Text> : null}
                    </View>
                  </Pressable>

                  {entry.product?.imageUrl ? (
                    <Image source={{ uri: entry.product.imageUrl }} style={s.thumb} />
                  ) : (
                    <View style={[s.thumb, s.thumbEmpty]} />
                  )}

                  <Pressable style={s.itemBody} onPress={() => toggle(key)}>
                    <Text style={[s.itemTitle, isChecked && s.struck]} numberOfLines={2}>
                      {entry.product?.title ?? entry.ingredient.name}
                    </Text>
                    <Text style={s.itemMeta}>
                      {entry.packagesToBuy > 0
                        ? `${entry.packagesToBuy} × ${entry.product?.packageSize || '?'}`
                        : '—'}
                      {'  ·  für '}
                      {formatQuantity(entry.requiredQuantity)} {entry.ingredient.name}
                    </Text>

                    {entry.utilization !== undefined ? (
                      <View style={s.utilRow}>
                        <Petals value={entry.utilization} />
                        <Text style={s.utilText}>
                          {Math.round(entry.utilization * 100)} %
                          {entry.leftover && entry.leftover.amount > 0
                            ? ` · Rest ${formatQuantity(entry.leftover)}`
                            : ''}
                        </Text>
                      </View>
                    ) : null}

                    {entry.note ? <Text style={s.itemNote}>{entry.note}</Text> : null}
                  </Pressable>

                  <View style={s.right}>
                    {entry.needsManualMatch ? (
                      <Text style={s.missing}>fehlt</Text>
                    ) : (
                      <Text style={s.price}>{euro(entry.lineTotal)}</Text>
                    )}
                    {entry.product?.isOnSale ? <Text style={s.bonus}>BONUS</Text> : null}
                    <Pressable onPress={() => setSwapping(entry)} hitSlop={6}>
                      <Text style={s.swap}>ändern</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        ListFooterComponent={
          suggestions.length > 0 ? (
            <View style={s.suggestBox}>
              <Text style={s.suggestTitle}>Reste verwerten</Text>
              <Text style={s.suggestIntro}>
                Diese Rezepte würden aufbrauchen, was sonst übrig bleibt:
              </Text>
              {suggestions.map((sug) => (
                <View key={sug.recipe.id} style={s.suggestRow}>
                  <View style={s.itemBody}>
                    <Text style={s.suggestName}>{sug.recipe.title}</Text>
                    <Text style={s.suggestUses}>
                      {sug.uses
                        .map((u) => `${u.ingredientName} (${Math.round(u.share * 100)} %)`)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={s.suggestValue}>{euro(sug.value)}</Text>
                </View>
              ))}
              <Text style={s.suggestHint}>
                Der Betrag ist der Wert der Reste, den das Rezept rettet. Leg es im
                Wochenplan auf einen freien Tag.
              </Text>
            </View>
          ) : null
        }
      />

      {/* Statistikfenster */}
      <Modal visible={statsOpen} animationType="slide" onRequestClose={() => setStatsOpen(false)}>
        <Screen>
          <Header
            title="Statistik"
            subtitle={`${recipes.length} ${recipes.length === 1 ? 'Gericht' : 'Gerichte'} · ${provider?.displayName}`}
            onBack={() => setStatsOpen(false)}
          />
          <FlatList
            data={[0]}
            keyExtractor={() => 'stats'}
            contentContainerStyle={s.statsBody}
            renderItem={() => (
              <>
                <View style={s.statCard}>
                  <Text style={s.statBig}>{euro(stats.total)}</Text>
                  <Text style={s.statBigLabel}>
                    für {stats.servings} Portionen ·{' '}
                    {stats.pricePerServing !== null ? `${euro(stats.pricePerServing)} je Portion` : '—'}
                  </Text>
                </View>

                <View style={[s.statCard, s.statCardCenter]}>
                  <Text style={s.statHead}>Verwertung</Text>
                  <Sunflower value={stats.utilization} size={144} />
                  {stats.utilization !== null ? (
                    <>
                      <Text style={s.statLine}>
                        {Math.round(stats.utilization * 100)} % von dem, was du kaufst, wird auch
                        verkocht.
                      </Text>
                      <Text style={s.statMuted}>
                        Für {euro(stats.leftoverValue)} bleibt etwas übrig — nicht verdorben,
                        aber diese Woche nicht eingeplant.
                      </Text>
                    </>
                  ) : (
                    <Text style={s.statMuted}>Nicht berechenbar für diese Liste.</Text>
                  )}

                  {/* Kees urteilt — ein Satz statt einer Tabelle. */}
                  <View style={s.kees}>
                    <Kees size={62} mood={moodForUtilization(stats.utilization)} />
                    <Text style={s.keesText}>
                      {keesSays(moodForUtilization(stats.utilization), stats.leftoverValue)}
                    </Text>
                  </View>
                </View>

                <View style={s.statCard}>
                  <Text style={s.statHead}>Einkauf</Text>
                  <View style={s.statRow}>
                    <Text style={s.statKey}>Positionen</Text>
                    <Text style={s.statVal}>{stats.matched + stats.unmatched}</Text>
                  </View>
                  <View style={s.statRow}>
                    <Text style={s.statKey}>Packungen im Wagen</Text>
                    <Text style={s.statVal}>{stats.packages}</Text>
                  </View>
                  <View style={s.statRow}>
                    <Text style={s.statKey}>Ohne Produkt</Text>
                    <Text style={[s.statVal, stats.unmatched > 0 && s.statBad]}>
                      {stats.unmatched}
                    </Text>
                  </View>
                  {stats.mostExpensive?.product ? (
                    <View style={s.statRow}>
                      <Text style={s.statKey}>Teuerste Position</Text>
                      <Text style={s.statVal} numberOfLines={1}>
                        {euro(stats.mostExpensive.lineTotal)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {stats.mostExpensive?.product ? (
                  <Text style={s.statFoot}>
                    Teuerste Position: {stats.mostExpensive.product.title}. Wenn dir der Preis
                    zu hoch ist, tausche das Produkt in der Liste über „ändern".
                  </Text>
                ) : null}
              </>
            )}
          />
        </Screen>
      </Modal>

      {/* Produkt tauschen */}
      <Modal visible={swapping !== null} animationType="slide" onRequestClose={() => setSwapping(null)}>
        {swapping ? (
          <ProductSearchScreen
            providerId={providerId}
            initialQuery={swapping.ingredient.searchTermNl ?? swapping.ingredient.name}
            onPick={applySwap}
            onCancel={() => setSwapping(null)}
          />
        ) : null}
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  loading: { alignItems: 'center', paddingTop: 72, gap: spacing.lg },
  loadingText: { color: colors.textMuted, fontSize: 14 },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 17, fontWeight: '700', color: colors.primary },
  summaryLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: colors.border },
  summaryMore: { fontSize: 20, color: colors.textFaint, paddingHorizontal: spacing.sm },

  list: { padding: spacing.lg, gap: spacing.xl },
  group: { gap: spacing.sm },
  groupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  groupIcon: { fontSize: 15 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  itemChecked: { opacity: 0.5 },
  checkArea: { padding: 2 },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxMark: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  thumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbEmpty: { backgroundColor: '#f0f0ee', borderWidth: 1, borderColor: colors.border },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  struck: { textDecorationLine: 'line-through' },
  itemMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  itemNote: { fontSize: 11, color: colors.alarm, marginTop: 3, lineHeight: 16 },

  utilRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  utilText: { fontSize: 11, color: colors.textFaint, marginTop: spacing.xs },

  right: { alignItems: 'flex-end', minWidth: 62, gap: 3 },
  price: { fontSize: 15, fontWeight: '700', color: colors.primary },
  missing: { fontSize: 12, color: colors.alarm, fontWeight: '600' },
  bonus: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: colors.alarm,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  swap: { fontSize: 11, color: colors.textMuted, textDecorationLine: 'underline' },

  suggestBox: {
    marginTop: spacing.xl,
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  suggestTitle: { fontSize: 15, fontWeight: '700', color: colors.primary },
  suggestIntro: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  suggestName: { fontSize: 14, fontWeight: '600', color: colors.text },
  suggestUses: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  suggestValue: { fontSize: 14, fontWeight: '700', color: colors.primary },
  suggestHint: { fontSize: 11, color: colors.textFaint, lineHeight: 16 },

  statsBody: { padding: spacing.lg, gap: spacing.md },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statCardCenter: { alignItems: 'center' },
  kees: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
  keesText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  statBig: { fontSize: 34, fontWeight: '700', color: colors.primary },
  statBigLabel: { fontSize: 13, color: colors.textMuted },
  statHead: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  statLine: { fontSize: 14, color: colors.text, lineHeight: 20 },
  statMuted: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statKey: { fontSize: 13, color: colors.textMuted },
  statVal: { fontSize: 14, fontWeight: '600', color: colors.text },
  statBad: { color: colors.alarm },
  statFoot: { fontSize: 12, color: colors.textFaint, lineHeight: 18, paddingHorizontal: spacing.xs },
});
