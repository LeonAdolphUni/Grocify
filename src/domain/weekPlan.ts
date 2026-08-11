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
