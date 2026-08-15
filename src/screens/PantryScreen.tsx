/**
 * Der Vorrat: was zu Hause steht.
 *
 * Eingetragen wird wie eine Zutat — „Mehl 800 g" in ein Feld, fertig. Das
 * ist derselbe Parser, den auch das Rezept benutzt; zwei verschiedene
 * Eingabearten für dieselbe Sache wären eine Zumutung.
 *
 * Der Nutzen entsteht erst in der Einkaufsliste: Was hier steht, wird dort
 * abgezogen. Deshalb steht auf diesem Bildschirm ausdrücklich, was das
 * bewirkt — ein Vorrat, dessen Wirkung man nicht sieht, wird nicht gepflegt.
 */

import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseIngredientInput } from '../domain/parseIngredient';
import { pantryKey, stalestDays, type PantryItem } from '../domain/pantry';
import { formatQuantity } from '../domain/units';
import { Kees } from '../ui/Kees';
import { Button, Header, Notice, Screen } from '../ui/components';
import { colors, fonts, radius, spacing } from '../ui/theme';

interface Props {
  pantry: PantryItem[];
  onSave: (item: PantryItem) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

export function PantryScreen({ pantry, onSave, onDelete, onBack }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const vorschau = useMemo(() => parseIngredientInput(input), [input]);

  const hinzufuegen = useCallback(() => {
    const parsed = parseIngredientInput(input);
    if (!parsed) {
      setError('Das konnte ich nicht lesen. Schreib z. B. „Mehl 800 g" oder „3 Eier".');
      return;
    }
    setError(null);
    onSave({
      id: pantryKey(parsed.name),
      name: parsed.name,
      quantity: parsed.quantity,
      updatedAt: new Date().toISOString(),
    });
    setInput('');
  }, [input, onSave]);

  const alter = stalestDays(pantry);

  return (
    <Screen>
      <Header
        tone="sun"
        title="Vorrat"
        subtitle={
          pantry.length === 0
            ? 'Noch nichts eingetragen'
            : `${pantry.length} ${pantry.length === 1 ? 'Eintrag' : 'Einträge'}`
        }
        onBack={onBack}
      />

      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={(t) => {
            setInput(t);
            if (error) setError(null);
          }}
          onSubmitEditing={hinzufuegen}
          placeholder="z. B. Mehl 800 g, Milch 0,5 l, 3 Eier"
          returnKeyType="done"
          autoCapitalize="sentences"
        />
        <Button label="+" onPress={hinzufuegen} />
      </View>

      {/* Vorschau: Der Nutzer sieht sofort, wie die App seine Eingabe
          versteht — bevor sie in der Liste steht. */}
      {vorschau ? (
        <Text style={s.preview}>
          verstanden als <Text style={s.previewStrong}>{vorschau.name}</Text> ·{' '}
          {formatQuantity(vorschau.quantity)}
        </Text>
      ) : null}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {alter !== null && alter > 21 ? (
        <Notice tone="info">
          Der älteste Eintrag ist {alter} Tage alt. Ein Vorrat, den niemand pflegt,
          wird schnell zur Lüge — und die Einkaufsliste rechnet damit.
        </Notice>
      ) : null}

      <FlatList
        data={pantry}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}>
            <Kees size={72} mood="content" />
            <Text style={s.emptyTitle}>Was steht schon im Schrank?</Text>
            <Text style={s.emptyText}>
              Trag ein, was du zu Hause hast. Beim nächsten Einkauf zieht Grocify
              diese Mengen ab — dann steht Mehl nicht auf der Liste, obwohl noch
              800 g da sind.
            </Text>
            <Text style={s.emptyHint}>
              Schreib es wie im Rezept: „Mehl 800 g", „Milch 0,5 l", „3 Eier".
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={s.rowBody}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.meta}>
                {formatQuantity(item.quantity)}
                {item.note ? ` · ${item.note}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => onDelete(item.id)} hitSlop={10} style={s.deleteHit}>
              <Text style={s.delete}>aufgebraucht</Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          pantry.length > 0 ? (
            <Text style={s.foot}>
              Diese Mengen werden von der nächsten Einkaufsliste abgezogen. Was
              vollständig gedeckt ist, steht dort gar nicht erst — mit einem
              Hinweis, warum.
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  inputBar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl },
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
  preview: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    fontSize: 12,
    color: colors.textFaint,
  },
  previewStrong: { color: colors.text, fontWeight: '700' },

  list: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowBody: { flex: 1 },
  name: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  deleteHit: { minHeight: 44, justifyContent: 'center' },
  delete: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },

  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 17, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyHint: { fontSize: 12, color: colors.textFaint, textAlign: 'center', lineHeight: 18 },

  foot: {
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 17,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
});
