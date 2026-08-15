/**
 * Sicherung: Datenbank → lesbare JSON-Datei.
 *
 *   npm run backup                                    # nach server/data/backups/
 *   npm run backup -- --out C:/pfad/meine-rezepte.json
 *   npm run backup -- --db andere.db                  # eine andere Datenbank sichern
 *
 * Die Logik steht in `server/backup.ts`. Hier wird nur gelesen, aufgerufen
 * und ausgegeben.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { exportBackup } from '../server/backup';
import { GrocifyDb } from '../server/db';

const DEFAULT_DB = 'server/data/grocify.db';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function main() {
  const db = new GrocifyDb(argValue('--db') ?? DEFAULT_DB);
  const backup = exportBackup(db);
  db.close();

  if (backup.recipes.length === 0) {
    console.log('\n  Nichts zu sichern — die Datenbank ist leer.\n');
    return;
  }

  const out = resolve(argValue('--out') ?? `server/data/backups/grocify-${timestamp()}.json`);
  const json = JSON.stringify(backup, null, 2);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json, 'utf8');

  const { recipes, ingredients, plannedMeals } = backup.stats;
  console.log(`\n  Gesichert nach  ${out}`);
  console.log(
    `  Umfang          ${recipes} Rezepte · ${ingredients} Zutaten · ${plannedMeals} geplante Gerichte · ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB\n`,
  );
  for (const r of backup.recipes) {
    console.log(`    - ${r.title}${r.sourceUrl ? '  [importiert]' : ''}`);
  }
  console.log(`\n  Zurückholen mit:  npm run restore -- "${out}"\n`);
}

main();
