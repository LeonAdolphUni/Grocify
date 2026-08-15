/**
 * Sicherung und Zurückholen — die Logik.
 *
 * Bewusst hier und nicht in den Skripten: Als Funktion ist sie prüfbar, ohne
 * für jeden Testfall einen eigenen Prozess zu starten. Die Skripte unter
 * `scripts/` sind nur noch Hülle — Argumente lesen, aufrufen, ausgeben.
 *
 * Warum JSON und nicht die `.db`-Datei kopieren? Weil eine Sicherung
 * überleben soll, was sie sichert. Eine SQLite-Datei braucht SQLite und das
 * passende Schema; diese JSON-Datei kann man in fünf Jahren mit jedem
 * Texteditor öffnen und notfalls von Hand abtippen.
 */

import type { GrocifyDb } from './db';
import type { Recipe } from '../src/domain/types';
import { WEEKDAYS, type WeekPlan } from '../src/domain/weekPlan';

/** Format der Sicherungsdatei. Erhöhen, wenn sich die Struktur ändert. */
export const FORMAT_VERSION = 1;

export interface Backup {
  format: number;
  app: 'grocify';
  createdAt: string;
  stats: { recipes: number; ingredients: number; plannedMeals: number };
  recipes: Recipe[];
  weekPlan: WeekPlan;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export function exportBackup(db: GrocifyDb): Backup {
  return {
    format: FORMAT_VERSION,
    app: 'grocify',
    createdAt: new Date().toISOString(),
    stats: db.stats(),
    recipes: db.listRecipes(),
    weekPlan: db.getWeekPlan(),
  };
}

export interface ImportResult {
  neu: number;
  ersetzt: number;
  uebersprungen: number;
  /** Titel in der Reihenfolge, in der sie geschrieben wurden. */
  geschrieben: { title: string; bekannt: boolean }[];
  /** Belegte Wochentage nach dem Einspielen, oder null wenn kein Plan dabei war. */
  belegteTage: number | null;
}

/**
 * Spielt eine Sicherung ein.
 *
 * **Rezepte werden angelegt oder überschrieben, nie gelöscht.** Rezepte, die
 * es nur in der Datenbank gibt, bleiben unangetastet. Das ist Absicht: Man
 * holt eine Sicherung meist, weil etwas fehlt, nicht weil zu viel da ist.
 *
 * Der Wochenplan wird ersetzt, wenn die Sicherung einen enthält — er ist ein
 * einzelner Zustand, kein Bestand, den man ergänzen könnte.
 */
export function importBackup(db: GrocifyDb, data: unknown): ImportResult {
  const backup = assertBackup(data);

  const vorher = new Set(db.listRecipes().map((r) => r.id));
  const result: ImportResult = {
    neu: 0,
    ersetzt: 0,
    uebersprungen: 0,
    geschrieben: [],
    belegteTage: null,
  };

  for (const recipe of backup.recipes) {
    if (!recipe?.id || !recipe.title) {
      result.uebersprungen++;
      continue;
    }
    const bekannt = vorher.has(recipe.id);
    db.saveRecipe(recipe);
    bekannt ? result.ersetzt++ : result.neu++;
    result.geschrieben.push({ title: recipe.title, bekannt });
  }

  if (backup.weekPlan?.days) {
    // Nur bekannte Wochentage und nur Zeichenketten übernehmen, statt
    // Unsinn aus einer manipulierten Datei in die Datenbank zu schreiben.
    const days = backup.weekPlan.days as Record<string, unknown>;
    const plan = db.getWeekPlan();
    for (const day of WEEKDAYS) {
      const value = days[day];
      plan.days[day] = Array.isArray(value)
        ? value.filter((x): x is string => typeof x === 'string')
        : [];
    }
    if (typeof backup.weekPlan.name === 'string') plan.name = backup.weekPlan.name;

    const gespeichert = db.saveWeekPlan(plan);
    result.belegteTage = WEEKDAYS.filter((d) => gespeichert.days[d].length > 0).length;
  }

  return result;
}

/** Prüft, ob das überhaupt eine Grocify-Sicherung ist, bevor etwas geschrieben wird. */
function assertBackup(data: unknown): Backup {
  if (typeof data !== 'object' || data === null) {
    throw new BackupError('Die Datei enthält kein Objekt.');
  }
  const b = data as Partial<Backup>;

  if (b.app !== 'grocify') {
    throw new BackupError(
      'Das sieht nicht nach einer Grocify-Sicherung aus (Feld "app" fehlt oder passt nicht).',
    );
  }
  if (b.format !== FORMAT_VERSION) {
    throw new BackupError(
      `Format ${b.format ?? '?'} wird nicht unterstützt (erwartet: ${FORMAT_VERSION}).`,
    );
  }
  if (!Array.isArray(b.recipes) || b.recipes.length === 0) {
    throw new BackupError('Die Sicherung enthält keine Rezepte.');
  }
  return b as Backup;
}
