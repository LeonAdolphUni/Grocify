/**
 * Grocify — Einstiegspunkt und Navigation.
 *
 * Ablauf: Rezepte wählen → Supermarkt wählen → Einkaufsliste.
 *
 * Die Navigation ist bewusst ein einfacher Zustand statt einer Bibliothek.
 * Bei vier Screens mit linearem Ablauf trägt expo-router seinen Aufwand
 * noch nicht. Sobald echte URLs, Deep Links oder Tabs dazukommen, ist der
 * Umstieg fällig — dann ist genau diese Datei die einzige Stelle, die sich
 * ändert.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { createDemoRecipe } from './src/domain/demoRecipe';
import type { Recipe } from './src/domain/types';
import { RecipeEditScreen } from './src/screens/RecipeEditScreen';
import { RecipeListScreen } from './src/screens/RecipeListScreen';
import { ShoppingListScreen } from './src/screens/ShoppingListScreen';
import { SupermarketScreen } from './src/screens/SupermarketScreen';
import {
  deleteRecipe,
  loadRecipes,
  newId,
  upsertRecipe,
} from './src/storage/recipeStore';
import { colors } from './src/ui/theme';

type Route =
  | { name: 'recipes' }
  | { name: 'edit'; recipeId?: string }
  | { name: 'supermarket' }
  | { name: 'list'; providerId: string };

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'recipes' });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadRecipes().then((loaded) => {
      setRecipes(loaded);
      setReady(true);
    });
  }, []);

  const selectedRecipes = useMemo(
    () => recipes.filter((r) => selectedIds.includes(r.id)),
    [recipes, selectedIds],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }, []);

  const handleSave = useCallback(async (recipe: Recipe) => {
    setRecipes(await upsertRecipe(recipe));
    setRoute({ name: 'recipes' });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setRecipes(await deleteRecipe(id));
    setSelectedIds((ids) => ids.filter((x) => x !== id));
  }, []);

  /** Legt das Beispielrezept an und wählt es gleich aus. */
  const handleLoadDemo = useCallback(async () => {
    const demo = createDemoRecipe(newId());
    setRecipes(await upsertRecipe(demo));
    setSelectedIds([demo.id]);
  }, []);

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
      {route.name === 'recipes' && (
        <RecipeListScreen
          recipes={recipes}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onCreate={() => setRoute({ name: 'edit' })}
          onEdit={(recipeId) => setRoute({ name: 'edit', recipeId })}
          onDelete={handleDelete}
          onContinue={() => setRoute({ name: 'supermarket' })}
          onLoadDemo={handleLoadDemo}
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
          recipes={selectedRecipes}
          onSelect={(providerId) => setRoute({ name: 'list', providerId })}
          onBack={() => setRoute({ name: 'recipes' })}
        />
      )}

      {route.name === 'list' && (
        <ShoppingListScreen
          recipes={selectedRecipes}
          providerId={route.providerId}
          onBack={() => setRoute({ name: 'supermarket' })}
        />
      )}
    </>
  );
}
