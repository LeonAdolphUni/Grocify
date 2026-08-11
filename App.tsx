/**
 * Grocify — Einstiegspunkt und Navigation.
 *
 * Startbildschirm ist der Wochenplan. Von dort führen zwei Wege weg:
 * Rezepte verwalten, oder aus der geplanten Woche eine Einkaufsliste bauen.
 *
 * Die Navigation ist bewusst ein einfacher Zustand statt einer Bibliothek.
 * Sobald echte URLs, Deep Links oder Tabs dazukommen, ist der Umstieg auf
 * expo-router fällig — dann ist diese Datei die einzige Stelle, die sich
 * ändert.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { createDemoRecipe, createDemoRecipes, createDemoWeekPlan } from './src/domain/demoRecipe';
import type { Recipe } from './src/domain/types';
import { emptyWeek, recipesInPlan, type WeekPlan, type Weekday } from './src/domain/weekPlan';
import { RecipeEditScreen } from './src/screens/RecipeEditScreen';
import { RecipeListScreen } from './src/screens/RecipeListScreen';
import { ShoppingListScreen } from './src/screens/ShoppingListScreen';
import { SupermarketScreen } from './src/screens/SupermarketScreen';
import { WeekPlanScreen } from './src/screens/WeekPlanScreen';
import { deleteRecipe, loadRecipes, newId, saveRecipes, upsertRecipe } from './src/storage/recipeStore';
import { loadWeekPlan, saveWeekPlan } from './src/storage/weekPlanStore';
import { colors } from './src/ui/theme';

type Route =
  | { name: 'week' }
  | { name: 'recipes' }
  | { name: 'edit'; recipeId?: string }
  /** Die Einkaufsliste kann aus dem Wochenplan oder aus einer Auswahl kommen. */
  | { name: 'supermarket'; source: Recipe[] }
  | { name: 'list'; source: Recipe[]; providerId: string };

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plan, setPlan] = useState<WeekPlan>(() => emptyWeek('week-1'));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'week' });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [loadedRecipes, loadedPlan] = await Promise.all([loadRecipes(), loadWeekPlan()]);
      setRecipes(loadedRecipes);
      if (loadedPlan) setPlan(loadedPlan);
      setReady(true);
    })();
  }, []);

  /** Plan ändern und sofort sichern — der Nutzer soll nichts speichern müssen. */
  const updatePlan = useCallback((next: WeekPlan) => {
    setPlan(next);
    void saveWeekPlan(next);
  }, []);

  const addToDay = useCallback(
    (day: Weekday, recipeId: string) => {
      updatePlan({ ...plan, days: { ...plan.days, [day]: [...plan.days[day], recipeId] } });
    },
    [plan, updatePlan],
  );

  const removeFromDay = useCallback(
    (day: Weekday, recipeId: string) => {
      // Nur das erste Vorkommen entfernen: Dasselbe Gericht darf an einem Tag
      // zweimal stehen (doppelte Portionen), und dann soll ein Tipp auch nur
      // eines davon löschen.
      const index = plan.days[day].indexOf(recipeId);
      if (index < 0) return;
      const next = [...plan.days[day]];
      next.splice(index, 1);
      updatePlan({ ...plan, days: { ...plan.days, [day]: next } });
    },
    [plan, updatePlan],
  );

  const loadDemoWeek = useCallback(async () => {
    const demoRecipes = createDemoRecipes();
    // Vorhandene Rezepte bleiben erhalten; die Beispielrezepte haben feste
    // IDs und ersetzen sich selbst, wenn man die Woche zweimal lädt.
    const existing = (await loadRecipes()).filter(
      (r) => !demoRecipes.some((d) => d.id === r.id),
    );
    const merged = [...existing, ...demoRecipes];
    await saveRecipes(merged);
    setRecipes(merged);
    updatePlan(createDemoWeekPlan(plan.id));
  }, [plan.id, updatePlan]);

  const clearWeek = useCallback(() => {
    updatePlan(emptyWeek(plan.id, plan.name));
  }, [plan.id, plan.name, updatePlan]);

  const handleSave = useCallback(async (recipe: Recipe) => {
    setRecipes(await upsertRecipe(recipe));
    setRoute({ name: 'recipes' });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setRecipes(await deleteRecipe(id));
    setSelectedIds((ids) => ids.filter((x) => x !== id));
  }, []);

  const handleLoadDemoRecipe = useCallback(async () => {
    const demo = createDemoRecipe(newId());
    setRecipes(await upsertRecipe(demo));
    setSelectedIds([demo.id]);
  }, []);

  const planRecipes = useMemo(() => recipesInPlan(plan, recipes), [plan, recipes]);
  const selectedRecipes = useMemo(
    () => recipes.filter((r) => selectedIds.includes(r.id)),
    [recipes, selectedIds],
  );

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />

      {route.name === 'week' && (
        <WeekPlanScreen
          plan={plan}
          recipes={recipes}
          onAddRecipe={addToDay}
          onRemoveRecipe={removeFromDay}
          onLoadDemoWeek={loadDemoWeek}
          onClearWeek={clearWeek}
          onManageRecipes={() => setRoute({ name: 'recipes' })}
          onBuildList={() => setRoute({ name: 'supermarket', source: planRecipes })}
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
          onLoadDemo={handleLoadDemoRecipe}
          onBack={() => setRoute({ name: 'week' })}
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
          onBack={() => setRoute({ name: 'week' })}
        />
      )}

      {route.name === 'list' && (
        <ShoppingListScreen
          recipes={route.source}
          allRecipes={recipes}
          providerId={route.providerId}
          onBack={() => setRoute({ name: 'week' })}
        />
      )}
    </>
  );
}
