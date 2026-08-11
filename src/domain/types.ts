/**
 * Kern-Datenmodell von Grocify.
 *
 * Reine Typen und reine Funktionen – kein Netzwerk, keine UI.
 */

import type { Quantity } from './units';

/**
 * Ein vom Nutzer beim Anlegen fest gewähltes Produkt.
 *
 * Bewusst nur eine Notiz, kein Ersatz für die Zutat: Das Rezept bleibt über
 * Name und Menge definiert und damit auf andere Supermärkte übertragbar.
 * Ein Rezept, das nur aus Artikelnummern besteht, wäre beim Marktwechsel
 * wertlos — und die späteren Text- und Foto-Importe liefern ohnehin Namen.
 *
 * `title` und `packageSize` sind eine Kopie für die Anzeige, damit die
 * Zutatenliste auch ohne Netz etwas zeigen kann. Der Preis wird bewusst
 * NICHT mitgespeichert: Er wird beim Bauen der Einkaufsliste frisch geholt.
 */
export interface PinnedProduct {
  provider: string;
  id: string;
  title: string;
  packageSize: string;
}

/**
 * Eine Zutat, wie sie im Rezept steht, plus die kanonische Zuordnung.
 *
 * `rawText` ist immer das Original aus dem Rezept. Das behalten wir, damit
 * man bei falscher Erkennung nachvollziehen kann, woher sie kam.
 */
export interface Ingredient {
  /** Kanonische ID, z. B. "tarwebloem". Sprint 6 füllt das. */
  id: string;
  /** Anzeigename in der Sprache des Rezepts, z. B. "Weizenmehl". */
  name: string;
  /**
   * Niederländischer Suchbegriff für die Supermarkt-Suche, z. B. "tarwebloem".
   * Deutsche Rezepte + niederländische Sortimente – diese Brücke ist Pflicht,
   * kein Komfort.
   */
  searchTermNl?: string;
  quantity: Quantity;
  rawText: string;
  /** Vorratsware (Salz, Pfeffer, Öl): standardmäßig nicht auf der Einkaufsliste. */
  isPantryStaple: boolean;
  /**
   * Vom Nutzer beim Anlegen gewähltes Produkt. Ist es gesetzt und passt der
   * Supermarkt, wird nicht gesucht, sondern genau dieses Produkt genommen —
   * die zuverlässigste Zuordnung, die es gibt.
   */
  pinnedProduct?: PinnedProduct;
}

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  ingredients: Ingredient[];
  sourceUrl?: string;
  /**
   * Zubereitungstext bewusst optional und niemals serverseitig gespeichert:
   * Zutatenlisten sind in der Regel nicht urheberrechtlich geschützt,
   * Zubereitungstexte schon.
   */
  instructions?: string;
}

/** Ein konkretes Produkt im Supermarktregal, normalisiert über alle Anbieter. */
export interface Product {
  /** ID beim jeweiligen Anbieter. */
  id: string;
  /** Anbieter-Kennung, z. B. "albert-heijn". */
  provider: string;
  title: string;
  brand?: string;
  /** Aktueller Preis in Euro. */
  price: number;
  /** Regulärer Preis, falls das Produkt gerade im Angebot ist. */
  priceBeforeDiscount?: number;
  /** Gebindegröße als Rohtext, z. B. "1 kg". */
  packageSize: string;
  /** Gebindegröße als Menge, sofern parsebar. Basis für die Kaufmengen-Logik. */
  packageQuantity?: Quantity;
  /** Grundpreis-Text des Anbieters, z. B. "prijs per kg €0.85". */
  unitPriceDescription?: string;
  /** Supermarkt-Abteilung, z. B. "Bakkerij". Basis für die Sortierung der Liste. */
  category?: string;
  imageUrl?: string;
  isOnSale: boolean;
  isAvailable: boolean;
}

/**
 * Eine Zeile der fertigen Einkaufsliste.
 *
 * Wichtig ist die Trennung von Bedarf und Kauf: Das Rezept braucht 200 g Mehl,
 * die kleinste Packung hat 1 kg. Gekauft wird 1 Packung, verbraucht werden 20 %.
 */
export interface ShoppingListItem {
  ingredient: Ingredient;
  product: Product | null;
  /** Was das Rezept tatsächlich braucht. */
  requiredQuantity: Quantity;
  /** Wie viele Packungen davon gekauft werden müssen. */
  packagesToBuy: number;
  /** packagesToBuy × Produktpreis. */
  lineTotal: number;
  /** Kein Produkt gefunden – Nutzer muss selbst zuordnen. */
  needsManualMatch: boolean;
  /** Warum diese Zeile Aufmerksamkeit braucht, in Klartext für die UI. */
  note?: string;
  checked: boolean;

  /**
   * Anteil des gekauften Gebindes, der tatsächlich gebraucht wird (0…1).
   *
   * Das ist die eigentlich interessante Zahl: Wer 1 kg Mehl für 300 g Bedarf
   * kauft, wirft 70 % in den Schrank. Ein Wochenplan, der Zutaten über
   * mehrere Tage verwertet, hebt diesen Wert — und genau das macht ihn
   * messbar besser als sieben einzeln geplante Abende.
   *
   * `undefined`, wenn Bedarf oder Gebinde nicht rechenbar sind.
   */
  utilization?: number;
  /** Was nach dem Kochen übrig bleibt, in der Einheit des Gebindes. */
  leftover?: Quantity;
  /** Geldwert des Rests. Anteilig am Zeilenpreis, nicht exakt. */
  leftoverValue: number;
}

export interface ShoppingList {
  id: string;
  recipes: Recipe[];
  items: ShoppingListItem[];
  provider: string;
  /**
   * Gesamtsumme in Euro. Bezieht sich auf die gekauften Packungen,
   * nicht auf den anteiligen Verbrauch.
   */
  total: number;
  createdAt: string;
}

/**
 * Wie viele Packungen braucht man, um den Bedarf zu decken?
 *
 * Immer aufgerundet: Man kann keine halbe Packung kaufen. Gibt `null` zurück,
 * wenn Bedarf und Gebinde nicht dieselbe Dimension haben (z. B. Bedarf in ml,
 * Gebinde in Stück) – dann muss der Nutzer entscheiden.
 */
export function packagesNeeded(
  requiredBase: { amount: number; dimension: string },
  packageBase: { amount: number; dimension: string },
): number | null {
  if (requiredBase.dimension !== packageBase.dimension) return null;
  if (packageBase.amount <= 0) return null;
  return Math.ceil(requiredBase.amount / packageBase.amount);
}

/** Summiert die Zeilensummen einer Liste auf, auf Cent gerundet. */
export function calculateTotal(items: ShoppingListItem[]): number {
  const sum = items.reduce((acc, item) => acc + item.lineTotal, 0);
  return Math.round(sum * 100) / 100;
}

/** Kennzahlen einer Einkaufsliste — Grundlage des Statistikfensters. */
export interface ListStats {
  total: number;
  /** Positionen, die einem Produkt zugeordnet werden konnten. */
  matched: number;
  unmatched: number;
  /** Anzahl Packungen im Einkaufswagen. */
  packages: number;
  /** Gewichteter Anteil des Eingekauften, der tatsächlich verkocht wird. */
  utilization: number | null;
  /** Geldwert dessen, was übrig bleibt. */
  leftoverValue: number;
  /** Gesamtzahl geplanter Portionen über alle Rezepte. */
  servings: number;
  /** Preis je Portion. `null`, wenn keine Portionen bekannt sind. */
  pricePerServing: number | null;
  /** Teuerste Position — dort lohnt sich das Nachjustieren am meisten. */
  mostExpensive: ShoppingListItem | null;
}

export function calculateStats(list: ShoppingList): ListStats {
  const items = list.items;
  const matched = items.filter((i) => i.product !== null);
  const servings = list.recipes.reduce((n, r) => n + r.servings, 0);

  // Verwertung nach Geldwert gewichten, nicht nach Zeilenzahl: Ein Rest
  // Basilikum für 20 Cent wiegt nicht so schwer wie ein halbes Stück Käse.
  const weighable = matched.filter((i) => i.utilization !== undefined);
  const weighedValue = weighable.reduce((sum, i) => sum + i.lineTotal, 0);
  const utilization =
    weighedValue > 0
      ? weighable.reduce((sum, i) => sum + (i.utilization ?? 0) * i.lineTotal, 0) / weighedValue
      : null;

  const total = calculateTotal(items);

  return {
    total,
    matched: matched.length,
    unmatched: items.length - matched.length,
    packages: items.reduce((n, i) => n + i.packagesToBuy, 0),
    utilization,
    leftoverValue: Math.round(items.reduce((s, i) => s + i.leftoverValue, 0) * 100) / 100,
    servings,
    pricePerServing: servings > 0 ? Math.round((total / servings) * 100) / 100 : null,
    mostExpensive:
      matched.length > 0
        ? matched.reduce((a, b) => (b.lineTotal > a.lineTotal ? b : a))
        : null,
  };
}
