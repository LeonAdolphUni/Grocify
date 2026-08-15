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
import type { PantryItem } from './src/domain/pantry';
import { scaleAll, scaleRecipe } from './src/domain/portions';
import { DEFAULT_SETTINGS, isPantryReviewDue, type Settings } from './src/domain/settings';
import type { Recipe } from './src/domain/types';
import {
  emptyWeek,
  planFromRecipes,
  recipesInPlan,
  suggestWeek,
  type WeekPlan,
  type Weekday,
} from './src/domain/weekPlan';
import { HomeScreen } from './src/screens/HomeScreen';
import { ImportScreen } from './src/screens/ImportScreen';
import { PantryScreen } from './src/screens/PantryScreen';
import { PlannerScreen } from './src/screens/PlannerScreen';
import { RecipeDetailScreen } from './src/screens/RecipeDetailScreen';
import { RecipeEditScreen } from './src/screens/RecipeEditScreen';
import { RecipeListScreen } from './src/screens/RecipeListScreen';
import { ShoppingListScreen } from './src/screens/ShoppingListScreen';
import { SupermarketScreen } from './src/screens/SupermarketScreen';
import { WeekPlanScreen } from './src/screens/WeekPlanScreen';
import { Kees } from './src/ui/Kees';
import { Toast, type ToastMessage } from './src/ui/Toast';
import { colors, loadWebFonts, radius, spacing } from './src/ui/theme';
import { SEARCH_PROVIDER_ID } from './src/supermarkets/registry';

type Route =
  | { name: 'home' }
  | { name: 'week' }
  | { name: 'recipes' }
  | { name: 'import' }
  | { name: 'pantry' }
  | { name: 'planner' }
  | { name: 'recipe'; recipeId: string }
  | { name: 'edit'; recipeId?: string }
  | { name: 'supermarket'; source: Recipe[] }
  | { name: 'list'; source: Recipe[]; providerId: string };

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plan, setPlan] = useState<WeekPlan>(() => emptyWeek('week-1'));
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Webfonts einmal beim Start nachladen — dieselben wie auf der Landingpage.
  useEffect(() => loadWebFonts(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setFatal(null);
    try {
      const [loadedRecipes, loadedPlan, loadedPantry, loadedSettings] = await Promise.all([
        api.listRecipes(),
        api.getWeekPlan(),
        api.listPantry(),
        api.getSettings(),
      ]);
      setRecipes(loadedRecipes);
      setPlan(loadedPlan);
      setPantry(loadedPantry);
      setSettings(loadedSettings);
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

  const clearWeek = useCallback(() => {
    const vorher = plan;
    void updatePlan(emptyWeek(plan.id, plan.name));
    setToast({
      text: 'Woche geleert',
      action: { label: 'Rückgängig', run: () => updatePlan(vorher) },
    });
  }, [plan, updatePlan]);

  /**
   * Füllt eine leere Woche mit Gerichten, die sich Zutaten teilen.
   *
   * Ein Vorschlag, kein Urteil — deshalb steht direkt daneben, wie man ihn
   * wieder loswird.
   */
  const suggestWeekPlan = useCallback(() => {
    const vorher = plan;
    const auswahl = suggestWeek(recipes);
    if (auswahl.length === 0) return;

    void updatePlan(planFromRecipes(plan.id, plan.name, auswahl));
    setToast({
      text: `${auswahl.length} Gerichte verteilt — verschieb, was nicht passt`,
      action: { label: 'Rückgängig', run: () => updatePlan(vorher) },
    });
  }, [plan, recipes, updatePlan]);

  /**
   * Ist der Vorrat wieder fällig?
   *
   * Ab Montag, wenn seit dem letzten Durchsehen ein neuer Montag angebrochen
   * ist. Montag, weil dann die Woche geplant wird — die Erinnerung kommt,
   * wenn sie etwas nützt.
   */
  const pantryReviewDue = useMemo(() => isPantryReviewDue(settings), [settings]);

  /** Merkt sich, dass der Vorrat durchgesehen wurde. */
  const markPantryReviewed = useCallback(async () => {
    const next: Settings = { ...settings, pantryReviewedAt: new Date().toISOString() };
    setSettings(next);
    try {
      setSettings(await api.saveSettings(next));
    } catch {
      // Nicht der Rede wert: Die Erinnerung kommt dann nächste Woche wieder.
    }
  }, [settings]);

  const savePantryItem = useCallback(async (item: PantryItem) => {
    try {
      await api.savePantryItem(item);
      setPantry(await api.listPantry());
      setToast({ text: `„${item.name}" im Vorrat` });
    } catch (err) {
      setFatal(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }, []);

  /**
   * „Aufgebraucht" statt „löschen": Der Eintrag verschwindet, weil die Ware
   * weg ist — nicht, weil man sich vertippt hat. Rückgängig gibt es
   * trotzdem, denn beides sieht beim Antippen gleich aus.
   */
  const deletePantryItem = useCallback(
    async (id: string) => {
      const weg = pantry.find((p) => p.id === id);
      try {
        await api.deletePantryItem(id);
        setPantry(await api.listPantry());
        if (weg) {
          setToast({
            text: `„${weg.name}" aufgebraucht`,
            action: {
              label: 'Rückgängig',
              run: async () => {
                await api.savePantryItem(weg);
                setPantry(await api.listPantry());
              },
            },
          });
        }
      } catch (err) {
        setFatal(err instanceof ApiError ? err.message : (err as Error).message);
      }
    },
    [pantry],
  );

  const handleSave = useCallback(
    async (recipe: Recipe) => {
      try {
        await api.saveRecipe(recipe);
        setRecipes(await api.listRecipes());
        setRoute({ name: 'recipes' });
        // Ohne Rückmeldung wirkt Speichern wie ein Sprung: Der Bildschirm
        // wechselt, aber niemand sagt, dass es geklappt hat.
        setToast({ text: `„${recipe.title}" gespeichert` });
      } catch (err) {
        setFatal(err instanceof ApiError ? err.message : (err as Error).message);
      }
    },
    [],
  );

  /**
   * Nach einem Import die Liste nachladen — aber auf dem Importbildschirm
   * bleiben. Wer ein Rezept holt, holt meist gleich mehrere; ihn nach jedem
   * Treffer hinauszuwerfen wäre lästig.
   */
  const handleImported = useCallback(async () => {
    try {
      setRecipes(await api.listRecipes());
    } catch {
      // Das Rezept liegt bereits in der Datenbank. Nur die Anzeige hinkt
      // hinterher, und das richtet der nächste Wechsel zur Liste.
    }
  }, []);

  /**
   * Löscht ein Rezept — und behält es für den Rückweg im Speicher.
   *
   * Löschen ist die einzige Aktion in der App, die Arbeit vernichtet. Eine
   * Rückfrage („Wirklich löschen?") schützt schlecht: Man klickt sie weg.
   * Ein Rückgängig-Streifen dagegen kostet keine Aufmerksamkeit, solange
   * alles gutgeht, und rettet den Fehlgriff.
   */
  const handleDelete = useCallback(
    async (id: string) => {
      const geloescht = recipes.find((r) => r.id === id);
      const planVorher = plan;
      try {
        await api.deleteRecipe(id);
        // Der Wochenplan kann das Rezept enthalten haben — beide Stände neu
        // holen statt zu raten, was das Backend daraus gemacht hat.
        const [nextRecipes, nextPlan] = await Promise.all([api.listRecipes(), api.getWeekPlan()]);
        setRecipes(nextRecipes);
        setPlan(nextPlan);
        setSelectedIds((ids) => ids.filter((x) => x !== id));

        if (geloescht) {
          setToast({
            text: `„${geloescht.title}" gelöscht`,
            action: {
              label: 'Rückgängig',
              run: async () => {
                await api.saveRecipe(geloescht);
                setRecipes(await api.listRecipes());
                // Der Plan hatte das Rezept womöglich an mehreren Tagen —
                // der Stand von vorher stellt genau das wieder her.
                setPlan(await api.saveWeekPlan(planVorher));
              },
            },
          });
        }
      } catch (err) {
        setFatal(err instanceof ApiError ? err.message : (err as Error).message);
      }
    },
    [recipes, plan],
  );

  /**
   * Portionszahl ändern.
   *
   * Wirkt sofort auf alles, was daraus entsteht — Einkaufsliste, Nährwerte,
   * Portionsanzeige. Die Rezepte selbst bleiben unangetastet: In der
   * Datenbank steht weiter „4 Portionen laut Allerhande".
   */
  const changeServings = useCallback(async (servingsPerMeal: number) => {
    const vorher = settings;
    setSettings({ servingsPerMeal });
    try {
      setSettings(await api.saveSettings({ servingsPerMeal }));
      setToast({
        text:
          servingsPerMeal === 1
            ? 'Rezepte werden auf 1 Portion gerechnet'
            : `Rezepte werden auf ${servingsPerMeal} Portionen gerechnet`,
      });
    } catch (err) {
      setSettings(vorher);
      setFatal(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }, [settings]);

  /**
   * Alle Rezepte auf die eingestellte Portionszahl umgerechnet.
   *
   * Grocify ist für eine Person gebaut, Rezepte sind es nie — Chefkoch
   * liefert vier bis acht Portionen. Ohne diese Umrechnung kauft die App
   * jede Woche ein Vielfaches des Bedarfs ein.
   *
   * Umgerechnet wird beim *Benutzen*, nicht beim Speichern: Das Original
   * behält seine Herkunftsangabe, und wer die Portionszahl später ändert,
   * verliert nichts.
   */
  const scaledRecipes = useMemo(
    () => scaleAll(recipes, settings.servingsPerMeal),
    [recipes, settings.servingsPerMeal],
  );

  const planRecipes = useMemo(
    () => recipesInPlan(plan, scaledRecipes),
    [plan, scaledRecipes],
  );
  const selectedRecipes = useMemo(
    () => scaledRecipes.filter((r) => selectedIds.includes(r.id)),
    [scaledRecipes, selectedIds],
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
          recipes={scaledRecipes}
          onOpenWeek={() => setRoute({ name: 'week' })}
          onOpenRecipes={() => setRoute({ name: 'recipes' })}
          onOpenPantry={() => setRoute({ name: 'pantry' })}
          onOpenPlanner={() => setRoute({ name: 'planner' })}
          pantryCount={pantry.length}
          pantryReviewDue={pantryReviewDue}
          onPantryReviewed={markPantryReviewed}
          servingsPerMeal={settings.servingsPerMeal}
          onChangeServings={changeServings}
        />
      )}

      {route.name === 'week' && (
        <WeekPlanScreen
          plan={plan}
          recipes={scaledRecipes}
          onAddRecipe={addToDay}
          onRemoveRecipe={removeFromDay}
          onClearWeek={clearWeek}
          onSuggestWeek={suggestWeekPlan}
          onManageRecipes={() => setRoute({ name: 'recipes' })}
          onBuildList={() => setRoute({ name: 'supermarket', source: planRecipes })}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}

      {route.name === 'recipes' && (
        <RecipeListScreen
          recipes={scaledRecipes}
          pantryCount={pantry.length}
          selectedIds={selectedIds}
          onToggleSelect={(id) =>
            setSelectedIds((ids) =>
              ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
            )
          }
          onCreate={() => setRoute({ name: 'edit' })}
          onImport={() => setRoute({ name: 'import' })}
          onOpen={(recipeId) => setRoute({ name: 'recipe', recipeId })}
          onEdit={(recipeId) => setRoute({ name: 'edit', recipeId })}
          onDelete={handleDelete}
          onContinue={() => setRoute({ name: 'supermarket', source: selectedRecipes })}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}

      {route.name === 'import' && (
        <ImportScreen
          onImported={handleImported}
          onBack={() => setRoute({ name: 'recipes' })}
        />
      )}

      {route.name === 'recipe' &&
        (() => {
          const recipe = scaledRecipes.find((r) => r.id === route.recipeId);
          if (!recipe) return null;
          return (
            <RecipeDetailScreen
              recipe={recipe}
              providerId={SEARCH_PROVIDER_ID}
              onEdit={() => setRoute({ name: 'edit', recipeId: recipe.id })}
              onBack={() => setRoute({ name: 'recipes' })}
            />
          );
        })()}

      {route.name === 'planner' && (
        <PlannerScreen
          recipes={scaledRecipes}
          pantry={pantry}
          onApply={(vorschlag) => {
            const vorher = plan;
            void updatePlan({ ...vorschlag, id: plan.id, name: plan.name });
            setRoute({ name: 'week' });
            setToast({
              text: 'Wochenplan übernommen',
              action: { label: 'Rückgängig', run: () => updatePlan(vorher) },
            });
          }}
          onManageRecipes={() => setRoute({ name: 'recipes' })}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}

      {route.name === 'pantry' && (
        <PantryScreen
          pantry={pantry}
          onSave={savePantryItem}
          onDelete={deletePantryItem}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}

      {route.name === 'edit' && (
        <RecipeEditScreen
          // Bewusst das **Original**, nicht die umgerechnete Fassung: Wer ein
          // Rezept bearbeitet und speichert, würde sonst die Umrechnung
          // festschreiben — aus „4 Portionen laut Allerhande" würde dauerhaft
          // „1 Portion", und die Herkunftsangabe wäre weg.
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
          allRecipes={scaledRecipes}
          pantry={pantry}
          providerId={route.providerId}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}

      {/* Liegt über allem, damit die Rückmeldung auf jedem Bildschirm sichtbar
          ist — auch wenn der Bildschirm dabei gewechselt hat. */}
      <Toast message={toast} onDismiss={() => setToast(null)} />
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
