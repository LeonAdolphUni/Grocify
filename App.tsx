/**
 * Grocify — Einstiegspunkt und Navigation.
 *
 * Die Daten liegen im Backend, nicht mehr im Browser. Das bedeutet auch:
 * Ohne laufenden Server gibt es nichts anzuzeigen. Statt einen leeren
 * Bildschirm zu zeigen und den Nutzer rätseln zu lassen, sagt die App dann
 * klar, was fehlt und wie man es startet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ApiError, api } from './src/api/client';
import type { Recipe } from './src/domain/types';
import { emptyWeek, recipesInPlan, type WeekPlan, type Weekday } from './src/domain/weekPlan';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecipeEditScreen } from './src/screens/RecipeEditScreen';
import { RecipeListScreen } from './src/screens/RecipeListScreen';
import { ShoppingListScreen } from './src/screens/ShoppingListScreen';
import { SupermarketScreen } from './src/screens/SupermarketScreen';
import { WeekPlanScreen } from './src/screens/WeekPlanScreen';
import { Kees } from './src/ui/Kees';
import { colors, radius, spacing } from './src/ui/theme';

type Route =
  | { name: 'home' }
  | { name: 'week' }
  | { name: 'recipes' }
  | { name: 'edit'; recipeId?: string }
  | { name: 'supermarket'; source: Recipe[] }
  | { name: 'list'; source: Recipe[]; providerId: string };

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plan, setPlan] = useState<WeekPlan>(() => emptyWeek('week-1'));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFatal(null);
    try {
      const [loadedRecipes, loadedPlan] = await Promise.all([
        api.listRecipes(),
        api.getWeekPlan(),
      ]);
      setRecipes(loadedRecipes);
      setPlan(loadedPlan);
    } catch (err) {
      setFatal(
        err instanceof ApiError
          ? err.message
          : `Unerwarteter Fehler: ${(err as Error).message}`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Ändert den Plan sofort in der Oberfläche und schickt ihn ans Backend.
   *
   * Optimistisch: Der Nutzer soll nicht auf das Netz warten, um einen Tag
   * zu belegen. Schlägt das Speichern fehl, wird der Server als Quelle der
   * Wahrheit genommen und der Zustand zurückgeholt.
   */
  const updatePlan = useCallback(async (next: WeekPlan) => {
    setPlan(next);
    try {
      setPlan(await api.saveWeekPlan(next));
    } catch {
      try {
        setPlan(await api.getWeekPlan());
      } catch {
        // Backend ganz weg — der nächste Vollstart meldet es deutlich.
      }
    }
  }, []);

  const addToDay = useCallback(
    (day: Weekday, recipeId: string) =>
      void updatePlan({ ...plan, days: { ...plan.days, [day]: [...plan.days[day], recipeId] } }),
    [plan, updatePlan],
  );

  const removeFromDay = useCallback(
    (day: Weekday, recipeId: string) => {
      const index = plan.days[day].indexOf(recipeId);
      if (index < 0) return;
      const next = [...plan.days[day]];
      next.splice(index, 1);
      void updatePlan({ ...plan, days: { ...plan.days, [day]: next } });
    },
    [plan, updatePlan],
  );

  const clearWeek = useCallback(
    () => void updatePlan(emptyWeek(plan.id, plan.name)),
    [plan.id, plan.name, updatePlan],
  );

  const handleSave = useCallback(
    async (recipe: Recipe) => {
      try {
        await api.saveRecipe(recipe);
        setRecipes(await api.listRecipes());
        setRoute({ name: 'recipes' });
      } catch (err) {
        setFatal(err instanceof ApiError ? err.message : (err as Error).message);
      }
    },
    [],
  );

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteRecipe(id);
      // Der Wochenplan kann das Rezept enthalten haben — beide Stände neu
      // holen statt zu raten, was das Backend daraus gemacht hat.
      const [nextRecipes, nextPlan] = await Promise.all([api.listRecipes(), api.getWeekPlan()]);
      setRecipes(nextRecipes);
      setPlan(nextPlan);
      setSelectedIds((ids) => ids.filter((x) => x !== id));
    } catch (err) {
      setFatal(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }, []);

  const planRecipes = useMemo(() => recipesInPlan(plan, recipes), [plan, recipes]);
  const selectedRecipes = useMemo(
    () => recipes.filter((r) => selectedIds.includes(r.id)),
    [recipes, selectedIds],
  );

  if (loading) {
    return (
      <View style={s.center}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (fatal) {
    return (
      <View style={s.center}>
        <StatusBar style="dark" />
        <View style={s.errorBox}>
          <Kees size={72} mood="meh" />
          <Text style={s.errorTitle}>Kein Zugriff auf deine Daten</Text>
          <Text style={s.errorText}>{fatal}</Text>
          <View style={s.codeBox}>
            <Text style={s.code}>npm run server</Text>
          </View>
          <Pressable onPress={() => void load()} style={({ pressed }) => [s.retry, pressed && s.pressed]}>
            <Text style={s.retryText}>Nochmal versuchen</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />

      {route.name === 'home' && (
        <HomeScreen
          plan={plan}
          recipes={recipes}
          onOpenWeek={() => setRoute({ name: 'week' })}
          onOpenRecipes={() => setRoute({ name: 'recipes' })}
        />
      )}

      {route.name === 'week' && (
        <WeekPlanScreen
          plan={plan}
          recipes={recipes}
          onAddRecipe={addToDay}
          onRemoveRecipe={removeFromDay}
          onClearWeek={clearWeek}
          onManageRecipes={() => setRoute({ name: 'recipes' })}
          onBuildList={() => setRoute({ name: 'supermarket', source: planRecipes })}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}

      {route.name === 'recipes' && (
        <RecipeListScreen
          recipes={recipes}
          selectedIds={selectedIds}
          onToggleSelect={(id) =>
            setSelectedIds((ids) =>
              ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
            )
          }
          onCreate={() => setRoute({ name: 'edit' })}
          onEdit={(recipeId) => setRoute({ name: 'edit', recipeId })}
          onDelete={handleDelete}
          onContinue={() => setRoute({ name: 'supermarket', source: selectedRecipes })}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}

      {route.name === 'edit' && (
        <RecipeEditScreen
          recipe={recipes.find((r) => r.id === route.recipeId)}
          onSave={handleSave}
          onCancel={() => setRoute({ name: 'recipes' })}
        />
      )}

      {route.name === 'supermarket' && (
        <SupermarketScreen
          recipes={route.source}
          onSelect={(providerId) => setRoute({ name: 'list', source: route.source, providerId })}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}

      {route.name === 'list' && (
        <ShoppingListScreen
          recipes={route.source}
          allRecipes={recipes}
          providerId={route.providerId}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  errorBox: {
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 420,
    padding: spacing.xl,
  },
  errorTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
  errorText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  codeBox: {
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  code: { color: colors.sunSoft, fontSize: 14, fontFamily: 'monospace' },
  retry: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  pressed: { opacity: 0.75 },
  retryText: { color: colors.onDark, fontWeight: '700', fontSize: 15 },
});
