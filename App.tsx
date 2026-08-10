/**
 * Sprint 0 – Durchstich.
 *
 * Kein fertiges Feature, sondern der Beweis, dass die Kette steht:
 * App → PriceProvider → Albert Heijn → echte Preise auf dem Gerät.
 * Die Rezept-Eingabe kommt in Sprint 3, die Einkaufsliste in Sprint 8.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

import type { Product } from './src/domain/types';
import { AlbertHeijnProvider } from './src/supermarkets/albertHeijn';
import { ProviderError } from './src/supermarkets/types';

const euro = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

function ProductRow({ product }: { product: Product }) {
  return (
    <View style={styles.row}>
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}

      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={2}>
          {product.title}
        </Text>

        <Text style={styles.meta}>
          {[product.packageSize, product.category].filter(Boolean).join(' · ')}
        </Text>

        {product.unitPriceDescription ? (
          <Text style={styles.unitPrice}>{product.unitPriceDescription}</Text>
        ) : null}
      </View>

      <View style={styles.priceBox}>
        <Text style={[styles.price, product.isOnSale && styles.priceSale]}>
          {euro(product.price)}
        </Text>
        {product.priceBeforeDiscount !== undefined ? (
          <Text style={styles.priceStruck}>{euro(product.priceBeforeDiscount)}</Text>
        ) : null}
        {product.isOnSale ? <Text style={styles.bonusTag}>BONUS</Text> : null}
      </View>
    </View>
  );
}

export default function App() {
  const [query, setQuery] = useState('tarwebloem');
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Der Provider hält den Auth-Token im Speicher — über Renders hinweg erhalten,
  // sonst wird bei jeder Suche ein neuer Token gezogen.
  const provider = useMemo(() => new AlbertHeijnProvider(), []);

  const search = useCallback(async () => {
    const term = query.trim();
    if (!term) return;

    setLoading(true);
    setError(null);
    try {
      const result = await provider.searchProducts(term, { size: 20 });
      setProducts(result.products);
      setTotal(result.totalResults);
    } catch (err) {
      setProducts([]);
      setTotal(null);
      setError(
        err instanceof ProviderError
          ? `${provider.displayName}: ${err.message}`
          : `Netzwerkfehler: ${(err as Error).message}`,
      );
    } finally {
      setLoading(false);
    }
  }, [provider, query]);

  return (
    <View style={styles.screen}>
      <ExpoStatusBar style="dark" />
      <View style={styles.container}>

      <View style={styles.header}>
        <Text style={styles.brand}>Grocify</Text>
        <Text style={styles.subtitle}>Sortiment {provider.displayName}</Text>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          placeholder="Produkt suchen, z. B. tarwebloem"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={search}
        >
          <Text style={styles.buttonText}>Suchen</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {total !== null && !loading ? (
        <Text style={styles.resultCount}>
          {total.toLocaleString('de-DE')} Treffer — die ersten {products.length}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProductRow product={item} />}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            error ? null : (
              <Text style={styles.empty}>
                Noch keine Suche. Tippe einen Begriff ein — die Preise kommen live
                aus dem Albert-Heijn-Sortiment.
              </Text>
            )
          }
        />
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f5',
    // iOS braucht Platz für die Notch, Android für die Statusleiste,
    // im Browser reicht normaler Seitenabstand.
    paddingTop: Platform.select({
      ios: 60,
      android: (StatusBar.currentHeight ?? 0) + 12,
      default: 28,
    }),
  },
  /**
   * Begrenzt die Inhaltsbreite. Ohne das zieht sich die Liste auf einem
   * Desktop-Monitor über die volle Fensterbreite und wird unlesbar.
   */
  container: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  brand: { fontSize: 30, fontWeight: '700', color: '#12351f', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  searchBar: { flexDirection: 'row', paddingHorizontal: 20, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e3e3df',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#12351f',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  resultCount: { paddingHorizontal: 20, paddingTop: 14, color: '#6b7280', fontSize: 13 },
  loader: { marginTop: 48 },
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 12,
  },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f0f0ee' },
  thumbEmpty: { borderWidth: 1, borderColor: '#e3e3df' },
  rowBody: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  unitPrice: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  priceBox: { alignItems: 'flex-end', minWidth: 72 },
  price: { fontSize: 16, fontWeight: '700', color: '#12351f' },
  priceSale: { color: '#c2410c' },
  priceStruck: {
    fontSize: 12,
    color: '#9ca3af',
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
  bonusTag: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#c2410c',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  error: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    color: '#991b1b',
    fontSize: 13,
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 56,
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
