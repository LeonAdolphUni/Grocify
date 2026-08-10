/**
 * Schritt 3: die fertige Einkaufsliste.
 *
 * Zeigt pro Zeile, was gekauft wird, wie viele Packungen und was es kostet —
 * getrennt vom eigentlichen Bedarf des Rezepts. Diese Trennung ist der
 * Punkt: 200 g Mehl gebraucht, 1 Packung à 500 g gekauft.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { buildShoppingList } from '../domain/shoppingList';
import type { Recipe, ShoppingList, ShoppingListItem } from '../domain/types';
import { formatQuantity } from '../domain/units';
import { getProvider } from '../supermarkets/registry';
import { Header, Notice, Screen } from '../ui/components';
import { colors, euro, radius, spacing } from '../ui/theme';

interface Props {
  recipes: Recipe[];
  providerId: string;
  onBack: () => void;
}

/** Gruppiert die Zeilen nach Supermarkt-Abteilung, damit der Laufweg im Laden stimmt. */
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

export function ShoppingListScreen({ recipes, providerId, onBack }: Props) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

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

  if (error) {
    return (
      <Screen>
        <Header title="Einkaufsliste" onBack={onBack} />
        <Notice tone="warn">{error}</Notice>
      </Screen>
    );
  }

  if (!list) {
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
  const problems = list.items.filter((i) => i.needsManualMatch).length;
  const notes = list.items.filter((i) => i.note && !i.needsManualMatch).length;

  return (
    <Screen>
      <Header
        title="Einkaufsliste"
        subtitle={`${provider?.displayName} · ${list.items.length} Positionen`}
        onBack={onBack}
      />

      {problems > 0 ? (
        <Notice tone="warn">
          {problems} {problems === 1 ? 'Zutat konnte' : 'Zutaten konnten'} keinem Produkt
          zugeordnet werden. Diese Positionen sind unten markiert und fehlen in der Summe.
        </Notice>
      ) : null}

      <FlatList
        data={groups}
        keyExtractor={([category]) => category}
        contentContainerStyle={s.list}
        renderItem={({ item: [category, entries] }) => (
          <View style={s.group}>
            <Text style={s.groupTitle}>{category}</Text>
            {entries.map((entry) => {
              const key = `${entry.ingredient.id}-${entry.product?.id ?? 'none'}`;
              const isChecked = checked.has(key);
              return (
                <Pressable key={key} onPress={() => toggle(key)}>
                  <View style={[s.item, isChecked && s.itemChecked]}>
                    <View style={[s.box, isChecked && s.boxOn]}>
                      {isChecked ? <Text style={s.boxMark}>✓</Text> : null}
                    </View>

                    <View style={s.itemBody}>
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
                      {entry.note ? <Text style={s.itemNote}>{entry.note}</Text> : null}
                    </View>

                    <View style={s.priceCol}>
                      {entry.needsManualMatch ? (
                        <Text style={s.missing}>fehlt</Text>
                      ) : (
                        <>
                          <Text style={s.price}>{euro(entry.lineTotal)}</Text>
                          {entry.product?.isOnSale ? (
                            <Text style={s.bonus}>BONUS</Text>
                          ) : null}
                        </>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        ListFooterComponent={
          notes > 0 ? (
            <Text style={s.footnote}>
              {notes} {notes === 1 ? 'Position hat' : 'Positionen haben'} einen Hinweis zur
              Mengenumrechnung — bitte kurz prüfen.
            </Text>
          ) : null
        }
      />

      <View style={s.totalBar}>
        <View>
          <Text style={s.totalLabel}>Gesamtpreis</Text>
          <Text style={s.totalHint}>
            gekaufte Packungen, nicht anteiliger Verbrauch
          </Text>
        </View>
        <Text style={s.totalValue}>{euro(list.total)}</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  loading: { alignItems: 'center', paddingTop: 72, gap: spacing.lg },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  list: { padding: spacing.lg, gap: spacing.xl },
  group: { gap: spacing.sm },
  groupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  itemChecked: { opacity: 0.55 },
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
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  struck: { textDecorationLine: 'line-through' },
  itemMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  itemNote: { fontSize: 11, color: colors.accent, marginTop: 3, lineHeight: 16 },
  priceCol: { alignItems: 'flex-end', minWidth: 62 },
  price: { fontSize: 15, fontWeight: '700', color: colors.primary },
  missing: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  bonus: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: colors.accent,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  footnote: {
    fontSize: 12,
    color: colors.textFaint,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  totalLabel: { fontSize: 13, color: colors.textMuted },
  totalHint: { fontSize: 11, color: colors.textFaint, marginTop: 1 },
  totalValue: { fontSize: 26, fontWeight: '700', color: colors.primary },
});
