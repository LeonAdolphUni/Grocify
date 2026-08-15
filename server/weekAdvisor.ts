/**
 * Der Wochenplaner, der bei Albert Heijn sucht.
 *
 * Der bisherige Planer wählte aus dem eigenen Rezeptbuch. Das ist ein Kreis:
 * Man kann nur planen, was man schon hat, und wer acht Rezepte besitzt,
 * bekommt achtmal dieselbe Woche. Dieser hier durchsucht **Allerhande** — das
 * ganze Sortiment an Rezepten, deren Zutaten AH garantiert führt.
 *
 * **Der Ablauf ist ein Gespräch, keine Maske.** Man sagt, worauf man Lust
 * hat; es kommen Vorschläge; man verwirft, was nicht passt, und bekommt
 * Nachschub. Ein Formular mit acht Feldern würde dieselbe Information
 * abfragen und sich dabei anfühlen wie ein Antrag.
 *
 * **Gesund und günstig sind hier keine Beiwerte, sondern die Auswahlregel.**
 *
 *   Gesund  — aus AHs eigenen Nährwertangaben je Portion. Kein Schätzen:
 *             Die Zahlen stehen im JSON-LD des Rezepts.
 *   Günstig — nicht über den Preis, sondern über die Zutatenzahl und die
 *             Überschneidung mit dem, was schon gewählt ist. Wer siebenmal
 *             dieselbe Packung anbricht, zahlt sie einmal.
 *
 * ⚠️ **Warum nicht über echte Preise?** Weil jedes Rezept zehn Produktsuchen
 * bräuchte und jede Suche eine Anfrage. Für zwanzig Kandidaten wären das
 * zweihundert — der Vorschlag käme nach Minuten. Die Zutatenzahl ist ein
 * grober, aber ehrlicher Stellvertreter, und der echte Preis steht wenige
 * Klicks später in der Einkaufsliste.
 */

import { browseCategory, importRecipe, searchRecipes, type RecipeHit } from './allerhande';
import { newId } from '../src/domain/id';
import type { PantryItem } from '../src/domain/pantry';
import { deductFromPantry } from '../src/domain/pantry';
import { isPantryStaple } from '../src/domain/translate';
import type { Recipe } from '../src/domain/types';

export interface AdvisorRequest {
  /** Worauf hast du Lust — schon auf Niederländisch übersetzt. */
  wishes: string[];
  /** Wie viele Gerichte gebraucht werden. */
  days: number;
  pantry: PantryItem[];
  /** Rezepte, die der Nutzer schon abgelehnt hat. */
  rejected?: string[];
}

export interface AdvisorPick {
  hit: RecipeHit;
  recipe: Recipe;
  score: number;
  reasons: string[];
  kcalPerServing?: number;
  proteinPerServing?: number;
  ingredientCount: number;
  pantryShare: number;
  totalMinutes?: number;
}

export interface AdvisorResult {
  picks: AdvisorPick[];
  /** Wünsche, für die Allerhande nichts hergab. */
  unmatched: string[];
  /** Wie viele Rezeptseiten geholt wurden — für die Ehrlichkeit der Wartezeit. */
  fetched: number;
}

/**
 * Kategorien, aus denen ohne konkreten Wunsch geschöpft wird.
 *
 * Bewusst die gesunden und die einfachen: Wer nichts sagt, will nicht
 * zufällige Rezepte, sondern brauchbare. Zwei Kategorien statt einer, damit
 * die Woche nicht aus sieben Salaten besteht.
 */
const FALLBACK_KATEGORIEN = ['gezonde-recepten', 'makkelijke-recepten', 'eenpansgerechten'];

/**
 * Wie viele Rezeptseiten höchstens geholt werden.
 *
 * Jede kostet eine Anfrage und, wegen der Drosselung, eine Sekunde. Zwanzig
 * sind gut zwanzig Sekunden — lang, aber vertretbar für einen Wochenplan.
 * Mehr Kandidaten würden die Auswahl kaum verbessern und die Wartezeit
 * verdoppeln.
 */
const MAX_ABRUFE = 20;

/**
 * Gesundheitsnote aus AHs eigenen Nährwerten, 0…1.
 *
 * Bewusst benennbar statt als undurchschaubare Formel: Eiweiß hebt, viel
 * gesättigtes Fett und sehr hohe Kalorien senken. Das ist keine
 * Ernährungsberatung — es ist eine Reihenfolge, die besser ist als keine.
 */
export function healthFromNutrition(n: {
  kcal?: number;
  saturatedFat?: number;
  protein?: number;
  fat?: number;
}): number | null {
  if (n.kcal === undefined) return null;

  let score = 0.5;
  if ((n.protein ?? 0) >= 25) score += 0.2;
  else if ((n.protein ?? 0) >= 15) score += 0.1;

  if ((n.saturatedFat ?? 0) >= 15) score -= 0.2;
  else if ((n.saturatedFat ?? 0) >= 9) score -= 0.1;

  if (n.kcal > 900) score -= 0.25;
  else if (n.kcal > 700) score -= 0.1;
  else if (n.kcal < 250) score -= 0.1; // zu wenig ist auch keine Mahlzeit

  return Math.max(0, Math.min(1, score));
}

/** Zutaten ohne Vorratsware — nur die kosten wirklich Geld. */
function echteZutaten(recipe: Recipe) {
  return recipe.ingredients.filter((i) => !(i.isPantryStaple || isPantryStaple(i.name)));
}

/**
 * Stellt eine Woche aus Allerhande zusammen.
 *
 * Zwei Schritte: erst Kandidaten sammeln (billig, eine Anfrage je Wunsch),
 * dann die besten im Detail holen (teuer, eine Anfrage je Rezept). Ohne
 * diese Trennung würde jeder Vorschlag hundert Seiten ziehen.
 */
export async function adviseWeek(req: AdvisorRequest): Promise<AdvisorResult> {
  const { wishes, days, pantry, rejected = [] } = req;
  const abgelehnt = new Set(rejected);

  // ── Schritt 1: Kandidaten sammeln ──────────────────────────────────
  //
  // Jeder Kandidat merkt sich, aus welchem Wunsch er stammt. Ohne das
  // verdrängt die Überschneidungsregel den zweiten Wunsch: Wer „kip, soep"
  // sagt, bekam drei Hähnchengerichte und keine Suppe, weil Hähnchen
  // untereinander mehr Zutaten teilen.
  const kandidaten: { hit: RecipeHit; wunsch: string | null }[] = [];
  const gesehen = new Set<string>();
  const unmatched: string[] = [];

  const quellen = wishes.length > 0 ? wishes : FALLBACK_KATEGORIEN;

  for (const quelle of quellen) {
    try {
      const treffer = wishes.length > 0
        ? await searchRecipes(quelle, 8)
        : await browseCategory(quelle, 8);

      if (treffer.length === 0 && wishes.length > 0) unmatched.push(quelle);

      for (const t of treffer) {
        if (gesehen.has(t.id) || abgelehnt.has(t.id)) continue;
        gesehen.add(t.id);
        kandidaten.push({ hit: t, wunsch: wishes.length > 0 ? quelle : null });
      }
    } catch {
      if (wishes.length > 0) unmatched.push(quelle);
    }
  }

  if (kandidaten.length === 0) {
    return { picks: [], unmatched, fetched: 0 };
  }

  // ── Schritt 2: Details holen, begrenzt ─────────────────────────────
  // Mehr Kandidaten als Tage, damit es etwas auszuwählen gibt — aber
  // gedeckelt, weil jeder Abruf eine Sekunde kostet.
  // Reihum aus jedem Wunsch schöpfen statt der Reihe nach: Sonst wären bei
  // zwei Wünschen und acht Abrufen alle acht aus dem ersten.
  const zuHolen = verschraenken(kandidaten, Math.min(MAX_ABRUFE, Math.max(days * 3, 8)));
  const geholt: {
    hit: RecipeHit;
    wunsch: string | null;
    imported: Awaited<ReturnType<typeof importRecipe>>;
  }[] = [];

  for (const { hit, wunsch } of zuHolen) {
    try {
      geholt.push({ hit, wunsch, imported: await importRecipe(hit.path, newId()) });
    } catch {
      // Ein Rezept, das sich nicht lesen lässt, fällt still heraus. Der
      // Nutzer merkt nur, dass ein Vorschlag weniger kommt.
    }
  }

  // ── Schritt 3: gierig auswählen ────────────────────────────────────
  const picks: AdvisorPick[] = [];
  const imKorb = new Set<string>();
  const abgedeckteWuensche = new Set<string>();
  let verbleibenderVorrat = pantry;

  while (picks.length < days && geholt.length > picks.length) {
    let best: AdvisorPick | null = null;
    let bestIndex = -1;

    geholt.forEach((k, i) => {
      if (picks.some((p) => p.hit.id === k.hit.id)) return;

      const { recipe, nutrition, totalMinutes } = k.imported;
      const zutaten = echteZutaten(recipe);
      const reasons: string[] = [];
      let score = 0;

      // Gesund — die stärkste Regel, weil der Nutzer sie ausdrücklich wollte.
      const gesund = nutrition ? healthFromNutrition(nutrition) : null;
      if (gesund !== null) {
        score += 2.5 * gesund;
        if (gesund >= 0.7) reasons.push('ausgewogen');
      }

      // Günstig, Teil 1: wenige Zutaten. Jede Zutat ist eine Packung.
      const wenig = Math.max(0, 1 - zutaten.length / 16);
      score += 1.5 * wenig;
      if (zutaten.length <= 7) reasons.push(`nur ${zutaten.length} Zutaten`);

      // Günstig, Teil 2: Überschneidung mit dem schon Gewählten.
      const schluessel = zutaten.map((z) => z.id);
      const gemeinsam = schluessel.filter((x) => imKorb.has(x)).length;
      if (zutaten.length > 0 && gemeinsam > 0) {
        score += 1.8 * (gemeinsam / zutaten.length);
        reasons.push(`teilt ${gemeinsam} ${gemeinsam === 1 ? 'Zutat' : 'Zutaten'}`);
      }

      // Vorrat — gegen den verbleibenden, damit nichts doppelt zählt.
      const gedeckt = zutaten.filter(
        (z) => deductFromPantry(z, verbleibenderVorrat).covered > 0,
      ).length;
      const vorratsanteil = zutaten.length > 0 ? gedeckt / zutaten.length : 0;
      if (vorratsanteil > 0) {
        score += 2.0 * vorratsanteil;
        reasons.push(`${Math.round(vorratsanteil * 100)} % aus dem Vorrat`);
      }

      // Ein Wunsch, der noch gar nicht vertreten ist, wiegt schwer. Wer
      // „kip, soep" sagt, will beides — nicht dreimal das Erste, nur weil
      // Hähnchen untereinander mehr Zutaten teilen.
      if (k.wunsch && !abgedeckteWuensche.has(k.wunsch)) {
        score += 2.6;
        reasons.push(`deckt „${k.wunsch}" ab`);
      }

      // Schnell ist ein Nebenkriterium, kein Ziel.
      if (totalMinutes !== undefined && totalMinutes <= 30) {
        score += 0.4;
        reasons.push(`${totalMinutes} Min`);
      }

      const kandidat: AdvisorPick = {
        hit: k.hit,
        recipe,
        score: Math.round(score * 100) / 100,
        reasons,
        kcalPerServing: nutrition?.kcal,
        proteinPerServing: nutrition?.protein,
        ingredientCount: zutaten.length,
        pantryShare: vorratsanteil,
        totalMinutes,
      };

      if (!best || kandidat.score > best.score) {
        best = kandidat;
        bestIndex = i;
      }
    });

    if (!best || bestIndex < 0) break;

    const gewaehlt: AdvisorPick = best;
    picks.push(gewaehlt);
    for (const z of echteZutaten(gewaehlt.recipe)) imKorb.add(z.id);
    const quelle = geholt[bestIndex]?.wunsch;
    if (quelle) abgedeckteWuensche.add(quelle);
    verbleibenderVorrat = consume(verbleibenderVorrat, gewaehlt.recipe);
  }

  return { picks, unmatched, fetched: geholt.length };
}

/**
 * Nimmt reihum aus jeder Gruppe, statt eine nach der anderen zu leeren.
 *
 * Bei zwei Wünschen und acht Abrufen kämen sonst alle acht aus dem ersten
 * Wunsch — der zweite hätte nie eine Chance, in die Auswahl zu kommen.
 */
function verschraenken<T extends { wunsch: string | null }>(items: T[], limit: number): T[] {
  const gruppen = new Map<string, T[]>();
  for (const item of items) {
    const key = item.wunsch ?? '';
    const liste = gruppen.get(key) ?? [];
    liste.push(item);
    gruppen.set(key, liste);
  }

  const raus: T[] = [];
  let runde = 0;
  while (raus.length < limit) {
    let etwasGenommen = false;
    for (const liste of gruppen.values()) {
      if (runde < liste.length && raus.length < limit) {
        raus.push(liste[runde]);
        etwasGenommen = true;
      }
    }
    if (!etwasGenommen) break;
    runde++;
  }
  return raus;
}

/** Bucht den Verbrauch eines Rezepts aus dem Vorrat aus. */
function consume(pantry: PantryItem[], recipe: Recipe): PantryItem[] {
  let rest = pantry;
  for (const z of echteZutaten(recipe)) {
    const d = deductFromPantry(z, rest);
    if (d.fullyCovered) rest = rest.filter((p) => p.id !== z.id);
  }
  return rest;
}
