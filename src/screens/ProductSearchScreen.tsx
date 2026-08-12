/**
 * Produkte finden — durch Stöbern oder durch Suchen.
 *
 * Der Einstieg sind die Abteilungen des Marktes, nicht ein leeres
 * Suchfeld: Wer ein Rezept anlegt, weiß oft „irgendwas mit Gemüse", aber
 * nicht, dass Zwiebeln auf Niederländisch „ui" heißen. Gesucht werden kann
 * jederzeit zusätzlich.
 *
 * Drei Ebenen: Abteilung → Unterabteilung → Produkte. Die Suche ist ein
 * eigener Zweig, der jede Ebene überspringt.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Product } from '../domain/types';
import { getProvider } from '../supermarkets/registry';
import { ProviderError, type Category } from '../supermarkets/types';
import { Header, Screen } from '../ui/components';
import { colors, euro, radius, spacing } from '../ui/theme';

/** Wo im Bildschirm wir gerade sind. */
type Level =
  | { kind: 'departments' }
  | { kind: 'sub'; parent: Category }
  /** `parent` merkt sich, wohin „Zurück" führt. */
  | { kind: 'products'; category: Category; parent?: Category }
  | { kind: 'search'; query: string };

interface Props {
  providerId: string;
  initialQuery?: string;
  onPick: (product: Product) => void;
  onCancel: () => void;
}

export function ProductSearchScreen({ providerId, initialQuery = '', onPick, onCancel }: Props) {
  const provider = getProvider(providerId);

  const [query, setQuery] = useState(initialQuery);
  // Wurde der Zutatenname schon getippt, ist die Suche danach der schnellste
  // Weg. Ohne Vorgabe steigt man bei den Abteilungen ein.
  const [view, setView] = useState<Level>(
    initialQuery.trim()
      ? { kind: 'search', query: initialQuery.trim() }
      : { kind: 'departments' },
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Lädt, was die aktuelle Ebene braucht. */
  useEffect(() => {
    if (!provider) {
      setError(`Unbekannter Supermarkt: ${providerId}`);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        if (view.kind === 'departments') {
          const cats = await provider.getCategories();
          if (!cancelled) {
            setCategories(cats);
            setProducts([]);
            setTotal(null);
          }
        } else if (view.kind === 'sub') {
          const subs = await provider.getSubCategories(view.parent.id);
          if (!cancelled) {
            setCategories(subs);
            setProducts([]);
            setTotal(null);
          }
        } else if (view.kind === 'products') {
          const result = await provider.browseCategory(view.category.id, { size: 40 });
          if (!cancelled) {
            setProducts(result.products);
            setTotal(result.totalResults);
            setCategories([]);
          }
        } else {
          const result = await provider.searchProducts(view.query, { size: 40 });
          if (!cancelled) {
            setProducts(result.products);
            setTotal(result.totalResults);
            setCategories([]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setProducts([]);
          setCategories([]);
          setError(
            err instanceof ProviderError ? err.message : `Fehler: ${(err as Error).message}`,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provider, providerId, view]);

  const runSearch = useCallback(() => {
    const term = query.trim();
    if (term) setView({ kind: 'search', query: term });
  }, [query]);

  /** Eine Ebene zurück — oder raus, wenn wir schon ganz oben sind. */
  const goBack = () => {
    if (view.kind === 'departments') return onCancel();
    if (view.kind === 'products' && view.parent) return setView({ kind: 'sub', parent: view.parent });
    setView({ kind: 'departments' });
  };

  const subtitle =
    view.kind === 'departments'
      ? `${provider?.displayName ?? providerId} · Abteilung wählen`
      : view.kind === 'sub'
        ? view.parent.name
        : view.kind === 'products'
          ? `${view.category.name}${total !== null ? ` · ${total.toLocaleString('de-DE')} Produkte` : ''}`
          : `Suche „${view.query}"${total !== null ? ` · ${total.toLocaleString('de-DE')} Treffer` : ''}`;

  return (
    <Screen>
      <Header title="Produkt wählen" subtitle={subtitle} onBack={goBack} />

      <View style={s.searchBar}>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          placeholder="Suchen, z. B. tarwebloem"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Pressable
          style={({ pressed }) => [s.btn, pressed && s.btnPressed]}
          onPress={runSearch}
        >
          <Text style={s.btnText}>Suchen</Text>
        </Pressable>
      </View>

      {view.kind !== 'departments' ? (
        <Pressable onPress={() => setView({ kind: 'departments' })} style={s.crumb}>
          <Text style={s.crumbText}>← Alle Abteilungen</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={s.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={s.loader} size="large" />
      ) : categories.length > 0 ? (
        <FlatList
          key="cats"
          data={categories}
          keyExtractor={(c) => c.id}
          numColumns={2}
          columnWrapperStyle={s.gridRow}
          contentContainerStyle={s.grid}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            view.kind === 'sub' ? (
              <Pressable
                onPress={() => setView({ kind: 'products', category: view.parent })}
                style={({ pressed }) => [s.allBtn, pressed && s.tilePressed]}
              >
                <Text style={s.allBtnText}>Alles aus „{view.parent.name}" zeigen</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                view.kind === 'departments'
                  ? setView({ kind: 'sub', parent: item })
                  : setView({
                      kind: 'products',
                      category: item,
                      parent: view.kind === 'sub' ? view.parent : undefined,
                    })
              }
              style={({ pressed }) => [s.tile, pressed && s.tilePressed]}
            >
              {item.imageUrl ? (
                // "contain" statt "cover": Die Unterabteilungen nutzen
                // quadratische Produktfotos mit Beschriftung. Beschnitten
                // auf ein flaches Band schneidet das den Text ab.
                <Image source={{ uri: item.imageUrl }} style={s.tileImg} resizeMode="contain" />
              ) : (
                <View style={[s.tileImg, s.tileImgEmpty]} />
              )}
              <Text style={s.tileText} numberOfLines={2}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="prods"
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={s.thumb} />
              ) : (
                <View style={[s.thumb, s.thumbEmpty]} />
              )}

              <View style={s.body}>
                <Text style={s.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={s.meta}>
                  {[item.packageSize, item.category].filter(Boolean).join(' · ')}
                </Text>
                {item.unitPriceDescription ? (
                  <Text style={s.unitPrice}>{item.unitPriceDescription}</Text>
                ) : null}
              </View>

              <View style={s.priceBox}>
                <Text style={[s.price, item.isOnSale && s.priceSale]}>{euro(item.price)}</Text>
                {item.priceBeforeDiscount !== undefined ? (
                  <Text style={s.struck}>{euro(item.priceBeforeDiscount)}</Text>
                ) : null}
                {!item.isAvailable ? <Text style={s.gone}>nicht verfügbar</Text> : null}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            error ? null : <Text style={s.empty}>Keine Produkte gefunden.</Text>
          }
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  searchBar: { flexDirection: 'row', paddingHorizontal: spacing.xl, gap: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.75 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  crumb: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  crumbText: { fontSize: 13, color: colors.textMuted },

  loader: { marginTop: 48 },

  grid: { padding: spacing.lg, gap: spacing.md },
  gridRow: { gap: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tilePressed: { borderColor: colors.primary },
  tileImg: { width: '100%', height: 128, backgroundColor: colors.surface },
  tileImgEmpty: { backgroundColor: '#f0f0ee', borderBottomWidth: 1, borderBottomColor: colors.border },
  tileText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    padding: spacing.md,
    lineHeight: 18,
  },
  allBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  allBtnText: { color: colors.primary, fontWeight: '600', fontSize: 14 },

  list: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowPressed: { borderColor: colors.primary, backgroundColor: '#fbfbfa' },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: '#f0f0ee' },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  unitPrice: { fontSize: 11, color: colors.textFaint, marginTop: 1 },
  priceBox: { alignItems: 'flex-end', minWidth: 66 },
  price: { fontSize: 15, fontWeight: '700', color: colors.primary },
  priceSale: { color: colors.alarm },
  struck: { fontSize: 11, color: colors.textFaint, textDecorationLine: 'line-through' },
  gone: { fontSize: 10, color: colors.alarm, marginTop: 2 },

  error: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.alarmBg,
    borderRadius: radius.md,
    color: colors.alarm,
    fontSize: 13,
  },
  empty: { textAlign: 'center', color: colors.textFaint, marginTop: 56 },
});
