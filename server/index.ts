/**
 * Einstiegspunkt des Backends.
 *
 *   npm run server
 *
 * Die Datenbank liegt als einzelne Datei unter `server/data/grocify.db`.
 * Sie ist von Git ausgenommen — deine Rezepte gehören dir, nicht dem Repo.
 */

import { createApi } from './api';
import { GrocifyDb } from './db';

const PORT = Number(process.env.PORT ?? 4000);
const DB_FILE = process.env.GROCIFY_DB ?? 'server/data/grocify.db';

const db = new GrocifyDb(DB_FILE);
const server = createApi(db);

server.listen(PORT, () => {
  const stats = db.stats();
  console.log(`\n  Grocify-Backend läuft`);
  console.log(`  ├─ API        http://localhost:${PORT}/api`);
  console.log(`  ├─ Datenbank  ${DB_FILE}`);
  console.log(
    `  └─ Bestand    ${stats.recipes} Rezepte · ${stats.ingredients} Zutaten · ${stats.plannedMeals} geplante Gerichte\n`,
  );
});

/** Sauber schließen, damit die Datenbankdatei nicht halb geschrieben liegen bleibt. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\n  Backend wird beendet …');
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
