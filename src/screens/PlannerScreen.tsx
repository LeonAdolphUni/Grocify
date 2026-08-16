/**
 * Der Wochenplaner — als Formular.
 *
 * Er sucht bei **Albert Heijn**, nicht im eigenen Rezeptbuch: Das wäre ein
 * Kreis — man kann nur planen, was man schon hat, und wer acht Rezepte
 * besitzt, bekommt achtmal dieselbe Woche.
 *
 * **Warum ein Formular und kein Gespräch.** Die vorige Fassung war ein
 * Chat. Beim ersten echten Durchlauf kam eine zu teure Woche heraus, und im
 * Dialog ließ sich nicht sagen, was daran stören würde: Budget, Tage und
 * Zeit kamen nie zur Sprache, weil ein Chat immer nur eine Frage auf einmal
 * stellt. Ein Formular zeigt alle Stellschrauben nebeneinander, man sieht
 * seine Einstellungen beim Ändern und kann sie vergleichen. Der Chat wirkte
 * geduldiger, war aber blinder.
 *
 * **Gesund und günstig sind die Auswahlregel, nicht Beiwerk.** Gesund kommt
 * aus AHs eigenen Nährwertangaben je Portion. Günstig ist seit dieser
 * Fassung der **echte Preis**, bei AH nachgeschlagen — vorher war es die
 * Zutatenzahl, und die misst kein Geld.
 *
 * Jeder Vorschlag trägt seine Begründung und seinen Preis. Eine Liste ohne
 * Begründung müsste man glauben; diese kann man prüfen.
 */

import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, api, type AdvisorPick } from '../api/client';
import { translateSearchQuery, type SearchLanguage } from '../domain/searchLanguage';
import { WEEKDAYS, WEEKDAY_SHORT, emptyWeek, type WeekPlan } from '../domain/weekPlan';
import { parseWishes } from '../domain/weekPlanner';
import { RecipeThumb } from '../ui/RecipeThumb';
import { Button, Header, Notice, Screen } from '../ui/components';
import { colors, euro, fonts, radius, spacing } from '../ui/theme';

interface Props {
  language: SearchLanguage;
  pantryCount: number;
  onApply: (plan: WeekPlan, picks: AdvisorPick[]) => void;
  onBack: () => void;
}

/** Anregungen für das Wunschfeld — als Umschalter, nicht als Textbausteine. */
const ANREGUNGEN = ['Pasta', 'Hähnchen', 'Suppe', 'Salat', 'Reis', 'Ofen', 'Curry', 'Vegetarisch'];

/**
 * Budgetstufen je Mahlzeit.
 *
 * Studentischer Maßstab, und seit dem Umstieg aufs Vorkochen auch
 * erreichbar: Gemessen kostet dieselbe Woche bei voller Rezeptgröße rund
 * **1,43 €** je Mahlzeit statt 4,17 € bei Einzelportionen.
 */
const BUDGETS: { label: string; value?: number }[] = [
  { label: 'bis 1,50 €', value: 1.5 },
  { label: 'bis 2,50 €', value: 2.5 },
  { label: 'bis 4 €', value: 4 },
  { label: 'egal', value: undefined },
];

/**
 * Mahlzeiten, nicht Gerichte.
 *
 * Sieben ist die Standardwoche. Vierzehn geht, weil man aus einem Topf
 * zweimal am Tag essen kann — das ist genau der Punkt am Vorkochen.
 */
const MAHLZEITEN = [4, 5, 7, 10, 14];

const ZEITEN: { label: string; value?: number }[] = [
  { label: '20 Min', value: 20 },
  { label: '30 Min', value: 30 },
  { label: '45 Min', value: 45 },
  { label: 'egal', value: undefined },
];

export function PlannerScreen({ language, pantryCount, onApply, onBack }: Props) {
  const [freitext, setFreitext] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [meals, setMeals] = useState(7);
  const [budget, setBudget] = useState<number | undefined>(2.5);
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>(undefined);
  const [vegetarisch, setVegetarisch] = useState(false);

  const [result, setResult] = useState<Awaited<ReturnType<typeof api.adviseWeek>> | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Alle Wünsche, übersetzt — Chips und Freitext zusammen. */
  const wuensche = useCallback(() => {
    const roh = [...gewaehlt, ...parseWishes(freitext)];
    return [...new Set(roh.map((w) => translateSearchQuery(w, language)).filter(Boolean))];
  }, [gewaehlt, freitext, language]);

  const suchen = useCallback(
    async (ablehnungen: string[]) => {
      setLoading(true);
      setError(null);
      try {
        setResult(
          await api.adviseWeek({
            wishes: wuensche(),
            meals,
            maxPricePerServing: budget,
            vegetarianOnly: vegetarisch,
            maxMinutes,
            rejected: ablehnungen,
          }),
        );
      } catch (err) {
        setError(err instanceof ApiError ? err.message : (err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [wuensche, meals, budget, vegetarisch, maxMinutes],
  );

  const ablehnen = useCallback(
    (pick: AdvisorPick) => {
      const naechste = [...rejected, pick.hit.id];
      setRejected(naechste);
      void suchen(naechste);
    },
    [rejected, suchen],
  );

  /**
   * Trägt die Vorschläge in die Woche ein — **einmal je Rezept**, auf den
   * Tag, an dem gekocht wird.
   *
   * Nicht auf jeden Tag, den es abdeckt: `recipesInPlan` dedupliziert
   * bewusst nicht, weil zweimal geplant zweimal einkaufen heißt. Beim
   * Vorkochen wird aber **einmal gekocht und viermal gegessen** — vier
   * Einträge würden den vierfachen Einkauf erzeugen. Der Abstand zum
   * nächsten Eintrag ist die Zahl der Mahlzeiten, damit das zweite Gericht
   * an dem Tag steht, an dem das erste aufgebraucht ist.
   */
  const uebernehmen = useCallback(() => {
    if (!result || result.picks.length === 0) return;
    const plan = emptyWeek('week-1');
    let tag = 0;
    for (const p of result.picks) {
      if (tag >= WEEKDAYS.length) break;
      plan.days[WEEKDAYS[tag]].push(p.recipe.id);
      tag += Math.max(1, p.mealsCovered);
    }
    onApply(plan, result.picks);
  }, [result, onApply]);

  const picks = result?.picks ?? [];

  /** „Mo–Do" für ein Gericht, das ab Montag vier Mahlzeiten trägt. */
  const spanne = (index: number): string => {
    let start = 0;
    for (let i = 0; i < index; i++) start += Math.max(1, picks[i].mealsCovered);
    if (start >= WEEKDAYS.length) return '';
    const laenge = Math.max(1, picks[index].mealsCovered);
    const ende = Math.min(start + laenge - 1, WEEKDAYS.length - 1);
    const von = WEEKDAY_SHORT[WEEKDAYS[start]];
    return ende > start ? `${von}–${WEEKDAY_SHORT[WEEKDAYS[ende]]}` : von;
  };

  return (
    <Screen>
      <Header
        tone="pond"
        title="Woche planen"
        subtitle={`Rezepte von Albert Heijn${pantryCount > 0 ? ` · ${pantryCount} im Vorrat` : ''}`}
        onBack={onBack}
      />

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {/* ── Das Formular ─────────────────────────────────────────── */}
        <View style={s.card}>
          <Feld
            label="Worauf hast du Lust?"
            hint="Nichts auswählen heißt: such mir was Gesundes aus."
          >
            <View style={s.chips}>
              {ANREGUNGEN.map((a) => {
                const an = gewaehlt.includes(a);
                return (
                  <Pressable
                    key={a}
                    onPress={() =>
                      setGewaehlt((v) => (an ? v.filter((x) => x !== a) : [...v, a]))
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: an }}
                    style={({ pressed }) => [s.chip, an && s.chipOn, pressed && s.pressed]}
                  >
                    <Text style={[s.chipText, an && s.chipTextOn]}>{a}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={s.input}
              value={freitext}
              onChangeText={setFreitext}
              placeholder="oder eigene Begriffe, mit Komma getrennt"
              placeholderTextColor={colors.textFaint}
              editable={!loading}
            />
          </Feld>

          <Feld
            label="Wie viele Mahlzeiten?"
            hint="Nicht Gerichte: Ein Rezept für vier ist viermal Essen. Du kochst zwei- bis dreimal die Woche."
          >
            <View style={s.row}>
              {MAHLZEITEN.map((n) => (
                <Wahl key={n} label={String(n)} on={meals === n} onPress={() => setMeals(n)} />
              ))}
            </View>
          </Feld>

          <Feld
            label="Höchstens je Mahlzeit"
            hint="Der Preis wird bei Albert Heijn nachgeschlagen, nicht geschätzt."
          >
            <View style={s.row}>
              {BUDGETS.map((b) => (
                <Wahl
                  key={b.label}
                  label={b.label}
                  on={budget === b.value}
                  onPress={() => setBudget(b.value)}
                  wide
                />
              ))}
            </View>
          </Feld>

          <Feld label="Höchstens Zubereitungszeit">
            <View style={s.row}>
              {ZEITEN.map((z) => (
                <Wahl
                  key={z.label}
                  label={z.label}
                  on={maxMinutes === z.value}
                  onPress={() => setMaxMinutes(z.value)}
                  wide
                />
              ))}
            </View>
          </Feld>

          <Pressable
            onPress={() => setVegetarisch((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: vegetarisch }}
            style={({ pressed }) => [s.schalterZeile, pressed && s.pressed]}
          >
            <View style={[s.kasten, vegetarisch && s.kastenOn]}>
              {vegetarisch ? <View style={s.haken} /> : null}
            </View>
            <Text style={s.schalterText}>Nur vegetarisch</Text>
          </Pressable>

          <Button
            label={loading ? 'Sucht bei Albert Heijn…' : 'Woche vorschlagen'}
            onPress={() => {
              setRejected([]);
              void suchen([]);
            }}
            disabled={loading}
          />
          <Text style={s.dauer}>
            Dauert etwa eine halbe Minute. Jedes Rezept wird einzeln geholt, damit
            Albert Heijn die Anfragen nicht abweist.
          </Text>
        </View>

        {loading ? (
          <View style={s.laden}>
            <ActivityIndicator />
            <Text style={s.ladenText}>Rezepte prüfen und Preise holen…</Text>
          </View>
        ) : null}

        {error ? <Notice tone="warn">{error}</Notice> : null}

        {/* ── Das Ergebnis ─────────────────────────────────────────── */}
        {result && !loading ? (
          picks.length === 0 ? (
            <Notice tone="warn">
              Dafür habe ich nichts gefunden.
              {budget !== undefined
                ? ' Versuch ein höheres Budget oder weniger Filter.'
                : ' Versuch andere Begriffe.'}
            </Notice>
          ) : (
            <View style={s.ergebnis}>
              {result.relaxed ? (
                <Notice tone="warn">
                  {beschreibeLockerung(result.relaxed, budget, maxMinutes)}
                </Notice>
              ) : null}

              <View style={s.bilanz}>
                <Kennzahl
                  wert={result.totalPrice !== undefined ? euro(result.totalPrice) : '—'}
                  label={`Einkauf für ${result.mealsCovered} Mahlzeiten`}
                />
                <Kennzahl
                  wert={
                    result.totalPrice !== undefined && result.mealsCovered > 0
                      ? euro(result.totalPrice / result.mealsCovered)
                      : '—'
                  }
                  label="je Mahlzeit"
                />
                <Kennzahl
                  wert={
                    result.totalUtilization !== undefined
                      ? `${Math.round(result.totalUtilization * 100)} %`
                      : '—'
                  }
                  label="wird verkocht"
                />
              </View>

              <Text style={s.kochHinweis}>
                Du kochst {picks.length}× und isst {result.mealsCovered}×.
              </Text>

              {picks.map((p, i) => (
                <View key={p.hit.id} style={s.pick}>
                  <View style={s.pickDay}>
                    <Text style={s.pickDayText}>{spanne(i)}</Text>
                  </View>

                  <RecipeThumb
                    title={p.recipe.title}
                    imageUrl={p.recipe.imageUrl ?? p.hit.imageUrl}
                    size={52}
                    radius={10}
                  />

                  <View style={s.pickBody}>
                    <Text style={s.pickTitle}>{p.recipe.title}</Text>
                    <Text style={s.pickMeta}>
                      {p.mealsCovered} Mahlzeiten
                      {p.pricePerServing !== undefined ? ` · ${euro(p.pricePerServing)} je Mahlzeit` : ''}
                      {p.kcalPerServing ? ` · ${p.kcalPerServing} kcal` : ''}
                      {p.totalMinutes ? ` · ${p.totalMinutes} Min` : ''}
                    </Text>
                    {p.reasons.length > 0 ? (
                      <View style={s.reasons}>
                        {p.reasons.slice(0, 3).map((r) => (
                          <View key={r} style={s.reason}>
                            <Text style={s.reasonText}>{r}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <Pressable
                    onPress={() => ablehnen(p)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.recipe.title} ersetzen`}
                    style={s.rejectHit}
                  >
                    <Text style={s.reject}>ersetzen</Text>
                  </Pressable>
                </View>
              ))}

              {result.filtered.length > 0 ? (
                <Text style={s.aussortiert}>
                  Aussortiert: {result.filtered.slice(0, 4).map((f) => `${f.title} (${f.reason})`).join(', ')}
                  {result.filtered.length > 4 ? ` und ${result.filtered.length - 4} weitere` : ''}
                </Text>
              ) : null}

              <View style={s.apply}>
                <Button
                  label={`Diese ${picks.length} ${picks.length === 1 ? 'Gericht' : 'Gerichte'} übernehmen`}
                  onPress={uebernehmen}
                />
                <Text style={s.applyHint}>
                  Jedes Rezept steht einmal im Plan, am Kochtag — sonst würde die
                  Einkaufsliste es mehrfach kaufen.
                </Text>
              </View>
            </View>
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/* ── Bausteine ─────────────────────────────────────────────────────── */

/**
 * Sagt im Klartext, welche Grenze nachgeben musste.
 *
 * Wichtig genug für eigene Sätze statt eines allgemeinen Hinweises: Ein
 * Vorschlag, der stillschweigend über der eingestellten Grenze liegt, ist
 * schlimmer als einer, der sie überschreitet und es dazusagt.
 */
function beschreibeLockerung(
  relaxed: { minutes?: number; budget?: number },
  budget: number | undefined,
  maxMinutes: number | undefined,
): string {
  const teile: string[] = [];

  if (maxMinutes !== undefined && relaxed.minutes !== maxMinutes) {
    teile.push(
      relaxed.minutes === undefined
        ? 'die Zeitgrenze aufgehoben'
        : `die Zeit auf ${relaxed.minutes} Min gelockert`,
    );
  }
  if (budget !== undefined && relaxed.budget !== budget) {
    teile.push(
      relaxed.budget === undefined
        ? 'das Budget aufgehoben'
        : `das Budget auf ${relaxed.budget.toFixed(2).replace('.', ',')} € gelockert`,
    );
  }

  if (teile.length === 0) return 'Die Grenzen mussten gelockert werden.';
  const liste = teile.length === 1 ? teile[0] : `${teile[0]} und ${teile[1]}`;
  return `Mit deinen Vorgaben kam zu wenig zusammen — ich habe ${liste}. Stell strenger ein und such neu, wenn dir das nicht passt.`;
}

function Feld({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.feld}>
      <Text style={s.feldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={s.feldHint}>{hint}</Text> : null}
    </View>
  );
}

function Wahl({
  label,
  on,
  onPress,
  wide,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [s.wahl, wide && s.wahlWide, on && s.wahlOn, pressed && s.pressed]}
    >
      <Text style={[s.wahlText, on && s.wahlTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Kennzahl({ wert, label }: { wert: string; label: string }) {
  return (
    <View style={s.kennzahl}>
      <Text style={s.kennzahlWert}>{wert}</Text>
      <Text style={s.kennzahlLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
  },

  feld: { gap: spacing.sm },
  feldLabel: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: colors.text },
  feldHint: { fontSize: 11, color: colors.textFaint, lineHeight: 16 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12.5, color: colors.textMuted, fontWeight: '600' },
  chipTextOn: { color: colors.onDark },

  input: {
    minHeight: 44,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.text,
  },

  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  wahl: {
    minWidth: 44,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  wahlWide: { minWidth: 68 },
  wahlOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  wahlText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: colors.textMuted },
  wahlTextOn: { color: colors.onDark },

  schalterZeile: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  kasten: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kastenOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  haken: { width: 8, height: 8, borderRadius: 2, backgroundColor: colors.onDark },
  schalterText: { fontSize: 14, color: colors.text },

  dauer: { fontSize: 11, color: colors.textFaint, textAlign: 'center', lineHeight: 16 },

  laden: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  ladenText: { fontSize: 12, color: colors.textMuted },

  ergebnis: { gap: spacing.sm },
  bilanz: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  kennzahl: { flex: 1, alignItems: 'center', gap: 2 },
  kennzahlWert: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryDeep,
  },
  kennzahlLabel: { fontSize: 10.5, color: colors.textMuted, textAlign: 'center' },
  kochHinweis: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    paddingBottom: spacing.xs,
  },

  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pickDay: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickDayText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDeep,
  },
  pickBody: { flex: 1, gap: 3 },
  pickTitle: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700', color: colors.text },
  pickMeta: { fontSize: 11, color: colors.textMuted },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  reason: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
  },
  reasonText: { fontSize: 10.5, color: colors.textMuted },
  rejectHit: { minHeight: 44, minWidth: 52, justifyContent: 'center', alignItems: 'flex-end' },
  reject: { fontSize: 11.5, color: colors.textMuted, textDecorationLine: 'underline' },

  aussortiert: {
    fontSize: 10.5,
    color: colors.textFaint,
    lineHeight: 15,
    paddingHorizontal: spacing.xs,
  },

  apply: { gap: spacing.sm, marginTop: spacing.sm },
  applyHint: { fontSize: 11, color: colors.textFaint, textAlign: 'center', lineHeight: 16 },

  pressed: { opacity: 0.7 },
});
