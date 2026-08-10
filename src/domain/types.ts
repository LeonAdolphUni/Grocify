/**
 * Kern-Datenmodell von Grocify.
 *
 * Reine Typen und reine Funktionen – kein Netzwerk, keine UI.
 */

import type { Quantity } from './units';

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
