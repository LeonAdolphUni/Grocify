/**
 * Jumbo — derzeit nicht verfügbar.
 *
 * Jumbo hat sein Mobile-Backend geschlossen. Stand 08/2026:
 *
 *   GET mobileapi.jumbo.com/v17/search    → HTTP 403
 *   GET mobileapi.jumbo.com/v17/products  → HTTP 404
 *   GET www.jumbo.com/api/products/search → HTTP 404
 *   GET www.jumbo.com/                    → HTTP 200
 *
 * Die Website antwortet also normal, die Schnittstellen sind gezielt dicht.
 * Ältere Open-Source-Bibliotheken beschreiben Jumbos API noch als offen —
 * dieser Stand ist überholt.
 *
 * Diese Klasse existiert trotzdem, aus zwei Gründen: Der Nutzer soll sehen,
 * dass Jumbo vorgesehen ist und warum es nicht geht. Und sobald eine
 * nutzbare Quelle existiert — eine Partnerschaft oder ein kommerzieller
 * Anbieter — wird nur der Rumpf dieser Klasse gefüllt. Kein anderer Teil
 * der App ändert sich.
 */

import {
  ProviderError,
  type Category,
  type PriceProvider,
  type SearchResult,
} from './types';

const REASON =
  'Jumbo hat seine Produktschnittstelle geschlossen (HTTP 403). ' +
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
}
