/**
 * Der Wochenplan — Startbildschirm der App.
 *
 * Sieben Tage, Rezepte drauflegen, fertig. Der Einkauf entsteht aus der
 * ganzen Woche statt aus einem einzelnen Abend, und genau daraus kommt der
 * Nutzen: Eine Packung Mehl reicht für zwei Gerichte, eine Packung Sahne
 * für zwei — wer jeden Abend einzeln einkauft, zahlt jedes Mal das ganze
 * Gebinde und stellt den Rest in den Schrank.
 */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Recipe } from '../domain/types';
import {
  WEEKDAYS,
  WEEKDAY_LABEL,
  WEEKDAY_SHORT,
  plannedDayCount,
  totalMeals,
  type WeekPlan,
  type Weekday,
} from '../domain/weekPlan';
import { Button, Card, Header, Screen } from '../ui/components';
import { PlateIcon } from '../ui/icons';
import { RecipeThumb } from '../ui/RecipeThumb';
import { colors, radius, spacing } from '../ui/theme';

interface Props {
  plan: WeekPlan;
  recipes: Recipe[];
  onAddRecipe: (day: Weekday, recipeId: string) => void;
  onRemoveRecipe: (day: Weekday, recipeId: string) => void;
  onClearWeek: () => void;
  onSuggestWeek: () => void;
  onManageRecipes: () => void;
  onBuildList: () => void;
  onBack: () => void;
}

export function WeekPlanScreen({
  plan,
  recipes,
  onAddRecipe,
  onRemoveRecipe,
  onClearWeek,
  onSuggestWeek,
  onManageRecipes,
  onBuildList,
  onBack,
}: Props) {
  /** Für welchen Tag gerade die Rezeptauswahl offen ist. */
  const [pickingFor, setPickingFor] = useState<Weekday | null>(null);

  const byId = new Map(recipes.map((r) => [r.id, r]));
  const meals = totalMeals(plan);
  const days = plannedDayCount(plan);
  const servings = WEEKDAYS.flatMap((d) => plan.days[d])
    .map((id) => byId.get(id)?.servings ?? 0)
    .reduce((a, b) => a + b, 0);

  const isEmpty = meals === 0;

  return (
    <Screen>
      <Header
        title="Wochenplan"
        subtitle={
          isEmpty
            ? 'Noch nichts geplant'
            : `${days} ${days === 1 ? 'Tag' : 'Tage'} · ${meals} ${meals === 1 ? 'Gericht' : 'Gerichte'} · ${servings} Portionen`
        }
        onBack={onBack}
        tone="pond"
        right={<Button label="Rezepte" variant="secondary" onPress={onManageRecipes} />}
      />

      <ScrollView contentContainerStyle={s.body}>
        {isEmpty ? (
          <Card style={s.introCard}>
            <Text style={s.introTitle}>Plane deine Woche</Text>
            <Text style={s.introText}>
              Leg Gerichte auf die Tage. Aus allen zusammen entsteht ein
              Einkauf, in dem sich Packungen über mehrere Gerichte verteilen —
              statt sieben Mal ein Gebinde anzubrechen, von dem jedes Mal
              etwas übrig bleibt.
            </Text>
            <View style={s.introActions}>
              {recipes.length === 0 ? (
                <>
                  <Button label="Erstes Rezept anlegen" onPress={onManageRecipes} />
                  <Text style={s.introHint}>
                    Danach kannst du es hier auf einen Tag legen.
                  </Text>
                </>
              ) : (
                <>
                  {/* Ein leerer Bildschirm mit „tippe auf + Gericht" hilft
                      niemandem, der acht Rezepte hat und nicht weiß, womit
                      er anfangen soll. Der Vorschlag wählt Gerichte, die
                      sich Zutaten teilen — genau das, wofür die App da ist. */}
                  <Button
                    label={`Woche aus deinen ${recipes.length} Rezepten vorschlagen`}
                    onPress={onSuggestWeek}
                  />
                  <Text style={s.introHint}>
                    Gewählt wird nach Überschneidung: Gerichte, die sich Zutaten
                    teilen, damit eine Packung über mehrere Abende reicht.
                    Umstellen kannst du danach alles.
                  </Text>
                </>
              )}
            </View>
          </Card>
        ) : null}

        {WEEKDAYS.map((day) => {
          const entries = plan.days[day];
          return (
            <View key={day} style={s.day}>
              <View style={s.dayHead}>
                <View style={s.dayBadge}>
                  <Text style={s.dayBadgeText}>{WEEKDAY_SHORT[day]}</Text>
                </View>
                <Text style={s.dayName}>{WEEKDAY_LABEL[day]}</Text>
                <Pressable onPress={() => setPickingFor(day)} hitSlop={8}>
                  <Text style={s.addLink}>+ Gericht</Text>
                </Pressable>
              </View>

              {entries.length === 0 ? (
                <Pressable onPress={() => setPickingFor(day)} style={s.emptyDay}>
                  <PlateIcon size={18} color={colors.textFaint} />
                  <Text style={s.emptyDayText}>frei — tipp für ein Gericht</Text>
                </Pressable>
              ) : (
                entries.map((id) => {
                  const recipe = byId.get(id);
                  return (
                    <View key={`${day}-${id}`} style={s.meal}>
                      <RecipeThumb title={recipe?.title ?? '?'} imageUrl={recipe?.imageUrl} size={38} radius={8} />
                      <View style={s.mealBody}>
                        <Text style={s.mealTitle}>{recipe?.title ?? 'Unbekanntes Rezept'}</Text>
                        {recipe ? (
                          <Text style={s.mealMeta}>
                            {recipe.servings} Portionen · {recipe.ingredients.length} Zutaten
                          </Text>
                        ) : null}
                      </View>
                      <Pressable onPress={() => onRemoveRecipe(day, id)} hitSlop={8}>
                        <Text style={s.remove}>✕</Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          );
        })}

        {!isEmpty ? (
          <Pressable onPress={onClearWeek} style={s.clear}>
            <Text style={s.clearText}>Woche leeren</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {!isEmpty ? (
        <View style={s.footer}>
          <Button label={`Einkaufsliste für ${meals} Gerichte`} onPress={onBuildList} />
        </View>
      ) : null}

      <Modal
        visible={pickingFor !== null}
        animationType="slide"
        onRequestClose={() => setPickingFor(null)}
      >
        <Screen>
          <Header
            title="Gericht wählen"
            subtitle={pickingFor ? WEEKDAY_LABEL[pickingFor] : ''}
            onBack={() => setPickingFor(null)}
          />
          <ScrollView contentContainerStyle={s.pickBody}>
            {recipes.length === 0 ? (
              <Text style={s.pickEmpty}>
                Noch keine Rezepte vorhanden. Leg über „Rezepte" eines an.
              </Text>
            ) : (
              recipes.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    if (pickingFor) onAddRecipe(pickingFor, r.id);
                    setPickingFor(null);
                  }}
                  style={({ pressed }) => [s.pickRow, pressed && s.pickRowPressed]}
                >
                  <View style={s.mealBody}>
                    <Text style={s.mealTitle}>{r.title}</Text>
                    <Text style={s.mealMeta}>
                      {r.servings} Portionen · {r.ingredients.length} Zutaten
                    </Text>
                  </View>
                  <Text style={s.pickArrow}>›</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },

  introCard: { gap: spacing.md },
  introTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  introText: { fontSize: 14, color: colors.textMuted, lineHeight: 21 },
  introActions: { gap: spacing.sm, marginTop: spacing.xs },
  introHint: { fontSize: 12, color: colors.textFaint, lineHeight: 17, textAlign: 'center' },

  day: { gap: spacing.sm },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayBadge: {
    width: 34,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dayName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  addLink: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  // Freie Tage sind leere Seerosenblätter: gestrichelt und mit Symbol laden
  // sie zum Antippen ein, statt wie eine graue Lücke auszusehen.
  emptyDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emptyDayIcon: { fontSize: 17 },
  emptyDayText: { color: colors.textFaint, fontSize: 13 },

  meal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  mealIcon: { fontSize: 24 },
  mealBody: { flex: 1 },
  mealTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  mealMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  remove: { color: colors.textFaint, fontSize: 16 },

  clear: { alignItems: 'center', paddingVertical: spacing.md },
  clearText: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },

  pickBody: { padding: spacing.lg, gap: spacing.sm },
  pickEmpty: {
    textAlign: 'center',
    color: colors.textFaint,
    marginTop: 48,
    paddingHorizontal: spacing.xl,
    lineHeight: 20,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pickRowPressed: { borderColor: colors.primary },
  pickArrow: { fontSize: 22, color: colors.textFaint },
});
