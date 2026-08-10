/**
 * Abstraktion über Supermarkt-Datenquellen.
 *
 * Der Rest der App kennt ausschließlich dieses Interface, niemals einen
 * konkreten Anbieter. Das ist bewusst so: Die Albert-Heijn-Anbindung nutzt
 * das interne App-Backend von AH – ohne Nutzungszusage, ohne Verfügbarkeits-
 * garantie, jederzeit abschaltbar. Jumbo hat genau das bereits getan und
 * beantwortet Anfragen mit HTTP 403.
 *
 * Wenn diese Quelle wegbricht oder wir auf einen kommerziellen Anbieter
 * wechseln, ist das ein Klassentausch hinter diesem Interface – kein Umbau
 * der App.
 */

import type { Product } from '../domain/types';

export interface SearchOptions {
  /** Maximale Trefferzahl. */
  size?: number;
  /** Seitenindex, nullbasiert. */
  page?: number;
}

export interface SearchResult {
  products: Product[];
  totalResults: number;
}

/** Eine Supermarkt-Abteilung, z. B. "Bakkerij" oder "Groente, aardappelen". */
export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface PriceProvider {
  /** Stabile Kennung, landet in `Product.provider`. */
  readonly id: string;
  /** Anzeigename für die UI. */
  readonly displayName: string;
  /**
   * Liefert dieser Anbieter derzeit Daten?
   *
   * Ein Markt, dessen Schnittstelle zu ist, verschwindet nicht aus der App —
   * er wird sichtbar als nicht verfügbar angezeigt. Ein ausgegrauter Eintrag
   * mit Begründung ist ehrlicher als eine Auswahl, die stumm ins Leere läuft.
   */
  readonly available: boolean;
  /** Warum nicht verfügbar — wird dem Nutzer im Klartext gezeigt. */
  readonly unavailableReason?: string;

  /** Volltextsuche im Sortiment. */
  searchProducts(query: string, options?: SearchOptions): Promise<SearchResult>;

  /**
   * Ein einzelnes Produkt über seine Anbieter-ID laden.
   *
   * Wird für vom Nutzer fest gewählte Produkte gebraucht: Die ID steht im
   * Rezept, der Preis muss beim Bauen der Liste frisch geholt werden.
   * Gibt `null` zurück, wenn es das Produkt nicht mehr gibt — ausgelistete
   * Artikel sind ein Normalfall, kein Fehler.
   */
  getProductById(id: string): Promise<Product | null>;

  /**
   * Abteilungsstruktur des Marktes.
   * Wird genutzt, um die Einkaufsliste nach Laufweg im Laden zu sortieren.
   */
  getCategories(): Promise<Category[]>;
}

/** Fehler einer Supermarkt-Anbindung, mit HTTP-Status wo vorhanden. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
