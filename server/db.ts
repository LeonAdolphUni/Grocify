/**
 * Datenbankschicht — SQLite über das in Node eingebaute `node:sqlite`.
 *
 * Bewusst ohne externe Abhängigkeit: Node 22.5+ bringt SQLite mit, also
 * braucht es weder `better-sqlite3` (das auf Windows eine C-Toolchain
 * verlangt) noch einen laufenden Datenbankdienst noch Docker. Die ganze
 * Datenbank ist eine Datei.
 *
 * Die Zutaten liegen bewusst in einer **eigenen Tabelle** statt als
 * JSON-Klumpen in der Rezeptzeile. Das kostet ein paar Zeilen mehr, macht
 * die Daten aber abfragbar — „welche Rezepte verwenden Mehl?" ist damit
 * eine Zeile SQL statt ein Durchlauf durch alle Rezepte im Speicher.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Ingredient, Recipe } from '../src/domain/types';
import type { Unit } from '../src/domain/units';
import { emptyWeek, WEEKDAYS, type WeekPlan, type Weekday } from '../src/domain/weekPlan';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recipes (
  id          TEXT PRIMARY KEY,
  title       TEXT    NOT NULL,
  servings    INTEGER NOT NULL,
  source_url  TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS ingredients (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id           TEXT    NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  canonical_id        TEXT    NOT NULL,
  name                TEXT    NOT NULL,
  search_term_nl      TEXT,
  amount              REAL    NOT NULL,
  unit                TEXT    NOT NULL,
  raw_text            TEXT    NOT NULL,
  is_pantry_staple    INTEGER NOT NULL DEFAULT 0,
  pinned_provider     TEXT,
  pinned_product_id   TEXT,
  pinned_title        TEXT,
  pinned_package_size TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingredients_recipe    ON ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_canonical ON ingredients(canonical_id);

CREATE TABLE IF NOT EXISTS week_plans (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Ein Eintrag je Gericht und Tag. Loescht man ein Rezept, verschwindet es
-- durch das ON DELETE CASCADE automatisch aus dem Wochenplan - sonst
-- stuenden dort Karteileichen.
CREATE TABLE IF NOT EXISTS week_plan_entries (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id   TEXT    NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
  weekday   TEXT    NOT NULL,
  position  INTEGER NOT NULL,
  recipe_id TEXT    NOT NULL REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entries_plan ON week_plan_entries(plan_id);
`;

/** Es gibt genau einen Wochenplan — mehr braucht eine Ein-Personen-App nicht. */
export const PLAN_ID = 'week-1';

export class GrocifyDb {
  private db: DatabaseSync;

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  // ── Rezepte ───────────────────────────────────────────────────────────

  listRecipes(): Recipe[] {
    const rows = this.db
      .prepare('SELECT id, title, servings, source_url FROM recipes ORDER BY title COLLATE NOCASE')
      .all() as { id: string; title: string; servings: number; source_url: string | null }[];

    const ingredientRows = this.db
      .prepare('SELECT * FROM ingredients ORDER BY recipe_id, position')
      .all() as Record<string, unknown>[];

    // Einmal alle Zutaten holen und im Speicher zuordnen statt je Rezept
    // eine Abfrage zu feuern. Bei 200 Rezepten ist das der Unterschied
    // zwischen zwei Abfragen und zweihunderteins.
    const byRecipe = new Map<string, Ingredient[]>();
    for (const row of ingredientRows) {
      const list = byRecipe.get(row.recipe_id as string) ?? [];
      list.push(toIngredient(row));
      byRecipe.set(row.recipe_id as string, list);
    }

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      servings: r.servings,
      sourceUrl: r.source_url ?? undefined,
      ingredients: byRecipe.get(r.id) ?? [],
    }));
  }

  getRecipe(id: string): Recipe | null {
    const row = this.db
      .prepare('SELECT id, title, servings, source_url FROM recipes WHERE id = ?')
      .get(id) as { id: string; title: string; servings: number; source_url: string | null } | undefined;
    if (!row) return null;

    const ingredients = (
      this.db
        .prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY position')
        .all(id) as Record<string, unknown>[]
    ).map(toIngredient);

    return {
      id: row.id,
      title: row.title,
      servings: row.servings,
      sourceUrl: row.source_url ?? undefined,
      ingredients,
    };
  }

  /** Legt an oder ersetzt. Zutaten werden komplett neu geschrieben. */
  saveRecipe(recipe: Recipe): Recipe {
    const now = new Date().toISOString();

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO recipes (id, title, servings, source_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             servings = excluded.servings,
             source_url = excluded.source_url,
             updated_at = excluded.updated_at`,
        )
        .run(recipe.id, recipe.title, recipe.servings, recipe.sourceUrl ?? null, now, now);

      // Zutaten sind eine geschlossene Liste, kein Verlauf: löschen und neu
      // schreiben ist einfacher und korrekter als ein Abgleich Zeile für Zeile.
      this.db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(recipe.id);

      const insert = this.db.prepare(
        `INSERT INTO ingredients
           (recipe_id, position, canonical_id, name, search_term_nl, amount, unit,
            raw_text, is_pantry_staple, pinned_provider, pinned_product_id,
            pinned_title, pinned_package_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      recipe.ingredients.forEach((ing, index) => {
        insert.run(
          recipe.id,
          index,
          ing.id,
          ing.name,
          ing.searchTermNl ?? null,
          ing.quantity.amount,
          ing.quantity.unit,
          ing.rawText,
          ing.isPantryStaple ? 1 : 0, // SQLite kennt kein Boolean
          ing.pinnedProduct?.provider ?? null,
          ing.pinnedProduct?.id ?? null,
          ing.pinnedProduct?.title ?? null,
          ing.pinnedProduct?.packageSize ?? null,
        );
      });

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getRecipe(recipe.id)!;
  }

  deleteRecipe(id: string): boolean {
    const result = this.db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ── Wochenplan ────────────────────────────────────────────────────────

  getWeekPlan(): WeekPlan {
    const row = this.db.prepare('SELECT id, name FROM week_plans WHERE id = ?').get(PLAN_ID) as
      | { id: string; name: string }
      | undefined;

    const plan = emptyWeek(PLAN_ID, row?.name ?? 'Meine Woche');

    const entries = this.db
      .prepare('SELECT weekday, recipe_id FROM week_plan_entries WHERE plan_id = ? ORDER BY weekday, position')
      .all(PLAN_ID) as { weekday: string; recipe_id: string }[];

    for (const entry of entries) {
      const day = entry.weekday as Weekday;
      if (WEEKDAYS.includes(day)) plan.days[day].push(entry.recipe_id);
    }
    return plan;
  }

  saveWeekPlan(plan: WeekPlan): WeekPlan {
    const now = new Date().toISOString();

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO week_plans (id, name, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
        )
        .run(PLAN_ID, plan.name, now);

      this.db.prepare('DELETE FROM week_plan_entries WHERE plan_id = ?').run(PLAN_ID);

      const insert = this.db.prepare(
        'INSERT INTO week_plan_entries (plan_id, weekday, position, recipe_id) VALUES (?, ?, ?, ?)',
      );

      for (const day of WEEKDAYS) {
        plan.days[day].forEach((recipeId, index) => {
          // Rezepte, die es nicht (mehr) gibt, werden stillschweigend
          // übergangen — der Fremdschlüssel würde sonst den ganzen
          // Speichervorgang abbrechen.
          const exists = this.db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(recipeId);
          if (exists) insert.run(PLAN_ID, day, index, recipeId);
        });
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getWeekPlan();
  }

  /** Kennzahlen für den Gesundheitscheck. */
  stats(): { recipes: number; ingredients: number; plannedMeals: number } {
    const count = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      recipes: count('SELECT COUNT(*) AS n FROM recipes'),
      ingredients: count('SELECT COUNT(*) AS n FROM ingredients'),
      plannedMeals: count('SELECT COUNT(*) AS n FROM week_plan_entries'),
    };
  }
}

/** Datenbankzeile → Zutat des Domänenmodells. */
function toIngredient(row: Record<string, unknown>): Ingredient {
  const pinnedId = row.pinned_product_id as string | null;
  return {
    id: row.canonical_id as string,
    name: row.name as string,
    searchTermNl: (row.search_term_nl as string | null) ?? undefined,
    quantity: { amount: row.amount as number, unit: row.unit as Unit },
    rawText: row.raw_text as string,
    isPantryStaple: row.is_pantry_staple === 1,
    pinnedProduct: pinnedId
      ? {
          provider: row.pinned_provider as string,
          id: pinnedId,
          title: row.pinned_title as string,
          packageSize: (row.pinned_package_size as string | null) ?? '',
        }
      : undefined,
  };
}
