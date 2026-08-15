/**
 * Rezepte aus Albert Heijns Allerhande ins eigene Buch holen.
 *
 * Zwei Reiter, weil es zwei verschiedene Absichten sind:
 *
 *   **Suchen** — du weißt, was du willst, und tippst es ein.
 *   **Stöbern** — du weißt es nicht und willst sehen, was es gibt.
 *
 * Ein Suchfeld allein bedient nur die erste. Wer nicht weiß, wonach er suchen
 * soll, steht davor wie vor einer leeren Seite.
 *
 * **Die Suche übersetzt.** Allerhande ist niederländisch; wer „Eiersalat"
 * eingibt, sucht dort nach einem Wort, das es nicht gibt, und bekommt nichts.
 * Der Begriff wird deshalb vor der Suche übersetzt — und die Übersetzung steht
 * sichtbar unter dem Feld. Wer „Eiersalat" tippt und Ergebnisse zu
 * „eiersalade" bekommt, soll den Grund sehen; und wenn es einmal danebengeht,
 * auch den Fehler.
 *
 * **Warum AH und nicht mehr Chefkoch.** Allerhande-Rezepte tragen die Namen,
 * unter denen AH die Produkte verkauft: Was hier importiert wird, gibt es im
 * Laden. Gemessen an fünf Rezepten: 88 % der Zutaten finden sofort ihr Produkt.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError, api, type ImportHit, type RecipeCategory } from '../api/client';
import {
  describeTranslation,
  SEARCH_LANGUAGES,
  type SearchLanguage,
} from '../domain/searchLanguage';
import { Header, Notice, Screen } from '../ui/components';
import { DownloadIcon } from '../ui/icons';
import { RecipeThumb } from '../ui/RecipeThumb';
import { colors, fonts, radius, spacing } from '../ui/theme';

interface Props {
  language: SearchLanguage;
  onChangeLanguage: (l: SearchLanguage) => void;
  onImported: (title: string) => void;
  onBack: () => void;
}

type Tab = 'suche' | 'katalog';

export function ImportScreen({ language, onChangeLanguage, onImported, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('suche');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ImportHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, 'neu' | 'schon da'>>({});

  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [group, setGroup] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const uebersetzung = useMemo(() => describeTranslation(query, language), [query, language]);

  useEffect(() => {
    void api
      .listCategories()
      .then((c) => {
        setCategories(c);
        setGroup((g) => g ?? c[0]?.group ?? null);
      })
      .catch(() => {
        // Der Katalog ist Beiwerk — die Suche funktioniert auch ohne ihn.
      });
  }, []);

  const groups = useMemo(() => [...new Set(categories.map((c) => c.group))], [categories]);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setActiveSlug(null);
    try {
      // Übersetzt wird hier, nicht im Backend: Die Oberfläche zeigt an, wonach
      // sie sucht, und beides muss dieselbe Zeichenkette sein.
      setHits(await api.searchImport(uebersetzung.translated));
    } catch (err) {
      setHits(null);
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query, uebersetzung.translated]);

  const openCategory = useCallback(async (slug: string) => {
    setActiveSlug(slug);
    setLoading(true);
    setError(null);
    try {
      setHits(await api.browseCategory(slug));
    } catch (err) {
      setHits(null);
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const doImport = useCallback(
    async (hit: ImportHit) => {
      setImporting(hit.id);
      setError(null);
      try {
        const result = await api.importRecipe(hit.path);
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

  const sprache = SEARCH_LANGUAGES.find((l) => l.id === language) ?? SEARCH_LANGUAGES[0];

  return (
    <Screen>
      <Header
        tone="sun"
        title="Rezepte holen"
        subtitle="Albert Heijn Allerhande"
        onBack={onBack}
        extra={
          <View style={s.tabs}>
            {(['suche', 'katalog'] as Tab[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  setTab(t);
                  setHits(null);
                  setError(null);
                  setActiveSlug(null);
                }}
                style={({ pressed }) => [s.tab, tab === t && s.tabOn, pressed && s.pressed]}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
              >
                <Text style={[s.tabText, tab === t && s.tabTextOn]}>
                  {t === 'suche' ? 'Suchen' : 'Stöbern'}
                </Text>
              </Pressable>
            ))}
          </View>
        }
      />

      {tab === 'suche' ? (
        <View style={s.searchArea}>
          <View style={s.langRow}>
            <Text style={s.langLabel}>Ich suche auf</Text>
            {SEARCH_LANGUAGES.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => onChangeLanguage(l.id)}
                style={({ pressed }) => [
                  s.langBtn,
                  language === l.id && s.langBtnOn,
                  pressed && s.pressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: language === l.id }}
              >
                <Text style={[s.langText, language === l.id && s.langTextOn]}>{l.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={s.searchBar}>
            <TextInput
              style={s.input}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              placeholder={sprache.hint}
              returnKeyType="search"
            />
            <Pressable onPress={search} style={({ pressed }) => [s.btn, pressed && s.pressed]}>
              <Text style={s.btnText}>Suchen</Text>
            </Pressable>
          </View>

          {uebersetzung.changed ? (
            <Text style={s.translated}>
              gesucht wird nach{' '}
              <Text style={s.translatedStrong}>{uebersetzung.translated}</Text>
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={s.catalogArea}>
          {/* Zwei Ebenen statt einer langen Liste: oben die Gruppe, darunter
              die Kategorie. 21 Kacheln nebeneinander wären keine Ordnung,
              sondern eine Wand. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.groupRow}>
            {groups.map((g) => (
              <Pressable
                key={g}
                onPress={() => setGroup(g)}
                style={({ pressed }) => [
                  s.groupBtn,
                  group === g && s.groupBtnOn,
                  pressed && s.pressed,
                ]}
              >
                <Text style={[s.groupText, group === g && s.groupTextOn]}>{g}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={s.chips}>
            {categories
              .filter((c) => c.group === group)
              .map((c) => (
                <Pressable
                  key={c.slug}
                  onPress={() => openCategory(c.slug)}
                  style={({ pressed }) => [
                    s.chip,
                    activeSlug === c.slug && s.chipOn,
                    pressed && s.pressed,
                  ]}
                >
                  <Text style={[s.chipText, activeSlug === c.slug && s.chipTextOn]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
          </View>
        </View>
      )}

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
                <DownloadIcon size={32} color={colors.textFaint} />
                <Text style={s.emptyText}>
                  {hits === null
                    ? tab === 'suche'
                      ? `Tipp ein, worauf du Lust hast — auf ${sprache.label}. Der Begriff wird für Albert Heijn übersetzt.`
                      : 'Wähle eine Kategorie, um zu sehen, was es gibt.'
                    : 'Keine Treffer. Versuch einen anderen Begriff oder eine andere Kategorie.'}
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
                <RecipeThumb title={item.title} imageUrl={item.imageUrl} size={44} radius={8} />
                <View style={s.body}>
                  <Text style={s.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={s.meta}>Allerhande</Text>
                </View>
                <View style={s.action}>
                  {busy ? (
                    <ActivityIndicator size="small" />
                  ) : state ? (
                    <Text style={s.doneText}>{state === 'neu' ? 'im Buch' : 'schon da'}</Text>
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
                Diese Rezepte sind Albert Heijns eigene — ihre Zutaten tragen die
                Namen, unter denen AH die Produkte verkauft. Deshalb findet die
                Einkaufsliste sie fast immer sofort.
              </Text>
            ) : null
          }
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  tab: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(58,42,0,0.10)',
  },
  tabOn: { backgroundColor: '#3a2a00' },
  tabText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: '#3a2a00' },
  tabTextOn: { color: colors.sunSoft },
  pressed: { opacity: 0.75 },

  searchArea: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  langLabel: { fontSize: 12, color: colors.textMuted, marginRight: spacing.xs },
  langBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  langTextOn: { color: colors.onDark },

  searchBar: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  btn: {
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  btnText: { fontFamily: fonts.heading, color: colors.onDark, fontWeight: '700', fontSize: 15 },
  translated: { fontSize: 12, color: colors.textFaint },
  translatedStrong: { color: colors.primary, fontWeight: '700' },

  catalogArea: { paddingTop: spacing.md, gap: spacing.md },
  groupRow: { paddingHorizontal: spacing.xl, flexGrow: 0 },
  groupBtn: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  groupBtnOn: { backgroundColor: colors.primaryDeep, borderColor: colors.primaryDeep },
  groupText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: colors.textMuted },
  groupTextOn: { color: colors.onDark },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.sun, borderColor: colors.sunDeep },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.primaryDeep },
  chipTextOn: { color: '#3a2a00', fontWeight: '700' },

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
  body: { flex: 1 },
  title: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  action: { minWidth: 62, alignItems: 'flex-end' },
  addText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  doneText: { fontSize: 12, fontWeight: '700', color: colors.frog },

  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyText: { fontSize: 14, color: colors.textFaint, textAlign: 'center', lineHeight: 21 },

  foot: {
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 17,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
});
