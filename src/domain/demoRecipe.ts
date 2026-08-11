/**
 * Beispieldaten: ein einzelnes Rezept und ein kompletter Wochenplan.
 *
 * Der Wochenplan ist bewusst so entworfen, dass gemeinsame Zutaten
 * aufgehen: Tomaten 2 × 500 g über zwei Tage, Sahne 250 ml über zwei,
 * Champignons 250 g über zwei, Mehl 800 g von einem Kilo. Das ist der
 * ganze Witz an einer geplanten Woche — sieben einzeln geplante Abende
 * kaufen sieben Mal ein Gebinde an, von dem jedes Mal etwas übrig bleibt.
 *
 * Bewusst ohne fest gewählte Produkte und ohne hartkodierte Artikelnummern:
 * Die veralten, sobald Albert Heijn etwas auslistet.
 */

import { isPantryStaple, normalizeKey, toDutchSearchTerm } from './translate';
import type { Ingredient, Recipe } from './types';
import type { Unit } from './units';
import { emptyWeek, type WeekPlan, type Weekday } from './weekPlan';

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

function recipe(id: string, title: string, servings: number, rows: Row[]): Recipe {
  return { id, title, servings, ingredients: rows.map(toIngredient) };
}

const SALT_AND_PEPPER: Row[] = [
  { name: 'Salz', amount: 1, unit: 'Prise' },
  { name: 'Pfeffer', amount: 1, unit: 'Prise' },
];

/** Definition der Woche: Tag → Rezept. */
const WEEK: { day: Weekday; id: string; title: string; rows: Row[] }[] = [
  {
    day: 'mo',
    id: 'demo-bolognese',
    title: 'Spaghetti Bolognese',
    rows: [
      { name: 'Spaghetti', amount: 400, unit: 'g' },
      { name: 'Hackfleisch', amount: 500, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'Stueck' },
      { name: 'Knoblauch', amount: 2, unit: 'Zehe' },
      { name: 'Tomaten', amount: 500, unit: 'g' }, // + Di = 1000 g = 2 Packungen
      { name: 'Tomatenmark', amount: 2, unit: 'EL' },
      { name: 'Parmesan', amount: 50, unit: 'g' },
      { name: 'Olivenöl', amount: 2, unit: 'EL' },
      ...SALT_AND_PEPPER,
    ],
  },
  {
    day: 'di',
    id: 'demo-tomatensuppe',
    title: 'Tomatensuppe mit Brot',
    rows: [
      { name: 'Tomaten', amount: 500, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'Stueck' },
      { name: 'Knoblauch', amount: 1, unit: 'Zehe' },
      { name: 'Sahne', amount: 100, unit: 'ml' }, // + Do = 250 ml
      { name: 'Brot', amount: 1, unit: 'Stueck' },
      ...SALT_AND_PEPPER,
    ],
  },
  {
    day: 'mi',
    id: 'demo-pfannkuchen',
    title: 'Pfannkuchen',
    rows: [
      { name: 'Mehl', amount: 300, unit: 'g' }, // + Fr = 800 g von 1 kg
      { name: 'Milch', amount: 600, unit: 'ml' },
      { name: 'Eier', amount: 4, unit: 'Stueck' },
      { name: 'Salz', amount: 1, unit: 'Prise' },
    ],
  },
  {
    day: 'do',
    id: 'demo-gratin',
    title: 'Kartoffelgratin',
    rows: [
      { name: 'Kartoffeln', amount: 800, unit: 'g' },
      { name: 'Sahne', amount: 150, unit: 'ml' },
      { name: 'Milch', amount: 200, unit: 'ml' },
      { name: 'Käse', amount: 100, unit: 'g' },
      { name: 'Knoblauch', amount: 1, unit: 'Zehe' },
      ...SALT_AND_PEPPER,
    ],
  },
  {
    day: 'fr',
    id: 'demo-pizza',
    title: 'Pizza mit Champignons',
    rows: [
      { name: 'Mehl', amount: 500, unit: 'g' },
      { name: 'Tomatenmark', amount: 2, unit: 'EL' },
      { name: 'Mozzarella', amount: 125, unit: 'g' },
      { name: 'Champignons', amount: 150, unit: 'g' }, // + Sa = 250 g
      { name: 'Olivenöl', amount: 2, unit: 'EL' },
    ],
  },
  {
    day: 'sa',
    id: 'demo-omelett',
    title: 'Champignon-Omelett',
    rows: [
      { name: 'Eier', amount: 6, unit: 'Stueck' },
      { name: 'Champignons', amount: 100, unit: 'g' },
      { name: 'Käse', amount: 50, unit: 'g' },
      { name: 'Milch', amount: 100, unit: 'ml' },
      ...SALT_AND_PEPPER,
    ],
  },
  {
    day: 'so',
    id: 'demo-reispfanne',
    title: 'Reispfanne mit Hähnchen',
    rows: [
      { name: 'Reis', amount: 300, unit: 'g' },
      { name: 'Hähnchenbrust', amount: 400, unit: 'g' },
      { name: 'Paprika', amount: 2, unit: 'Stueck' },
      { name: 'Zwiebel', amount: 1, unit: 'Stueck' },
      { name: 'Knoblauch', amount: 1, unit: 'Zehe' },
      { name: 'Olivenöl', amount: 2, unit: 'EL' },
      ...SALT_AND_PEPPER,
    ],
  },
];

/** Alle sieben Rezepte des Beispielplans. */
export function createDemoRecipes(): Recipe[] {
  return WEEK.map((e) => recipe(e.id, e.title, 4, e.rows));
}

/** Der Beispiel-Wochenplan, passend zu `createDemoRecipes`. */
export function createDemoWeekPlan(id: string): WeekPlan {
  const plan = emptyWeek(id, 'Beispielwoche');
  for (const entry of WEEK) plan.days[entry.day] = [entry.id];
  return plan;
}

/** Einzelnes Beispielrezept — für den schnellen Blick ohne ganze Woche. */
export function createDemoRecipe(id: string): Recipe {
  const bolo = WEEK[0];
  return recipe(id, bolo.title, 4, bolo.rows);
}
