/**
 * Beispielrezept zum Ausprobieren.
 *
 * Bewusst ohne fest gewählte Produkte: So zeigt es, was die automatische
 * Zuordnung von allein hinbekommt, und man sieht den Unterschied, sobald
 * man selbst ein Produkt wählt.
 *
 * Ebenfalls bewusst keine hartkodierten Artikelnummern — die veralten,
 * sobald Albert Heijn etwas auslistet, und ein Beispiel, das nach ein paar
 * Monaten kaputte Zuordnungen zeigt, ist schlimmer als keines.
 */

import { isPantryStaple, normalizeKey, toDutchSearchTerm } from './translate';
import type { Ingredient, Recipe } from './types';
import type { Unit } from './units';

interface Row {
  name: string;
  amount: number;
  unit: Unit;
}

const ROWS: Row[] = [
  { name: 'Spaghetti', amount: 400, unit: 'g' },
  { name: 'Hackfleisch', amount: 500, unit: 'g' },
  { name: 'Zwiebel', amount: 1, unit: 'Stueck' },
  { name: 'Knoblauch', amount: 2, unit: 'Zehe' },
  { name: 'Tomaten', amount: 400, unit: 'g' },
  { name: 'Tomatenmark', amount: 2, unit: 'EL' },
  { name: 'Parmesan', amount: 50, unit: 'g' },
  { name: 'Basilikum', amount: 1, unit: 'Bund' },
  // Die letzten drei sind Vorratsware und fallen auf der Einkaufsliste
  // automatisch heraus — auch das gehört zum Beispiel.
  { name: 'Olivenöl', amount: 2, unit: 'EL' },
  { name: 'Salz', amount: 1, unit: 'Prise' },
  { name: 'Pfeffer', amount: 1, unit: 'Prise' },
];

function toIngredient(row: Row): Ingredient {
  return {
    id: normalizeKey(row.name),
    name: row.name,
    searchTermNl: toDutchSearchTerm(row.name),
    quantity: { amount: row.amount, unit: row.unit },
    rawText: `${row.amount} ${row.unit} ${row.name}`,
    isPantryStaple: isPantryStaple(row.name),
  };
}

/** Erzeugt das Beispielrezept mit der übergebenen ID. */
export function createDemoRecipe(id: string): Recipe {
  return {
    id,
    title: 'Spaghetti Bolognese',
    servings: 4,
    ingredients: ROWS.map(toIngredient),
  };
}
