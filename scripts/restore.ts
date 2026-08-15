/**
 * Zurückholen: JSON-Sicherung → Datenbank.
 *
 *   npm run restore -- server/data/backups/grocify-2026-08-15-1338.json
 *   npm run restore -- sicherung.json --db andere.db
 *
 * **Was passiert, im Klartext:**
 *
 *   Rezepte     werden angelegt oder überschrieben, je nach ID.
 *               Nichts wird gelöscht — Rezepte, die es nur in der Datenbank
 *               gibt, bleiben unangetastet.
 *   Wochenplan  wird ersetzt, wenn die Sicherung einen enthält.
 *
 * Willst du wirklich exakt den gesicherten Stand und nichts sonst, lösche
 * vorher `server/data/grocify.db` — dann legt der nächste Start sie leer neu
 * an. Die Logik steht in `server/backup.ts`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BackupError, importBackup } from '../server/backup';
import { GrocifyDb } from '../server/db';

const DEFAULT_DB = 'server/data/grocify.db';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function main() {
  const dbFile = argValue('--db') ?? DEFAULT_DB;
  // Der Wert hinter --db ist kein Dateiargument.
  const belegt = new Set([argValue('--db'), argValue('--out')].filter(Boolean));
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--') && !belegt.has(a));

  if (!arg) fail('Welche Datei? Aufruf: npm run restore -- <datei.json>');

  const file = resolve(arg);
  if (!existsSync(file)) fail(`Datei nicht gefunden: ${file}`);

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`Datei ist kein gültiges JSON: ${(err as Error).message}`);
  }

  const stand = (data as { createdAt?: string }).createdAt;
  console.log(`\n  Sicherung vom ${stand?.slice(0, 16).replace('T', ' ') ?? 'unbekannt'}\n`);

  const db = new GrocifyDb(dbFile);
  try {
    const result = importBackup(db, data);

    for (const { title, bekannt } of result.geschrieben) {
      console.log(`    ${bekannt ? '~' : '+'} ${title}`);
    }
    if (result.uebersprungen > 0) {
      console.log(`    ! ${result.uebersprungen} übersprungen (kein id oder title)`);
    }

    const stats = db.stats();
    console.log(`\n  ${result.neu} neu · ${result.ersetzt} überschrieben · nichts gelöscht`);
    console.log(
      result.belegteTage === null
        ? '  kein Wochenplan in der Sicherung — der vorhandene bleibt'
        : `  Wochenplan ersetzt — ${result.belegteTage} von 7 Tagen belegt`,
    );
    console.log(
      `  Stand jetzt: ${stats.recipes} Rezepte · ${stats.ingredients} Zutaten · ${stats.plannedMeals} geplante Gerichte\n`,
    );
  } catch (err) {
    db.close();
    if (err instanceof BackupError) fail(err.message);
    throw err;
  }
  db.close();
}

main();
