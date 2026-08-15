/**
 * Der Wochenplaner-Helfer.
 *
 * Du sagst, worauf du Lust hast, und bekommst eine Woche vorgeschlagen.
 *
 * Die gestalterische Kernentscheidung: **Jeder Vorschlag sagt, warum er
 * dasteht.** „Passt zu Hähnchen · 25 % aus dem Vorrat · teilt 2 Zutaten" ist
 * überprüfbar; eine Liste ohne Begründung müsste man glauben. Und was nicht
 * gefunden wurde, steht ebenfalls da — ein Planer, der einen Wunsch stillt
 * ignoriert, wirkt beim zweiten Mal unbrauchbar.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { PantryItem } from '../domain/pantry';
import type { Recipe } from '../domain/types';
import { planWeek, type PlannerPick } from '../domain/weekPlanner';
import { WEEKDAY_SHORT, WEEKDAYS, type WeekPlan } from '../domain/weekPlan';
import { Monogram } from '../ui/Monogram';
import { Button, Header, Notice, Screen } from '../ui/components';
import { colors, fonts, radius, spacing } from '../ui/theme';

interface Props {
  recipes: Recipe[];
  pantry: PantryItem[];
  onApply: (plan: WeekPlan) => void;
  onManageRecipes: () => void;
  onBack: () => void;
}

/** Anregungen, damit man nicht vor einem leeren Feld sitzt. */
const VORSCHLAEGE = ['Pasta', 'was mit Hähnchen', 'vegetarisch', 'schnell', 'Suppe', 'deftig'];

export function PlannerScreen({ recipes, pantry, onApply, onManageRecipes, onBack }: Props) {
  const [wishes, setWishes] = useState('');
  const [days, setDays] = useState(5);
  const [result, setResult] = useState<ReturnType<typeof planWeek> | null>(null);

  const planen = useCallback(() => {
    setResult(planWeek(recipes, { wishes, pantry, days }));
  }, [recipes, wishes, pantry, days]);

  const anhaengen = useCallback(
    (wort: string) => setWishes((w) => (w.trim() ? `${w.trim()}, ${wort}` : wort)),
    [],
  );

  const vorratAnteil = useMemo(() => {
    if (!result || result.picks.length === 0) return 0;
    return result.picks.reduce((s, p) => s + p.pantryShare, 0) / result.picks.length;
  }, [result]);

  if (recipes.length === 0) {
    return (
      <Screen>
        <Header tone="pond" title="Woche planen" onBack={onBack} />
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Noch keine Rezepte</Text>
          <Text style={s.emptyText}>
            Der Helfer wählt aus deinen eigenen Rezepten. Leg erst ein paar an
            oder hol dir welche von Chefkoch.
          </Text>
          <Button label="Zu den Rezepten" onPress={onManageRecipes} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        tone="pond"
        title="Woche planen"
        subtitle={`aus ${recipes.length} Rezepten${pantry.length > 0 ? ` · ${pantry.length} im Vorrat` : ''}`}
        onBack={onBack}
      />

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.label}>Worauf hast du Lust?</Text>
          <TextInput
            style={s.input}
            value={wishes}
            onChangeText={setWishes}
            onSubmitEditing={planen}
            placeholder="z. B. Pasta, was mit Hähnchen, schnell"
            returnKeyType="search"
            multiline
          />

          <View style={s.chips}>
            {VORSCHLAEGE.map((v) => (
              <Pressable
                key={v}
                onPress={() => anhaengen(v)}
                style={({ pressed }) => [s.chip, pressed && s.chipPressed]}
              >
                <Text style={s.chipText}>{v}</Text>
              </Pressable>
            ))}
          </View>

          <View style={s.daysRow}>
            <Text style={s.label}>Für wie viele Tage?</Text>
            <View style={s.daysPicker}>
              {[3, 4, 5, 6, 7].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setDays(n)}
                  style={({ pressed }) => [
                    s.dayBtn,
                    days === n && s.dayBtnOn,
                    pressed && s.chipPressed,
                  ]}
                >
                  <Text style={[s.dayBtnText, days === n && s.dayBtnTextOn]}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Button label="Woche vorschlagen" onPress={planen} />

          <Text style={s.hint}>
            Bewertet wird nach deinen Wünschen, danach was der Vorrat schon
            deckt, danach wie viele Zutaten sich die Gerichte teilen — und
            zuletzt nach den geschätzten Nährwerten. Preise kommen erst mit der
            Einkaufsliste, damit der Vorschlag sofort dasteht.
          </Text>
        </View>

        {result ? (
          <>
            {result.unmatchedWishes.length > 0 ? (
              <Notice tone="warn">
                Kein Rezept gefunden für: {result.unmatchedWishes.join(', ')}. Lege
                eines an oder hol dir eines von Chefkoch.
              </Notice>
            ) : null}

            {result.picks.length > 0 ? (
              <View style={s.summary}>
                <Text style={s.summaryText}>
                  {result.picks.length} {result.picks.length === 1 ? 'Gericht' : 'Gerichte'}
                  {vorratAnteil > 0
                    ? ` · im Schnitt ${Math.round(vorratAnteil * 100)} % aus dem Vorrat`
                    : ''}
                </Text>
              </View>
            ) : null}

            {/* Der eigentliche Maßstab: Leert die Woche den Schrank? Was
                liegen bleibt, verdirbt womöglich — deshalb steht es hier
                namentlich und nicht als Prozentzahl allein. */}
            {pantry.length > 0 && result.picks.length > 0 ? (
              <View
                style={[
                  s.pantryResult,
                  result.pantryLeftover.length === 0 && s.pantryResultDone,
                ]}
              >
                <Text style={s.pantryResultTitle}>
                  {result.pantryLeftover.length === 0
                    ? 'Diese Woche braucht deinen Vorrat vollständig auf'
                    : `${Math.round(result.pantryUsedShare * 100)} % des Vorrats werden aufgebraucht`}
                </Text>
                {result.pantryLeftover.length > 0 ? (
                  <Text style={s.pantryResultText}>
                    Bleibt liegen:{' '}
                    {result.pantryLeftover
                      .map((p) => `${p.name} (${p.quantity.amount} ${p.quantity.unit})`)
                      .join(', ')}
                    . Leg ein Rezept an, das es verwendet — oder nimm einen Tag mehr.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {result.picks.map((pick, i) => (
              <PickRow key={pick.recipe.id} pick={pick} index={i} />
            ))}

            {result.picks.length > 0 ? (
              <View style={s.apply}>
                <Button
                  label={`Diese ${result.picks.length} Gerichte übernehmen`}
                  onPress={() => onApply(result.plan)}
                />
                <Text style={s.applyHint}>
                  Überschreibt deinen aktuellen Wochenplan. Umstellen kannst du
                  danach alles.
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function PickRow({ pick, index }: { pick: PlannerPick; index: number }) {
  return (
    <View style={s.pick}>
      <View style={s.pickDay}>
        <Text style={s.pickDayText}>{WEEKDAY_SHORT[WEEKDAYS[index % WEEKDAYS.length]]}</Text>
      </View>

      <Monogram title={pick.recipe.title} size={38} />

      <View style={s.pickBody}>
        <Text style={s.pickTitle}>{pick.recipe.title}</Text>
        <Text style={s.pickMeta}>
          {pick.kcalPerServing !== null ? `ca. ${pick.kcalPerServing} kcal je Portion` : 'Nährwerte unbekannt'}
        </Text>

        {/* Der Grund gehört an die Zeile, nicht in eine Fußnote: Ein
            Vorschlag ohne Begründung müsste man glauben. */}
        {pick.reasons.length > 0 ? (
          <View style={s.reasons}>
            {pick.reasons.map((r) => (
              <View key={r.label} style={[s.reason, r.kind === 'wunsch' && s.reasonWish]}>
                <Text style={[s.reasonText, r.kind === 'wunsch' && s.reasonTextWish]}>
                  {r.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700', color: colors.text },
  input: {
    minHeight: 62,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    textAlignVertical: 'top',
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipPressed: { opacity: 0.7 },
  chipText: { fontSize: 13, color: colors.primaryDeep, fontWeight: '600' },

  daysRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  daysPicker: { flexDirection: 'row', gap: spacing.xs, marginLeft: 'auto' },
  dayBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayBtnText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.textMuted },
  dayBtnTextOn: { color: colors.onDark },

  hint: { fontSize: 11, color: colors.textFaint, lineHeight: 17 },

  pantryResult: {
    backgroundColor: colors.sunSoft,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.sun,
    padding: spacing.md,
    gap: 3,
  },
  pantryResultDone: { backgroundColor: colors.successBg, borderLeftColor: colors.frog },
  pantryResultTitle: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: colors.text },
  pantryResultText: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  summary: { paddingHorizontal: spacing.xs },
  summaryText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: colors.textMuted },

  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pickDay: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickDayText: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '800', color: colors.primaryDeep },
  pickBody: { flex: 1, gap: 3 },
  pickTitle: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.text },
  pickMeta: { fontSize: 12, color: colors.textMuted },

  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  reason: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
  },
  reasonWish: { backgroundColor: colors.sunSoft },
  reasonText: { fontSize: 11, color: colors.textMuted },
  reasonTextWish: { color: colors.seed, fontWeight: '700' },

  apply: { gap: spacing.sm, marginTop: spacing.sm },
  applyHint: { fontSize: 11, color: colors.textFaint, textAlign: 'center', lineHeight: 16 },

  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xxl },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 17, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
});
