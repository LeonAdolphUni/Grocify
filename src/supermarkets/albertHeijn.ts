/**
 * Albert-Heijn-Anbindung.
 *
 * Nutzt das Mobile-Backend der Appie-App (api.ah.nl). Ein anonymer Token
 * lässt sich ohne Account und ohne Registrierung ziehen; damit ist die
 * Produktsuche sofort nutzbar.
 *
 * ⚠️ Das ist keine offizielle, lizenzierte API. Es gibt keine Nutzungszusage
 * und keine Verfügbarkeitsgarantie. Für Entwicklung und private Nutzung
 * unproblematisch – bevor daraus ein veröffentlichtes Produkt wird, sollte
 * die Datenquelle auf eine Partnerschaft oder einen kommerziellen Anbieter
 * umgestellt werden. Genau dafür existiert das PriceProvider-Interface.
 *
 * Getestet am 10.08.2026: Auth, Produktsuche und Kategoriebaum antworten
 * mit HTTP 200.
 */

import type { Product } from '../domain/types';
import type { Quantity, Unit } from '../domain/units';
import {
  ProviderError,
  type Category,
  type PriceProvider,
  type SearchOptions,
  type SearchResult,
} from './types';

const BASE_URL = 'https://api.ah.nl';
const CLIENT_ID = 'appie';

/**
 * Die App-Kennung ist erforderlich – ohne `x-application` antwortet die
 * Suche mit HTTP 500 statt mit einem verständlichen Fehler.
 */
const HEADERS = {
  'User-Agent': 'Appie/8.22.3 Model/phone, Android/7.0-API24',
  'x-application': 'AHWEBSHOP',
  Accept: 'application/json',
} as const;

/** Rohform eines Produkts, wie AH es liefert (nur die genutzten Felder). */
interface AhProduct {
  webshopId: number;
  title: string;
  brand?: string;
  salesUnitSize?: string;
  unitPriceDescription?: string;
  currentPrice?: number;
  priceBeforeBonus?: number;
  mainCategory?: string;
  subCategory?: string;
  images?: { width: number; height: number; url: string }[];
  isBonus?: boolean;
  isOrderable?: boolean;
  orderAvailabilityStatus?: string;
}

interface AhSearchResponse {
  page: { size: number; totalElements: number; totalPages: number; number: number };
  products: AhProduct[];
}

interface AhCategory {
  id: number;
  name: string;
  slugifiedName: string;
}

interface AhToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Übersetzt die niederländische Gebindeangabe in eine rechenbare Menge.
 *
 * AH liefert Strings wie "1 kg", "500 g", "6 stuks", "1 l", "ca. 250 g".
 * Was nicht zuverlässig parsebar ist, gibt `undefined` zurück – lieber keine
 * Angabe als eine falsche, auf der später die Kaufmenge berechnet wird.
 */
export function parsePackageSize(raw: string | undefined): Quantity | undefined {
  if (!raw) return undefined;

  const match = raw
    .toLowerCase()
    .replace(',', '.')
    .match(/([\d.]+)\s*(kg|gram|gr|g|liter|ltr|l|ml|cl|stuks|stuk|st)\b/);
  if (!match) return undefined;

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return undefined;

  const unitMap: Record<string, Unit> = {
    kg: 'kg',
    gram: 'g',
    gr: 'g',
    g: 'g',
    liter: 'l',
    ltr: 'l',
    l: 'l',
    ml: 'ml',
    stuks: 'Stueck',
    stuk: 'Stueck',
    st: 'Stueck',
  };

  // Zentiliter hat keine eigene Einheit im Domänenmodell – direkt in ml umrechnen.
  if (match[2] === 'cl') return { amount: amount * 10, unit: 'ml' };

  const unit = unitMap[match[2]];
  return unit ? { amount, unit } : undefined;
}

export class AlbertHeijnProvider implements PriceProvider {
  readonly id = 'albert-heijn';
  readonly displayName = 'Albert Heijn';
  readonly available = true;

  private token: string | null = null;
  private tokenExpiresAt = 0;
  /** Verhindert, dass parallele Anfragen mehrere Tokens gleichzeitig holen. */
  private pendingAuth: Promise<string> | null = null;

  /** Holt einen anonymen Token bzw. gibt den zwischengespeicherten zurück. */
  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    if (this.pendingAuth) return this.pendingAuth;

    this.pendingAuth = (async () => {
      const res = await fetch(`${BASE_URL}/mobile-auth/v1/auth/token/anonymous`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: CLIENT_ID }),
      });

      if (!res.ok) {
        throw new ProviderError(
          `Anonymer Token konnte nicht geholt werden (HTTP ${res.status})`,
          this.id,
          res.status,
        );
      }

      const data = (await res.json()) as AhToken;
      this.token = data.access_token;
      // 60 s Sicherheitsabstand, damit kein Request in den Ablauf hineinläuft.
      this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
      return this.token;
    })();

    try {
      return await this.pendingAuth;
    } finally {
      this.pendingAuth = null;
    }
  }

  private async authedFetch(path: string): Promise<unknown> {
    const token = await this.getToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new ProviderError(
        `Albert Heijn antwortete mit HTTP ${res.status} auf ${path}`,
        this.id,
        res.status,
      );
    }
    return res.json();
  }

  async searchProducts(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const size = options.size ?? 10;
    const page = options.page ?? 0;
    const params = new URLSearchParams({
      query,
      size: String(size),
      page: String(page),
    });

    const data = (await this.authedFetch(
      `/mobile-services/product/search/v2?${params}`,
    )) as AhSearchResponse;

    return {
      products: (data.products ?? []).map((p) => this.toProduct(p)),
      totalResults: data.page?.totalElements ?? 0,
    };
  }

  async getCategories(): Promise<Category[]> {
    const data = (await this.authedFetch(
      '/mobile-services/v1/product-shelves/categories',
    )) as AhCategory[];

    return (data ?? []).map((c) => ({
      id: String(c.id),
      name: c.name,
      slug: c.slugifiedName,
    }));
  }

  /** Bildet die AH-Rohform auf das anbieterneutrale Product-Modell ab. */
  private toProduct(p: AhProduct): Product {
    // AH liefert bei Aktionen currentPrice < priceBeforeBonus. Ohne Aktion
    // ist currentPrice teils nicht gesetzt, dann gilt priceBeforeBonus.
    const price = p.currentPrice ?? p.priceBeforeBonus ?? 0;
    const onSale =
      p.isBonus === true &&
      p.priceBeforeBonus !== undefined &&
      p.currentPrice !== undefined &&
      p.currentPrice < p.priceBeforeBonus;

    return {
      id: String(p.webshopId),
      provider: this.id,
      title: p.title,
      brand: p.brand,
      price,
      priceBeforeDiscount: onSale ? p.priceBeforeBonus : undefined,
      packageSize: p.salesUnitSize ?? '',
      packageQuantity: parsePackageSize(p.salesUnitSize),
      unitPriceDescription: p.unitPriceDescription,
      category: p.mainCategory,
      // Das größte gelieferte Bild ist für Produktkacheln völlig ausreichend.
      imageUrl: p.images?.at(-1)?.url,
      isOnSale: onSale,
      isAvailable: p.isOrderable !== false,
    };
  }
}
