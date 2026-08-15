/**
 * Schritt 1: Rezepte.
 *
 * Zeigt alle gespeicherten Rezepte. Mehrfachauswahl ist Absicht — eine
 * Wochenplanung besteht aus mehreren Rezepten, und die Zutaten werden
 * später zu einer Liste zusammengefasst.
 */

import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Recipe } from '../domain/types';
import { Button, Card, Header, Screen } from '../ui/components';
import { Kees } from '../ui/Kees';
import { colors, radius, spacing } from '../ui/theme';

interface Props {
  recipes: Recipe[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function RecipeListScreen({
  recipes,
  selectedIds,
  onToggleSelect,
  onCreate,
  onImport,
  onOpen,
  onEdit,
  onDelete,
  onContinue,
  onBack,
}: Props) {
  const selectedCount = selectedIds.length;

  return (
    <Screen>
      <Header
        tone="pond"
        title="Rezepte"
        subtitle={
          recipes.length === 0
            ? 'Noch keine Rezepte'
            : `${recipes.length} gespeichert${selectedCount > 0 ? ` · ${selectedCount} ausgewählt` : ''}`
        }
        onBack={onBack}
        right={
          <View style={s.headerActions}>
            {/* Gelb, weil es etwas von außen holt — der grüne Knopf legt
                selbst an. Zwei Wege ins Rezeptbuch, zwei Farben. */}
            <Pressable
              onPress={onImport}
              style={({ pressed }) => [s.importBtn, pressed && s.importBtnPressed]}
            >
              <Text style={s.importBtnText}>⬇ Chefkoch</Text>
            </Pressable>
            <Button label="+ Neu" onPress={onCreate} />
          </View>
        }
      />

      <FlatList
        data={recipes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}>
            {/* Kees saß bisher nur in der Einkaufsliste. Ein Maskottchen,
                das nur an einer Stelle auftaucht, wirkt wie Dekoration —
                eines, das einen begrüßt, wenn nichts da ist, gehört dazu. */}
            <Kees size={72} mood="content" />
            <Text style={s.emptyTitle}>Leg dein erstes Rezept an</Text>
            <Text style={s.emptyText}>
              Tippe oben rechts auf „+ Neu". Zutaten schreibst du einfach hin —
              „Milch 0,5 l" reicht, das Produkt sucht die App selbst.
            </Text>

            <View style={s.emptyAction}>
              <Button label="Erstes Rezept anlegen" onPress={onCreate} />
              <Button label="⬇ Von Chefkoch holen" onPress={onImport} variant="secondary" />
              <Text style={s.emptyHint}>
                Der Import übernimmt Titel, Portionen und Zutaten. Die Zubereitung
                bleibt bei Chefkoch — ein Link führt hin.
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          return (
            <Pressable onPress={() => onToggleSelect(item.id)}>
              <Card style={selected ? s.cardSelected : undefined}>
                <View style={s.row}>
                  <View style={[s.check, selected && s.checkOn]}>
                    {selected ? <Text style={s.checkMark}>✓</Text> : null}
                  </View>

                  {/* Titel öffnet die Ansicht, die Fläche daneben wählt aus.
                      Zwei Absichten, zwei Trefferflächen — vorher gab es für
                      „nur mal nachsehen, was drin ist" gar keinen Weg. */}
                  <Pressable style={s.body} onPress={() => onOpen(item.id)} hitSlop={4}>
                    <View style={s.nameRow}>
                      <Text style={s.name}>{item.title}</Text>
                      {/* Woher es kommt, bleibt sichtbar — sonst weiß man in
                          drei Wochen nicht mehr, welches Rezept man selbst
                          geschrieben hat. */}
                      {item.sourceUrl ? <Text style={s.badge}>importiert</Text> : null}
                    </View>
                    <Text style={s.meta}>
                      {item.servings} {item.servings === 1 ? 'Portion' : 'Portionen'} ·{' '}
                      {item.ingredients.length}{' '}
                      {item.ingredients.length === 1 ? 'Zutat' : 'Zutaten'}
                    </Text>
                  </Pressable>

                  <Pressable onPress={() => onEdit(item.id)} hitSlop={8} style={s.action}>
                    <Text style={s.actionText}>Bearbeiten</Text>
                  </Pressable>
                  <Pressable onPress={() => onDelete(item.id)} hitSlop={8} style={s.action}>
                    <Text style={[s.actionText, s.actionDanger]}>Löschen</Text>
                  </Pressable>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      {selectedCount > 0 ? (
        <View style={s.footer}>
          <Button
            label={`Weiter mit ${selectedCount} ${selectedCount === 1 ? 'Rezept' : 'Rezepten'}`}
            onPress={onContinue}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  importBtn: {
    backgroundColor: colors.sun,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  importBtnPressed: { opacity: 0.75 },
  importBtnText: { color: '#3a2a00', fontWeight: '700', fontSize: 14 },
  cardSelected: { borderColor: colors.primary, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },
  body: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.seed,
    backgroundColor: colors.sunSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  action: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  actionText: { fontSize: 13, color: colors.textMuted },
  actionDanger: { color: colors.alarm },
  empty: { alignItems: "center", paddingTop: 56, paddingHorizontal: spacing.xxl, gap: spacing.md },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: 14, color: colors.textFaint, textAlign: 'center', lineHeight: 21 },
  emptyAction: { marginTop: spacing.xxl, alignSelf: 'stretch', gap: spacing.sm },
  emptyHint: { fontSize: 12, color: colors.textFaint, textAlign: 'center', lineHeight: 17 },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
