/**
 * Rezepte von Chefkoch ins eigene Buch holen.
 *
 * Suchen, antippen, fertig — die Zutaten stehen danach in deinem Rezept und
 * werden beim Einkauf wie jedes selbst angelegte behandelt.
 *
 * Was übernommen wird, ist eine bewusste Auswahl: Titel, Portionen, Zutaten
 * und der Link zum Original. **Der Zubereitungstext bleibt drüben.**
 * Zutatenlisten sind in Deutschland in der Regel nicht urheberrechtlich
 * geschützt, Zubereitungstexte schon — und zum Planen eines Einkaufs
 * braucht die App sie nicht. Zum Kochen führt der Link zurück zum Original.
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

import { ApiError, api, type ImportHit } from '../api/client';
import { Header, Notice, Screen } from '../ui/components';
import { DownloadIcon, PlateIcon } from '../ui/icons';
import { colors, radius, spacing } from '../ui/theme';

interface Props {
  onImported: (title: string) => void;
  onBack: () => void;
}

export function ImportScreen({ onImported, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ImportHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Welcher Treffer gerade übernommen wird. */
  const [importing, setImporting] = useState<string | null>(null);
  /** Chefkoch-ID → war es neu oder lag es schon im Buch? */
  const [done, setDone] = useState<Record<string, 'neu' | 'schon da'>>({});

  const search = useCallback(async () => {
    const term = query.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    try {
      setHits(await api.searchImport(term));
    } catch (err) {
      setHits(null);
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const doImport = useCallback(
    async (hit: ImportHit) => {
      setImporting(hit.id);
      setError(null);
      try {
        const result = await api.importRecipe(hit.id);
        setDone((d) => ({ ...d, [hit.id]: result.alreadyInBook ? 'schon da' : 'neu' }));
        onImported(result.recipe.title);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : (err as Error).message);
      } finally {
        setImporting(null);
      }
    },
    [onImported],
  );

  return (
    <Screen>
      <Header
        title="Rezept importieren"
        subtitle="Suche bei Chefkoch"
        onBack={onBack}
        tone="sun"
      />

      <View style={s.searchBar}>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          placeholder="z. B. Bolognese, Kürbissuppe, Lasagne"
          returnKeyType="search"
          autoFocus
        />
        <Pressable
          onPress={search}
          style={({ pressed }) => [s.btn, pressed && s.pressed]}
        >
          <Text style={s.btnText}>Suchen</Text>
        </Pressable>
      </View>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {loading ? (
        <ActivityIndicator style={s.loader} size="large" />
      ) : (
        <FlatList
          data={hits ?? []}
          keyExtractor={(h) => h.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            error ? null : (
              <View style={s.empty}>
                <DownloadIcon size={34} color={colors.textFaint} />
                <Text style={s.emptyText}>
                  {hits === null
                    ? 'Suche nach einem Gericht. Übernommen werden Titel, Portionen und Zutaten — die Zubereitung bleibt bei Chefkoch, dorthin führt ein Link.'
                    : 'Keine Treffer. Versuch einen anderen Begriff.'}
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const state = done[item.id];
            const busy = importing === item.id;
            return (
              <Pressable
                onPress={() => !state && !busy && doImport(item)}
                disabled={Boolean(state) || busy}
                style={({ pressed }) => [s.row, pressed && s.rowPressed, state && s.rowDone]}
              >
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={s.thumb} />
                ) : (
                  <View style={[s.thumb, s.thumbEmpty]}>
                    <PlateIcon size={26} color={colors.textFaint} />
                  </View>
                )}

                <View style={s.body}>
                  <Text style={s.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.subtitle ? (
                    <Text style={s.subtitle} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                  <Text style={s.meta}>
                    {item.rating ? `★ ${item.rating.toFixed(1)}` : 'ohne Bewertung'}
                    {item.ratingCount ? ` (${item.ratingCount})` : ''}
                    {item.preparationTime ? ` · ${item.preparationTime} Min` : ''}
                  </Text>
                </View>

                <View style={s.action}>
                  {busy ? (
                    <ActivityIndicator size="small" />
                  ) : state ? (
                    // „schon da" statt „✓" ist keine Kosmetik: Sonst denkt
                    // man, gerade sei etwas passiert, und sucht in der Liste
                    // nach einem zweiten Eintrag.
                    <Text style={s.doneText}>
                      {state === 'neu' ? '✓ im Buch' : 'schon da'}
                    </Text>
                  ) : (
                    <Text style={s.addText}>+ holen</Text>
                  )}
                </View>
              </Pressable>
            );
          }}
          ListFooterComponent={
            hits && hits.length > 0 ? (
              <Text style={s.foot}>
                Chefkoch bietet keine offizielle Schnittstelle an — der Import nutzt
                das Backend ihrer App. Es funktioniert, kann aber ohne Vorwarnung
                wegfallen.
              </Text>
            ) : null
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
  pressed: { opacity: 0.75 },
  btnText: { color: colors.onDark, fontWeight: '700', fontSize: 15 },

  loader: { marginTop: 48 },
  list: { padding: spacing.lg, gap: spacing.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowPressed: { borderColor: colors.sun },
  rowDone: { backgroundColor: colors.successBg, borderColor: colors.frog },
  thumb: { width: 62, height: 62, borderRadius: radius.md, backgroundColor: colors.sunSoft },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { fontSize: 26 },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  meta: { fontSize: 11, color: colors.textFaint, marginTop: 3 },
  action: { minWidth: 62, alignItems: 'flex-end' },
  addText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  doneText: { fontSize: 12, fontWeight: '700', color: colors.frog },

  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyIcon: { fontSize: 34 },
  emptyText: { fontSize: 14, color: colors.textFaint, textAlign: 'center', lineHeight: 21 },
  foot: {
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 17,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
});
