/**
 * Schema-Migration auf einer Datenbank, die es schon gibt.
 *
 * **Warum das ein eigener Test ist.** `CREATE TABLE IF NOT EXISTS` legt eine
 * fehlende Tabelle an, ergänzt aber keine fehlende **Spalte**. Wer die App
 * seit dem letzten Schemastand benutzt, hat eine `recipes`-Tabelle ohne
 * `image_url` — und jede Abfrage darauf schlägt fehl. Das trifft nicht
 * irgendein Testszenario, sondern die einzige Datenbank, die es gibt: die
 * des Nutzers, mit seinen Rezepten drin.
 *
 * Geprüft wird deshalb der echte Ablauf: alte Tabelle anlegen, Daten
 * hineinschreiben, mit dem neuen Code öffnen, nachsehen ob alles noch da
 * ist.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';

import { GrocifyDb } from '../server/db';

describe('Migration einer bestehenden Datenbank', () => {
  let dir: string;
  let datei: string;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'grocify-migration-'));
    datei = join(dir, 'alt.db');

    // Das Schema von *vor* der Bilderweiterung, samt einem Rezept darin.
    const alt = new DatabaseSync(datei);
    alt.exec(`
      CREATE TABLE recipes (
        id          TEXT PRIMARY KEY,
        title       TEXT    NOT NULL,
        servings    INTEGER NOT NULL,
        source_url  TEXT,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );
      CREATE TABLE ingredients (
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
    `);
    alt
      .prepare(
        'INSERT INTO recipes (id, title, servings, source_url, created_at, updated_at) VALUES (?,?,?,?,?,?)',
      )
      .run('r1', 'Altes Rezept', 4, 'https://www.ah.nl/allerhande/recept/R-R1', 'x', 'x');
    alt
      .prepare(
        `INSERT INTO ingredients
           (recipe_id, position, canonical_id, name, amount, unit, raw_text, is_pantry_staple)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run('r1', 0, 'ui', 'ui', 2, 'Stueck', '2 uien', 0);
    alt.close();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it('öffnet sich ohne Fehler', () => {
    // Der eigentliche Ernstfall: Ohne Migration wirft schon der Konstruktor
    // oder spätestens die erste Abfrage.
    const db = new GrocifyDb(datei);
    db.close();
  });

  it('behält die vorhandenen Rezepte samt Zutaten', () => {
    const db = new GrocifyDb(datei);
    try {
      const rezepte = db.listRecipes();
      assert.equal(rezepte.length, 1);
      assert.equal(rezepte[0].title, 'Altes Rezept');
      assert.equal(rezepte[0].servings, 4);
      assert.equal(rezepte[0].sourceUrl, 'https://www.ah.nl/allerhande/recept/R-R1');
      assert.equal(rezepte[0].ingredients.length, 1);
      assert.equal(rezepte[0].ingredients[0].name, 'ui');
    } finally {
      db.close();
    }
  });

  it('ein Rezept ohne Bild hat kein Bild — und keinen leeren String', () => {
    // Die Oberfläche entscheidet an `undefined`, ob sie das Monogramm zeigt.
    const db = new GrocifyDb(datei);
    try {
      assert.equal(db.getRecipe('r1')?.imageUrl, undefined);
    } finally {
      db.close();
    }
  });

  it('nimmt danach Bilder an und gibt sie zurück', () => {
    const db = new GrocifyDb(datei);
    try {
      const r = db.getRecipe('r1');
      assert.ok(r);
      db.saveRecipe({ ...r, imageUrl: 'https://static.ah.nl/static/recepten/img_1.jpg' });
      assert.equal(
        db.getRecipe('r1')?.imageUrl,
        'https://static.ah.nl/static/recepten/img_1.jpg',
      );
    } finally {
      db.close();
    }
  });

  it('läuft zweimal ohne Schaden', () => {
    // Beim zweiten Start ist die Spalte schon da. Ein zweites ALTER TABLE
    // wäre ein Fehler — die Migration muss das selbst merken.
    for (let i = 0; i < 3; i++) {
      const db = new GrocifyDb(datei);
      assert.equal(db.listRecipes().length, 1);
      db.close();
    }
  });
});
