/**
 * Wochenplan: welches Rezept an welchem Tag.
 *
 * Der Zweck ist nicht Kalenderpflege, sondern Einkaufslogik. Sieben einzeln
 * geplante Abende kaufen sieben Mal ein Gebinde an, von dem jedes Mal etwas
 * übrig bleibt. Eine gemeinsam geplante Woche kann dieselbe Packung Mehl
 * über zwei Rezepte verteilen — und genau diesen Unterschied macht die
 * Statistik in der Einkaufsliste sichtbar.
 */

import type { Recipe } from './types';

export type Weekday = 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so';

export const WEEKDAYS: readonly Weekday[] = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'] as const;

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mo: 'Montag',
  di: 'Dienstag',
  mi: 'Mittwoch',
  do: 'Donnerstag',
  fr: 'Freitag',
  sa: 'Samstag',
  so: 'Sonntag',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  mo: 'Mo',
  di: 'Di',
  mi: 'Mi',
  do: 'Do',
  fr: 'Fr',
  sa: 'Sa',
  so: 'So',
};

export interface WeekPlan {
  id: string;
  name: string;
  /** Rezept-IDs je Tag. Mehrere pro Tag sind erlaubt. */
  days: Record<Weekday, string[]>;
}

export function emptyWeek(id: string, name = 'Meine Woche'): WeekPlan {
  return {
    id,
    name,
    days: { mo: [], di: [], mi: [], do: [], fr: [], sa: [], so: [] },
  };
}

/** Alle im Plan verwendeten Rezepte, in Reihenfolge der Wochentage. */
export function recipesInPlan(plan: WeekPlan, all: Recipe[]): Recipe[] {
  const byId = new Map(all.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const result: Recipe[] = [];

  for (const day of WEEKDAYS) {
    for (const id of plan.days[day]) {
      // Dasselbe Rezept an zwei Tagen zählt für den Einkauf doppelt —
      // deshalb wird hier NICHT dedupliziert, sondern nur die Reihenfolge
      // festgelegt. Die Mengen addiert `mergeIngredients` später.
      const recipe = byId.get(id);
      if (recipe) result.push(recipe);
      seen.add(id);
    }
  }
  return result;
}

/** Wie viele Tage der Woche belegt sind. */
export function plannedDayCount(plan: WeekPlan): number {
  return WEEKDAYS.filter((d) => plan.days[d].length > 0).length;
}

export function totalMeals(plan: WeekPlan): number {
  return WEEKDAYS.reduce((n, d) => n + plan.days[d].length, 0);
}

/**
 * Schlägt eine Woche vor, in der sich Zutaten überschneiden.
 *
 * Der Zweck der App ist nicht, sieben beliebige Gerichte auf sieben Tage zu
 * verteilen — das könnte auch ein Würfel. Der Zweck ist, dass eine Packung
 * über mehrere Abende reicht. Deshalb wird **gierig nach Überschneidung**
 * ausgewählt: Das erste Gericht ist das zutatenreichste (es gibt den meisten
 * Anschluss), jedes weitere ist das, welches am meisten Zutaten mit dem
 * bisher Geplanten teilt.
 *
 * Bewusst simpel gehalten. Es ist ein Vorschlag, kein Urteil: Der Nutzer
 * schiebt danach um, was ihm nicht passt. Ein leerer Bildschirm mit dem
 * Hinweis „tippe auf + Gericht" hilft niemandem, der acht Rezepte hat und
 * nicht weiß, womit er anfangen soll.
 */
export function suggestWeek(recipes: Recipe[], days = 7): Recipe[] {
  if (recipes.length === 0) return [];

  const zutatenVon = (r: Recipe) =>
    new Set(r.ingredients.filter((i) => !i.isPantryStaple).map((i) => i.id || i.name.toLowerCase()));

  const offen = [...recipes];
  const gewaehlt: Recipe[] = [];
  const imKorb = new Set<string>();

  // Start: das Rezept mit den meisten eigenen Zutaten. Es bietet die größte
  // Angriffsfläche für Überschneidungen.
  offen.sort((a, b) => zutatenVon(b).size - zutatenVon(a).size);
  const erstes = offen.shift();
  if (!erstes) return [];
  gewaehlt.push(erstes);
  for (const z of zutatenVon(erstes)) imKorb.add(z);

  while (gewaehlt.length < days && offen.length > 0) {
    let bestIndex = 0;
    let bestScore = -1;

    offen.forEach((r, i) => {
      const zutaten = zutatenVon(r);
      let treffer = 0;
      for (const z of zutaten) if (imKorb.has(z)) treffer++;
      // Anteil statt absoluter Zahl: Sonst gewinnt immer das Rezept mit der
      // längsten Zutatenliste, egal wie wenig es wirklich teilt.
      const score = zutaten.size > 0 ? treffer / zutaten.size : 0;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    });

    const naechstes = offen.splice(bestIndex, 1)[0];
    gewaehlt.push(naechstes);
    for (const z of zutatenVon(naechstes)) imKorb.add(z);
  }

  return gewaehlt;
}

/** Verteilt Rezepte der Reihe nach auf die Wochentage. */
export function planFromRecipes(id: string, name: string, recipes: Recipe[]): WeekPlan {
  const plan = emptyWeek(id, name);
  recipes.forEach((r, i) => {
    const day = WEEKDAYS[i % WEEKDAYS.length];
    plan.days[day].push(r.id);
  });
  return plan;
}
