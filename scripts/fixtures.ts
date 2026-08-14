/**
 * Testdaten für die Messskripte.
 *
 * Diese Rezepte waren früher als „Beispielwoche" in der App und sind dort
 * bewusst entfernt worden — die App startet jetzt leer, mit deinen eigenen
 * Daten aus der Datenbank.
 *
 * Als Vorlage für die Messungen bleiben sie erhalten: Ohne feste Rezepte
 * ließe sich nicht vergleichen, ob eine Änderung an der Produktzuordnung
 * die Einkaufsliste besser oder schlechter macht. Sie liegen deshalb unter
 * `scripts/` und werden nie mit der App ausgeliefert.
 *
 * Die Mengen sind so abgestimmt, dass gemeinsame Zutaten aufgehen:
 * Tomaten 2 × 500 g über zwei Tage, Sahne 250 ml über zwei, Champignons
 * 250 g über zwei, Mehl 800 g von einem Kilo.
 */

import { isPantryStaple, normalizeKey, toDutchSearchTerm } from '../src/domain/translate';
import type { Ingredient, Recipe } from '../src/domain/types';
import type { Unit } from '../src/domain/units';

interface Row {
  name: string;
  amount: number;
  unit: Unit;
}

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

function recipe(id: string, title: string, rows: Row[]): Recipe {
  return { id, title, servings: 4, ingredients: rows.map(toIngredient) };
}

const SALT_AND_PEPPER: Row[] = [
  { name: 'Salz', amount: 1, unit: 'Prise' },
  { name: 'Pfeffer', amount: 1, unit: 'Prise' },
];

export const TEST_RECIPES: Recipe[] = [
  recipe('t-bolognese', 'Spaghetti Bolognese', [
    { name: 'Spaghetti', amount: 400, unit: 'g' },
    { name: 'Hackfleisch', amount: 500, unit: 'g' },
    { name: 'Zwiebel', amount: 1, unit: 'Stueck' },
    { name: 'Knoblauch', amount: 2, unit: 'Zehe' },
    { name: 'Tomaten', amount: 500, unit: 'g' },
    { name: 'Tomatenmark', amount: 2, unit: 'EL' },
    { name: 'Parmesan', amount: 50, unit: 'g' },
    { name: 'Olivenöl', amount: 2, unit: 'EL' },
    ...SALT_AND_PEPPER,
  ]),
  recipe('t-tomatensuppe', 'Tomatensuppe mit Brot', [
    { name: 'Tomaten', amount: 500, unit: 'g' },
    { name: 'Zwiebel', amount: 1, unit: 'Stueck' },
    { name: 'Knoblauch', amount: 1, unit: 'Zehe' },
    { name: 'Sahne', amount: 100, unit: 'ml' },
    { name: 'Brot', amount: 1, unit: 'Stueck' },
    ...SALT_AND_PEPPER,
  ]),
  recipe('t-pfannkuchen', 'Pfannkuchen', [
    { name: 'Mehl', amount: 300, unit: 'g' },
    { name: 'Milch', amount: 600, unit: 'ml' },
    { name: 'Eier', amount: 4, unit: 'Stueck' },
    { name: 'Salz', amount: 1, unit: 'Prise' },
  ]),
  recipe('t-gratin', 'Kartoffelgratin', [
    { name: 'Kartoffeln', amount: 800, unit: 'g' },
    { name: 'Sahne', amount: 150, unit: 'ml' },
    { name: 'Milch', amount: 200, unit: 'ml' },
    { name: 'Käse', amount: 100, unit: 'g' },
    { name: 'Knoblauch', amount: 1, unit: 'Zehe' },
    ...SALT_AND_PEPPER,
  ]),
  recipe('t-pizza', 'Pizza mit Champignons', [
    { name: 'Mehl', amount: 500, unit: 'g' },
    { name: 'Tomatenmark', amount: 2, unit: 'EL' },
    { name: 'Mozzarella', amount: 125, unit: 'g' },
    { name: 'Champignons', amount: 150, unit: 'g' },
    { name: 'Olivenöl', amount: 2, unit: 'EL' },
  ]),
  recipe('t-omelett', 'Champignon-Omelett', [
    { name: 'Eier', amount: 6, unit: 'Stueck' },
    { name: 'Champignons', amount: 100, unit: 'g' },
    { name: 'Käse', amount: 50, unit: 'g' },
    { name: 'Milch', amount: 100, unit: 'ml' },
    ...SALT_AND_PEPPER,
  ]),
  recipe('t-reispfanne', 'Reispfanne mit Hähnchen', [
    { name: 'Reis', amount: 300, unit: 'g' },
    { name: 'Hähnchenbrust', amount: 400, unit: 'g' },
    { name: 'Paprika', amount: 2, unit: 'Stueck' },
    { name: 'Zwiebel', amount: 1, unit: 'Stueck' },
    { name: 'Knoblauch', amount: 1, unit: 'Zehe' },
    { name: 'Olivenöl', amount: 2, unit: 'EL' },
    ...SALT_AND_PEPPER,
  ]),
];

/** Ein einzelnes Rezept für kleinere Prüfungen. */
export const TEST_RECIPE = TEST_RECIPES[0];
