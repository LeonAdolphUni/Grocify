/**
 * Jumbo — nicht verfügbar, und das ist eine Entscheidung von Jumbo.
 *
 * Nachgemessen am 14.08.2026:
 *
 *   mobileapi.jumbo.com/v17/search        → 404 (nginx, ~10 s Antwortzeit)
 *   mobileapi.jumbo.com/v17/products      → 404
 *   mobileapi.jumbo.com/v17/categories    → 404
 *   mobileapi.jumbo.com/v20|v21/search    → 404
 *   www.jumbo.com/api/products/search     → 404
 *   www.jumbo.com/                        → 200
 *
 * Wichtig ist die Veränderung: Am 11.08. antwortete v17/search noch mit
 * **403**, jetzt mit **404**. 403 heißt „du darfst nicht", 404 heißt „hier
 * ist nichts mehr". Der ganze Host ist inzwischen ein leerer Rumpf. Das ist
 * kein Aussperren einzelner Aufrufer, das ist eine Abschaltung.
 *
 * Zwei Wege existieren technisch noch. Beide sind bewusst nicht gegangen:
 *
 * 1. `www.jumbo.com/api/graphql` antwortet — mit einem Apollo-CSRF-Fehler,
 *    der die nötigen Kopfzeilen gleich mitnennt. Das ist die interne
 *    Schnittstelle ihrer eigenen Website. Wer sie nutzt, umgeht eine
 *    Schutzmaßnahme, die der Betreiber gesetzt hat, direkt nachdem er die
 *    offiziellere Tür zugemacht hat.
 *
 * 2. Die Produktseite liefert HTML. Aber `robots.txt` sagt ausdrücklich:
 *
 *        Disallow: /producten/*?searchType=keyword&searchTerms=
 *
 *    Die Produktsuche ist für automatisierte Zugriffe gesperrt. Nur das
 *    Blättern durch Kategorien ist erlaubt (`Allow: /producten/*?offSet=`).
 *    Davon abgesehen stehen die Preise nicht sauber im HTML, sondern in
 *    einem Nuxt-Zustandsobjekt, das sich mit jedem Deployment ändern kann.
 *
 * Diese Klasse bleibt trotzdem stehen, aus zwei Gründen: Der Nutzer soll
 * sehen, dass Jumbo vorgesehen war und warum es nicht geht. Und sobald eine
 * nutzbare Quelle existiert — eine Partnerschaft, ein kommerzieller
 * Datenanbieter — wird nur der Rumpf dieser Klasse gefüllt. Kein anderer
 * Teil der App ändert sich.
 */

import {
  ProviderError,
  type Category,
  type PriceProvider,
  type SearchResult,
} from './types';

const REASON =
  'Jumbo hat seine Produktschnittstelle abgeschaltet — zuletzt geprüft am 14.08.2026. ' +
  'Sobald eine nutzbare Datenquelle vorliegt, funktioniert die Auswahl ohne weitere Änderung.';

export class JumboProvider implements PriceProvider {
  readonly id = 'jumbo';
  readonly displayName = 'Jumbo';
  readonly available = false;
  readonly unavailableReason = REASON;

  async searchProducts(): Promise<SearchResult> {
    throw new ProviderError(REASON, this.id, 403);
  }

  async getProductById(): Promise<null> {
    throw new ProviderError(REASON, this.id, 403);
  }

  async getCategories(): Promise<Category[]> {
    throw new ProviderError(REASON, this.id, 403);
  }

  async getSubCategories(): Promise<Category[]> {
    throw new ProviderError(REASON, this.id, 403);
  }

  async browseCategory(): Promise<SearchResult> {
    throw new ProviderError(REASON, this.id, 403);
  }

  async getNutrition(): Promise<null> {
    // Kein Wurf: Nährwerte sind Beiwerk. Ein Anbieter ohne sie soll die
    // Nährwertanzeige leer lassen, nicht die ganze Liste zum Absturz bringen.
    return null;
  }
}
