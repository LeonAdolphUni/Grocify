/**
 * Persistenz für Rezepte.
 *
 * AsyncStorage statt SQLite: läuft im Browser (localStorage) und auf dem
 * Gerät mit derselben API. Für einige hundert Rezepte völlig ausreichend.
 * Wenn die Datenmenge oder Abfragen wachsen, wird hier auf expo-sqlite
 * umgestellt — der Rest der App sieht nur diese Funktionen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Recipe } from '../domain/types';

const KEY = 'grocify.recipes.v1';

export async function loadRecipes(): Promise<Recipe[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Recipe[]) : [];
  } catch {
    // Beschädigte Daten dürfen die App nicht am Start hindern.
    // Lieber mit leerer Liste hochkommen als weiß bleiben.
    return [];
  }
}

export async function saveRecipes(recipes: Recipe[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(recipes));
}

export async function upsertRecipe(recipe: Recipe): Promise<Recipe[]> {
  const all = await loadRecipes();
  const idx = all.findIndex((r) => r.id === recipe.id);
  const next = idx >= 0 ? all.map((r) => (r.id === recipe.id ? recipe : r)) : [...all, recipe];
  await saveRecipes(next);
  return next;
}

export async function deleteRecipe(id: string): Promise<Recipe[]> {
  const next = (await loadRecipes()).filter((r) => r.id !== id);
  await saveRecipes(next);
  return next;
}

/** Ausreichend eindeutige ID ohne zusätzliche Abhängigkeit. */
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
