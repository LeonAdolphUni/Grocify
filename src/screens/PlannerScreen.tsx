/**
 * Der Wochenplaner — als Gespräch.
 *
 * Er fragt, worauf du Lust hast, sucht bei **Albert Heijn** danach und
 * schlägt eine Woche vor. Nicht im eigenen Rezeptbuch: Das wäre ein Kreis —
 * man kann nur planen, was man schon hat, und wer acht Rezepte besitzt,
 * bekommt achtmal dieselbe Woche.
 *
 * **Warum ein Dialog und keine Maske.** Ein Formular mit acht Feldern würde
 * dieselbe Information abfragen und sich anfühlen wie ein Antrag. Ein
 * Gespräch fragt eins nach dem anderen, zeigt zwischendurch, was es
 * verstanden hat, und lässt sich korrigieren — „das lieber nicht" holt
 * Ersatz, statt von vorn zu beginnen.
 *
 * **Gesund und günstig sind die Auswahlregel, nicht Beiwerk.** Gesund kommt
 * aus AHs eigenen Nährwertangaben je Portion — keine Schätzung. Günstig
 * ergibt sich aus wenigen Zutaten und Überschneidung: Wer siebenmal dieselbe
 * Packung anbricht, zahlt sie einmal.
 *
 * Jeder Vorschlag trägt seine Begründung. Eine Liste ohne Begründung müsste
 * man glauben; diese kann man prüfen.
 */

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError, api, type AdvisorPick } from '../api/client';
import { translateSearchQuery, type SearchLanguage } from '../domain/searchLanguage';
import { WEEKDAYS, WEEKDAY_SHORT, emptyWeek, type WeekPlan } from '../domain/weekPlan';
import { parseWishes } from '../domain/weekPlanner';
import { Kees } from '../ui/Kees';
import { Monogram } from '../ui/Monogram';
import { Button, Header, Notice, Screen } from '../ui/components';
import { colors, fonts, radius, spacing } from '../ui/theme';

interface Props {
  language: SearchLanguage;
  pantryCount: number;
  onApply: (plan: WeekPlan, picks: AdvisorPick[]) => void;
  onBack: () => void;
}

/** Ein Beitrag im Gespräch. */
interface Turn {
  from: 'kees' | 'du';
  text: string;
}

const ANREGUNGEN = ['Pasta', 'was mit Hähnchen', 'vegetarisch', 'Suppe', 'schnell', 'egal'];

/** Erkennt „ist mir egal" in seinen üblichen Formen. */
const EGAL = /^(egal|weiß nicht|weiss nicht|überrasch mich|ueberrasch mich|irgendwas)$/i;

export function PlannerScreen({ language, pantryCount, onApply, onBack }: Props) {
  const [turns, setTurns] = useState<Turn[]>([
    {
      from: 'kees',
      text:
        'Worauf hast du diese Woche Lust? Sag ruhig mehrere Sachen — „Pasta, was mit Hähnchen, was Schnelles". Wenn dir nichts einfällt, schreib „egal", dann such ich was Gesundes aus.',
    },
  ]);
  const [input, setInput] = useState('');
  const [days, setDays] = useState(5);
  const [picks, setPicks] = useState<AdvisorPick[] | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  const frage = useCallback(
    async (text: string, ablehnungen: string[], letzteWuensche?: string[]) => {
      const roh = text.trim();

      // Bei einer Ablehnung wird ohne neue Eingabe erneut gefragt — dann
      // gelten die Wünsche von vorhin weiter.
      const nl =
        letzteWuensche ??
        (EGAL.test(roh) ? [] : parseWishes(roh).map((w) => translateSearchQuery(w, language)));

      setLoading(true);
      setError(null);
      setTurns((t) => [
        ...t,
        ...(roh ? ([{ from: 'du', text: roh }] as Turn[]) : []),
        {
          from: 'kees',
          text:
            nl.length > 0
              ? `Alles klar — ich suche bei Albert Heijn nach ${nl.join(', ')}. Das dauert einen Moment, ich hole jedes Rezept einzeln.`
              : 'Gut, dann such ich was Gesundes und Einfaches aus. Moment.',
        },
      ]);

      try {
        const result = await api.adviseWeek(nl, days, ablehnungen);
        setPicks(result.picks);

        const gesund = result.picks.filter((p) => p.reasons.includes('ausgewogen')).length;
        setTurns((t) => [
          ...t,
          {
            from: 'kees',
            text:
              result.picks.length === 0
                ? 'Da habe ich nichts gefunden. Versuch einen anderen Begriff — oder „egal", dann such ich selbst aus.'
                : `${result.picks.length} ${result.picks.length === 1 ? 'Gericht' : 'Gerichte'} aus ${result.fetched} geprüften Rezepten.` +
                  (gesund > 0 ? ` ${gesund} davon ausgewogen.` : '') +
                  (result.unmatched.length > 0
                    ? ` Für „${result.unmatched.join(', ')}" gab es nichts.`
                    : ''),
          },
        ]);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : (err as Error).message);
      } finally {
        setLoading(false);
        setInput('');
        setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
      }
    },
    [days, language],
  );

  /** Merkt sich die zuletzt gesuchten Begriffe für Ablehnungen. */
  const letzte = useRef<string[]>([]);

  const senden = useCallback(() => {
    const roh = input.trim();
    if (!roh) return;
    letzte.current = EGAL.test(roh)
      ? []
      : parseWishes(roh).map((w) => translateSearchQuery(w, language));
    void frage(roh, rejected);
  }, [input, language, rejected, frage]);

  const ablehnen = useCallback(
    (pick: AdvisorPick) => {
      const naechste = [...rejected, pick.hit.id];
      setRejected(naechste);
      setTurns((t) => [...t, { from: 'du', text: `„${pick.recipe.title}" lieber nicht` }]);
      void frage('', naechste, letzte.current);
    },
    [rejected, frage],
  );

  const uebernehmen = useCallback(() => {
    if (!picks || picks.length === 0) return;
    const plan = emptyWeek('week-1');
    picks.forEach((p, i) => plan.days[WEEKDAYS[i % WEEKDAYS.length]].push(p.recipe.id));
    onApply(plan, picks);
  }, [picks, onApply]);

  return (
    <Screen>
      <Header
        tone="pond"
        title="Woche planen"
        subtitle={`Rezepte von Albert Heijn${pantryCount > 0 ? ` · ${pantryCount} im Vorrat` : ''}`}
        onBack={onBack}
      />

      <ScrollView ref={scroller} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {turns.map((t, i) => (
          <View key={i} style={[s.turn, t.from === 'du' && s.turnMine]}>
            {t.from === 'kees' ? <Kees size={36} mood="content" /> : null}
            <View style={[s.bubble, t.from === 'du' && s.bubbleMine]}>
              <Text style={[s.bubbleText, t.from === 'du' && s.bubbleTextMine]}>{t.text}</Text>
            </View>
          </View>
        ))}

        {loading ? (
          <View style={s.turn}>
            <Kees size={36} mood="content" />
            <View style={s.bubble}>
              <ActivityIndicator size="small" />
            </View>
          </View>
        ) : null}

        {error ? <Notice tone="warn">{error}</Notice> : null}

        {picks && picks.length > 0 && !loading ? (
          <View style={s.picks}>
            {picks.map((p, i) => (
              <View key={p.hit.id} style={s.pick}>
                <View style={s.pickDay}>
                  <Text style={s.pickDayText}>{WEEKDAY_SHORT[WEEKDAYS[i % WEEKDAYS.length]]}</Text>
                </View>
                <Monogram title={p.recipe.title} size={38} />

                <View style={s.pickBody}>
                  <Text style={s.pickTitle}>{p.recipe.title}</Text>
                  <Text style={s.pickMeta}>
                    {p.kcalPerServing ? `${p.kcalPerServing} kcal` : 'Nährwerte unbekannt'}
                    {p.proteinPerServing ? ` · ${p.proteinPerServing} g Eiweiß` : ''}
                    {` · ${p.ingredientCount} Zutaten`}
                  </Text>
                  {p.reasons.length > 0 ? (
                    <View style={s.reasons}>
                      {p.reasons.map((r) => (
                        <View key={r} style={s.reason}>
                          <Text style={s.reasonText}>{r}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>

                <Pressable onPress={() => ablehnen(p)} hitSlop={8} style={s.rejectHit}>
                  <Text style={s.reject}>nein</Text>
                </Pressable>
              </View>
            ))}

            <View style={s.apply}>
              <Button label={`Diese ${picks.length} Gerichte übernehmen`} onPress={uebernehmen} />
              <Text style={s.applyHint}>
                Die Rezepte landen in deinem Buch und auf den Wochentagen. Der Preis
                steht danach in der Einkaufsliste.
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={s.composer}>
        <View style={s.chips}>
          {ANREGUNGEN.map((a) => (
            <Pressable
              key={a}
              onPress={() => setInput((v) => (v.trim() ? `${v.trim()}, ${a}` : a))}
              style={({ pressed }) => [s.chip, pressed && s.pressed]}
            >
              <Text style={s.chipText}>{a}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.daysRow}>
          <Text style={s.daysLabel}>Tage</Text>
          {[3, 4, 5, 6, 7].map((n) => (
            <Pressable
              key={n}
              onPress={() => setDays(n)}
              style={({ pressed }) => [s.dayBtn, days === n && s.dayBtnOn, pressed && s.pressed]}
            >
              <Text style={[s.dayBtnText, days === n && s.dayBtnTextOn]}>{n}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={senden}
            placeholder="Worauf hast du Lust?"
            returnKeyType="send"
            editable={!loading}
          />
          <Pressable
            onPress={senden}
            disabled={loading}
            style={({ pressed }) => [s.send, (pressed || loading) && s.pressed]}
          >
            <Text style={s.sendText}>{loading ? '…' : 'Fragen'}</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },

  turn: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  turnMine: { justifyContent: 'flex-end' },
  bubble: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  bubbleMine: {
    flex: 0,
    maxWidth: '80%',
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleTextMine: { color: colors.onDark },

  picks: { gap: spacing.sm, marginTop: spacing.sm },
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
  rejectHit: { minHeight: 44, minWidth: 40, justifyContent: 'center', alignItems: 'flex-end' },
  reject: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },

  apply: { gap: spacing.sm, marginTop: spacing.md },
  applyHint: { fontSize: 11, color: colors.textFaint, textAlign: 'center', lineHeight: 16 },

  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceWarm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.successBg,
  },
  chipText: { fontSize: 12, color: colors.primaryDeep, fontWeight: '600' },
  pressed: { opacity: 0.7 },

  daysRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  daysLabel: { fontSize: 12, color: colors.textMuted, marginRight: spacing.xs },
  dayBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayBtnText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  dayBtnTextOn: { color: colors.onDark },

  inputRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 46,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  send: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  sendText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.onDark },
});
