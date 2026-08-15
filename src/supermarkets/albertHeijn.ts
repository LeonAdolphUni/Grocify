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
  type Nutrition,
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

interface AhImage {
  width: number;
  height: number;
  url: string;
}

/**
 * Wählt aus AHs Bildliste die passende Größe.
 *
 * Die Liste ist **nicht** nach Größe sortiert — sie kommt in der Reihenfolge
 * 800, 400, 200, 48, 80. Einfach das erste oder letzte Element zu nehmen
 * liefert deshalb ein Vorschaubild von 80 Pixeln, das auf einer Kachel zu
 * Matsch wird.
 *
 * Gewählt wird das kleinste Bild, das noch groß genug ist: scharf genug für
 * die Anzeige, ohne unnötig Daten zu laden. Gibt es keins, das reicht,
 * gewinnt das größte verfügbare.
 */
export function pickImageUrl(images: AhImage[] | undefined, minWidth: number): string | undefined {
  if (!images?.length) return undefined;
  const bySize = [...images].sort((a, b) => a.width - b.width);
  return (bySize.find((img) => img.width >= minWidth) ?? bySize[bySize.length - 1]).url;
}

/**
 * Nährwerte, wie AH sie liefert: GS1-GDSN.
 *
 * Ein sperriges, aber standardisiertes Format — dieselben Codes benutzt
 * jeder Händler, der GDSN-Daten weitergibt. Ein Wechsel der Datenquelle
 * müsste diesen Teil also womöglich gar nicht anfassen.
 */
interface AhNutrientDetail {
  nutrientTypeCode?: { value?: string; label?: string };
  quantityContained?: { value?: number; measurementUnitCode?: { value?: string } }[];
}

interface AhNutrientHeader {
  nutrientBasisQuantity?: { value?: number; measurementUnitCode?: { value?: string } };
  nutrientDetail?: AhNutrientDetail[];
}

interface AhDetailResponse {
  productCard?: AhProduct;
  tradeItem?: {
    nutritionalInformation?: { nutrientHeaders?: AhNutrientHeader[] };
  };
}

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
  images?: { width: number; height: number; url: string }[];
}

/** Antwortform von .../categories/{id}/sub-categories — Objekt, kein Array. */
interface AhSubCategories {
  parent: AhCategory;
  children: AhCategory[];
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
/**
 * Erkennt Mehrfachpacks am Titel.
 *
 * AH verkauft Eier online nur als „3-pack" — drei Kartons zu je zehn Stück.
 * Die Gebindeangabe lautet trotzdem „3 stuks". Wer das als drei Eier liest,
 * kauft für zehn benötigte Eier vier Mehrfachpacks: 28,40 € statt 7,47 €.
 *
 * Die Zahl der Einheiten pro Karton steht nirgends in den Daten. Statt sie
 * zu raten, gilt die Gebindegröße hier als unbekannt — dann wird eine
 * Packung angenommen und die Zeile zum Prüfen markiert.
 */
function isMultipack(title: string | undefined): boolean {
  return /\d+\s*-?\s*pack\b/i.test(title ?? '');
}

export function parsePackageSize(raw: string | undefined, title?: string): Quantity | undefined {
  if (!raw) return undefined;
  if (isMultipack(title)) return undefined;

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

  async getProductById(id: string): Promise<Product | null> {
    const data = await this.fetchDetail(id);
    return data?.productCard ? this.toProduct(data.productCard) : null;
  }

  /**
   * Nährwerte je 100 g/ml.
   *
   * AH liefert sie im GS1-GDSN-Format: eine Liste `nutrientHeaders`, je Kopf
   * eine Bezugsgröße (fast immer 100 g) und darunter `nutrientDetail` mit
   * standardisierten Codes — `ENER-` für Energie, `FAT` für Fett, `PRO-` für
   * Eiweiß. Energie steht zweimal drin, einmal in Kilojoule und einmal in
   * Kilokalorien; unterschieden wird an der **Einheit**, nicht am Code.
   *
   * Frischware ohne Herstellerangabe gibt `null` — bei losem Gemüse und der
   * Backtheke ist das der Normalfall, kein Fehler.
   */
  async getNutrition(productId: string): Promise<Nutrition | null> {
    const data = await this.fetchDetail(productId);

    const headers = data?.tradeItem?.nutritionalInformation?.nutrientHeaders ?? [];
    // Den Kopf mit Bezug auf 100 nehmen. Manche Produkte melden zusätzlich
    // „je Portion" — eine andere Bezugsgröße, die die Summe verfälschen würde.
    const header = headers.find((h) => h.nutrientBasisQuantity?.value === 100) ?? headers[0];
    if (!header?.nutrientDetail?.length) return null;

    const basisUnit = header.nutrientBasisQuantity?.measurementUnitCode?.value?.toLowerCase();
    const nutrition: Nutrition = { basis: basisUnit === 'ml' ? 'ml' : 'g' };

    for (const detail of header.nutrientDetail) {
      const code = detail.nutrientTypeCode?.value;
      const quantity = detail.quantityContained?.[0];
      const value = quantity?.value;
      if (!code || typeof value !== 'number') continue;
      const unit = quantity?.measurementUnitCode?.value?.toLowerCase();

      switch (code) {
        case 'ENER-':
          if (unit === 'kcal') nutrition.kcal = value;
          else if (unit === 'kj') nutrition.kilojoule = value;
          break;
        case 'FAT':
          nutrition.fat = value;
          break;
        case 'FASAT':
          nutrition.saturatedFat = value;
          break;
        case 'CHOAVL':
          nutrition.carbs = value;
          break;
        case 'SUGAR-':
        case 'SUGAR':
          nutrition.sugar = value;
          break;
        case 'FIBTG':
          nutrition.fiber = value;
          break;
        case 'PRO-':
          nutrition.protein = value;
          break;
        case 'SALTEQ':
          nutrition.salt = value;
          break;
      }
    }

    // Kilokalorien fehlen, Kilojoule sind da: umrechnen statt nichts zeigen.
    if (nutrition.kcal === undefined && nutrition.kilojoule !== undefined) {
      nutrition.kcal = Math.round(nutrition.kilojoule / 4.184);
    }

    // Ein Kopf ohne einen einzigen verwertbaren Wert ist so gut wie keiner.
    const hatWert = Object.entries(nutrition).some(([k, v]) => k !== 'basis' && v !== undefined);
    return hatWert ? nutrition : null;
  }

  /** Detailabruf — von getProductById und getNutrition gemeinsam genutzt. */
  private async fetchDetail(id: string): Promise<AhDetailResponse | null> {
    try {
      return (await this.authedFetch(
        `/mobile-services/product/detail/v4/fir/${id}`,
      )) as AhDetailResponse;
    } catch (err) {
      // 404 heißt: ausgelistet. Das ist ein Normalfall — der Aufrufer fällt
      // dann auf die normale Suche zurück. Alles andere wird durchgereicht.
      if (err instanceof ProviderError && err.status === 404) return null;
      throw err;
    }
  }

  async getCategories(): Promise<Category[]> {
    const data = (await this.authedFetch(
      '/mobile-services/v1/product-shelves/categories',
    )) as AhCategory[];

    return (data ?? []).map((c) => this.toCategory(c));
  }

  async getSubCategories(categoryId: string): Promise<Category[]> {
    const data = (await this.authedFetch(
      `/mobile-services/v1/product-shelves/categories/${categoryId}/sub-categories`,
    )) as AhSubCategories;

    return (data?.children ?? []).map((c) => this.toCategory(c));
  }

  async browseCategory(categoryId: string, options: SearchOptions = {}): Promise<SearchResult> {
    // Dieselbe Suche wie sonst, nur ohne Suchbegriff und mit Abteilungsfilter.
    const params = new URLSearchParams({
      taxonomyId: categoryId,
      size: String(options.size ?? 25),
      page: String(options.page ?? 0),
    });

    const data = (await this.authedFetch(
      `/mobile-services/product/search/v2?${params}`,
    )) as AhSearchResponse;

    return {
      products: (data.products ?? []).map((p) => this.toProduct(p)),
      totalResults: data.page?.totalElements ?? 0,
    };
  }

  private toCategory(c: AhCategory): Category {
    return {
      id: String(c.id),
      name: c.name,
      slug: c.slugifiedName,
      // Abteilungskacheln sind mehrere hundert Pixel breit.
      imageUrl: pickImageUrl(c.images, 400),
    };
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
      packageQuantity: parsePackageSize(p.salesUnitSize, p.title),
      unitPriceDescription: p.unitPriceDescription,
      category: p.mainCategory,
      // 200 px reicht für ein Vorschaubild von 52 px auch auf einem
      // hochauflösenden Bildschirm.
      imageUrl: pickImageUrl(p.images, 200),
      isOnSale: onSale,
      isAvailable: p.isOrderable !== false,
    };
  }
}
