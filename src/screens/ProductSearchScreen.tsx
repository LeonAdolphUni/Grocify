/**
 * Produktsuche im Supermarkt-Sortiment.
 *
 * Wird beim Anlegen eines Rezepts geöffnet: Der Nutzer sucht das echte
 * Produkt und wählt es aus. Damit entfällt für diese Zutat jede
 * Übersetzung und jedes Raten — die Zuordnung steht fest.
 */

import { useCallback, useState } from 'react';
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
import { ProviderError } from '../supermarkets/types';
import { Header, Screen } from '../ui/components';
import { colors, euro, radius, spacing } from '../ui/theme';

interface Props {
  providerId: string;
  /** Vorbelegung des Suchfelds, meist der bereits getippte Zutatenname. */
  initialQuery?: string;
  onPick: (product: Product) => void;
  onCancel: () => void;
}

export function ProductSearchScreen({ providerId, initialQuery = '', onPick, onCancel }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = getProvider(providerId);

  const search = useCallback(async () => {
    const term = query.trim();
    if (!term || !provider) return;

    setLoading(true);
    setError(null);
    try {
      const result = await provider.searchProducts(term, { size: 25 });
      setProducts(result.products);
      setTotal(result.totalResults);
    } catch (err) {
      setProducts([]);
      setTotal(null);
      setError(
        err instanceof ProviderError
          ? err.message
          : `Suche fehlgeschlagen: ${(err as Error).message}`,
      );
    } finally {
      setLoading(false);
    }
  }, [provider, query]);

  return (
    <Screen>
      <Header
        title="Produkt suchen"
        subtitle={provider?.displayName ?? providerId}
        onBack={onCancel}
      />

      <View style={s.searchBar}>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          placeholder="z. B. tarwebloem, melk, gehakt"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
        <Pressable
          style={({ pressed }) => [s.btn, pressed && s.btnPressed]}
          onPress={search}
        >
          <Text style={s.btnText}>Suchen</Text>
        </Pressable>
      </View>

      <Text style={s.hint}>
        Suchbegriffe sind niederländisch — so heißen die Produkte im Regal.
      </Text>

      {error ? <Text style={s.error}>{error}</Text> : null}

      {total !== null && !loading ? (
        <Text style={s.count}>
          {total.toLocaleString('de-DE')} Treffer — die ersten {products.length}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator style={s.loader} size="large" />
      ) : (
        <FlatList
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
            error ? null : (
              <Text style={s.empty}>
                Tippe einen Suchbegriff ein und wähle das Produkt, das du
                tatsächlich kaufen würdest.
              </Text>
            )
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
  hint: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    fontSize: 12,
    color: colors.textFaint,
  },
  count: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 13, color: colors.textMuted },
  loader: { marginTop: 48 },
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
  priceSale: { color: colors.accent },
  struck: { fontSize: 11, color: colors.textFaint, textDecorationLine: 'line-through' },
  gone: { fontSize: 10, color: colors.danger, marginTop: 2 },
  error: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    color: colors.danger,
    fontSize: 13,
  },
  empty: {
    textAlign: 'center',
    color: colors.textFaint,
    marginTop: 56,
    paddingHorizontal: spacing.xxl,
    lineHeight: 20,
  },
});
