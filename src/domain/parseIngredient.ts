/**
 * Zerlegt eine frei getippte Zutat in Name, Menge und Einheit.
 *
 *   „Milch 0,5 l"        → Milch · 0,5 l
 *   „500g Hackfleisch"   → Hackfleisch · 500 g
 *   „2 Zehen Knoblauch"  → Knoblauch · 2 Zehe
 *   „3 Eier"             → Eier · 3 Stück
 *   „Petersilie"         → Petersilie · 1 Stück (geraten)
 *
 * Bewusst ohne Sprachmodell: Das hier ist ein Parser, kein Verständnis-
 * problem. Ein LLM wäre langsamer, teurer und für „500g Mehl" nicht besser.
 * Für echten Fließtext („Für den Teig nehmen Sie…") ist es der richtige
 * Weg — dafür kommt der Import in Sprint 3.
 */

import type { Quantity, Unit } from './units';

/** Schreibweisen → kanonische Einheit. Alles kleingeschrieben verglichen. */
const UNIT_WORDS: Record<string, Unit> = {
  g: 'g', gr: 'g', gramm: 'g', gramms: 'g', gramme: 'g',
  kg: 'kg', kilo: 'kg', kilogramm: 'kg',
  ml: 'ml', milliliter: 'ml',
  l: 'l', ltr: 'l', liter: 'l',
  el: 'EL', esslöffel: 'EL', essloeffel: 'EL', eßlöffel: 'EL',
  tl: 'TL', teelöffel: 'TL', teeloeffel: 'TL',
  stück: 'Stueck', stueck: 'Stueck', stk: 'Stueck', st: 'Stueck', x: 'Stueck',
  prise: 'Prise', prisen: 'Prise', msp: 'Msp', messerspitze: 'Msp',
  bund: 'Bund', bd: 'Bund',
  zehe: 'Zehe', zehen: 'Zehe',
  packung: 'Packung', packungen: 'Packung', pck: 'Packung', pkg: 'Packung', pack: 'Packung',
  dose: 'Dose', dosen: 'Dose',
};

/**
 * Übersetzt eine einzelne Einheitenangabe.
 *
 * Wird gebraucht, wenn die Menge bereits getrennt vorliegt — etwa beim
 * Import, wo die Quelle „4,0 | EL | Öl" liefert statt „4 EL Öl". Verträgt
 * die dort üblichen Schreibweisen mit Klammerplural und Punkt: „Prise(n)",
 * „Zehe(n)", „Pck.".
 */
export function parseUnitWord(raw: string | undefined): Unit | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/\(n\)|\(e\)|\(en\)/g, '')
    .replace(/\.$/, '')
    .trim();
  return UNIT_WORDS[cleaned] ?? null;
}

/** Wandelt „4,0", „1.5" oder „1/2" in eine Zahl. Null, wenn unbrauchbar. */
export function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  return toNumber(raw.trim());
}

export interface ParsedIngredient {
  name: string;
  quantity: Quantity;
  /** War eine Menge im Text, oder wurde „1 Stück" angenommen? */
  hasAmount: boolean;
  /** Stand eine Einheit dabei, oder wurde auf Stück geraten? */
  hasUnit: boolean;
}

/** Wandelt „0,5", „1.5" und „1/2" in eine Zahl. */
function toNumber(raw: string): number | null {
  const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }
  const value = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/**
 * Trennt zusammengeschriebene Angaben wie „0,5l" oder „500g".
 * Gibt `null` zurück, wenn das Wort keine solche Kombination ist.
 */
function splitAmountUnit(token: string): { amount: string; unit: string } | null {
  const match = token.match(/^(\d+(?:[.,]\d+)?)([a-zäöüß]+)$/i);
  if (!match) return null;
  return { amount: match[1], unit: match[2].toLowerCase() };
}

/**
 * Zerlegt die Eingabe. Gibt `null` zurück, wenn kein Name übrig bleibt —
 * eine Zutat ohne Namen ist nichts, was man kaufen könnte.
 */
export function parseIngredientInput(input: string): ParsedIngredient | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let amount: number | null = null;
  let unit: Unit | null = null;
  const nameParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Die erste erkannte Menge gewinnt. „2-3 EL" wird damit zu 2 — lieber
    // die untere Grenze als eine Spanne, die nirgends hinpasst.
    if (amount === null) {
      const combined = splitAmountUnit(token);
      if (combined) {
        const parsed = toNumber(combined.amount);
        const mapped = UNIT_WORDS[combined.unit];
        if (parsed !== null && mapped) {
          amount = parsed;
          unit = mapped;
          continue;
        }
      }

      // Reine Zahl, Einheit steht im nächsten Wort — oder gar nicht.
      const bare = toNumber(token.replace(/^(\d+)-\d+$/, '$1'));
      if (bare !== null && /^[\d.,/-]+$/.test(token)) {
        amount = bare;
        const next = tokens[i + 1]?.toLowerCase().replace(/[.,]$/, '');
        if (next && UNIT_WORDS[next]) {
          unit = UNIT_WORDS[next];
          i++; // Einheit gehört nicht zum Namen
        }
        continue;
      }
    }

    nameParts.push(token);
  }

  const name = nameParts.join(' ').replace(/^(von|an|)\s+/i, '').trim();
  if (!name) return null;

  return {
    name,
    quantity: { amount: amount ?? 1, unit: unit ?? 'Stueck' },
    hasAmount: amount !== null,
    hasUnit: unit !== null,
  };
}
