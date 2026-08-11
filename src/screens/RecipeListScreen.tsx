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
import { colors, radius, spacing } from '../ui/theme';

interface Props {
  recipes: Recipe[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onContinue: () => void;
  onLoadDemo: () => void;
  onBack: () => void;
}

export function RecipeListScreen({
  recipes,
  selectedIds,
  onToggleSelect,
  onCreate,
  onEdit,
  onDelete,
  onContinue,
  onLoadDemo,
  onBack,
}: Props) {
  const selectedCount = selectedIds.length;

  return (
    <Screen>
      <Header
        title="Rezepte"
        subtitle={
          recipes.length === 0
            ? 'Noch keine Rezepte'
            : `${recipes.length} gespeichert${selectedCount > 0 ? ` · ${selectedCount} ausgewählt` : ''}`
        }
        onBack={onBack}
        right={<Button label="+ Neu" onPress={onCreate} />}
      />

      <FlatList
        data={recipes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Leg dein erstes Rezept an</Text>
            <Text style={s.emptyText}>
              Titel, Portionen und Zutaten eintragen — daraus wird gleich eine
              Einkaufsliste mit echten Preisen.
            </Text>

            <View style={s.emptyAction}>
              <Button
                label="Beispielrezept laden"
                variant="secondary"
                onPress={onLoadDemo}
              />
              <Text style={s.emptyHint}>
                Spaghetti Bolognese, 11 Zutaten — zum Ausprobieren, jederzeit
                wieder löschbar.
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

                  <View style={s.body}>
                    <Text style={s.name}>{item.title}</Text>
                    <Text style={s.meta}>
                      {item.servings} {item.servings === 1 ? 'Portion' : 'Portionen'} ·{' '}
                      {item.ingredients.length}{' '}
                      {item.ingredients.length === 1 ? 'Zutat' : 'Zutaten'}
                    </Text>
                  </View>

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
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  action: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  actionText: { fontSize: 13, color: colors.textMuted },
  actionDanger: { color: colors.danger },
  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: spacing.xxl },
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
