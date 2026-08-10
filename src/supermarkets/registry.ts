/**
 * Verzeichnis der verfügbaren Supermärkte.
 *
 * Die einzige Stelle, an der konkrete Anbieter-Klassen erzeugt werden.
 * Ein neuer Markt bedeutet: hier eine Zeile ergänzen.
 */

import { AlbertHeijnProvider } from './albertHeijn';
import { JumboProvider } from './jumbo';
import type { PriceProvider } from './types';

/**
 * Als Modul-Singletons angelegt: Der Albert-Heijn-Provider hält seinen
 * Auth-Token im Speicher. Würde bei jedem Screenwechsel eine neue Instanz
 * entstehen, zöge die App bei jeder Suche einen neuen Token.
 */
export const PROVIDERS: readonly PriceProvider[] = [
  new AlbertHeijnProvider(),
  new JumboProvider(),
];

export function getProvider(id: string): PriceProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export const DEFAULT_PROVIDER_ID = 'albert-heijn';

/**
 * Markt, in dem beim Anlegen eines Rezepts gesucht wird.
 *
 * Der Einkaufsmarkt wird erst später gewählt, gesucht werden muss aber
 * schon vorher. Solange nur ein Anbieter Daten liefert, ist die Wahl
 * eindeutig.
 */
export const SEARCH_PROVIDER_ID =
  PROVIDERS.find((p) => p.available)?.id ?? DEFAULT_PROVIDER_ID;
