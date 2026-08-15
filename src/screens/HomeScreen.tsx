/**
 * Startbildschirm.
 *
 * Zwei Wege, mehr braucht es nicht: die Woche planen oder Rezepte pflegen.
 *
 * Der Bildschirm ist bewusst der Ort, an dem die Gestaltung am meisten
 * Raum bekommt — hier landet man jedes Mal, hier entscheidet sich, ob die
 * App sich nach etwas anfühlt oder nach einem Formular. Die beiden Kacheln
 * tragen deshalb kräftige Farbe: Tümpelgrün für die Woche, Sonnenblumengelb
 * für die Rezepte.
 *
 * Die Blüte oben ist kein Schmuck: Sieben Blätter, eines je Wochentag, so
 * viele gelb wie du belegt hast. Man sieht den Planungsstand, bevor man
 * eine Zahl gelesen hat.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Recipe } from '../domain/types';
import { plannedDayCount, totalMeals, WEEKDAYS, type WeekPlan } from '../domain/weekPlan';
import { Kees, type Mood } from '../ui/Kees';
import { Sunflower } from '../ui/Sunflower';
import { Screen } from '../ui/components';
import { colors, fonts, radius, recipeIcon, spacing } from '../ui/theme';

interface Props {
  plan: WeekPlan;
  recipes: Recipe[];
  onOpenWeek: () => void;
  onOpenRecipes: () => void;
  onOpenPantry: () => void;
  pantryCount: number;
  servingsPerMeal: number;
  onChangeServings: (n: number) => void;
}

/** Tageszeit-Gruß. Kleine Geste, kostet nichts, macht die App weniger anonym. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Noch wach?';
  if (hour < 11) return 'Guten Morgen';
  if (hour < 14) return 'Mahlzeit';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

/** Was Kees zum Planungsstand sagt — abhängig davon, wie voll die Woche ist. */
function statusLine(days: number, recipeCount: number): { text: string; mood: Mood } {
  if (recipeCount === 0) {
    return { text: 'Noch keine Rezepte. Fang mit einem an — der Rest kommt von allein.', mood: 'content' };
  }
  if (days === 0) {
    return { text: 'Die Woche ist noch leer. Leg ein Gericht auf einen Tag.', mood: 'meh' };
  }
  if (days >= 6) {
    return { text: `Kwak! ${days} Tage geplant — so geht keine Packung verloren.`, mood: 'happy' };
  }
  if (days >= 3) {
    return { text: `${days} Tage stehen. Noch ${7 - days} frei.`, mood: 'content' };
  }
  return { text: `Erst ${days} ${days === 1 ? 'Tag' : 'Tage'} geplant. Mehr Tage, weniger Reste.`, mood: 'content' };
}

export function HomeScreen({
  plan,
  recipes,
  onOpenWeek,
  onOpenRecipes,
  onOpenPantry,
  pantryCount,
  servingsPerMeal,
  onChangeServings,
}: Props) {
  const days = plannedDayCount(plan);
  const meals = totalMeals(plan);
  const status = statusLine(days, recipes.length);

  // Die nächsten belegten Tage als Vorschau — zeigt sofort, was ansteht.
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const upcoming = WEEKDAYS.flatMap((d) => plan.days[d])
    .map((id) => byId.get(id))
    .filter((r): r is Recipe => Boolean(r))
    .slice(0, 5);

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.body}>
        {/* ── Kopf ── */}
        <View style={s.hero}>
          <View style={s.heroText}>
            <Text style={s.greeting}>{greeting()}</Text>
            <Text style={s.brand}>Grocify</Text>
          </View>
          <Sunflower
            value={days / 7}
            petalCount={7}
            size={104}
            label={`${days}/7`}
          />
        </View>

        {/* ── Kees sagt etwas zur Lage ── */}
        <View style={s.kees}>
          <Kees size={62} mood={status.mood} />
          <Text style={s.keesText}>{status.text}</Text>
        </View>

        {/* ── Die zwei Wege ── */}
        <Pressable
          onPress={onOpenWeek}
          style={({ pressed }) => [s.tile, s.tileWeek, pressed && s.pressed]}
        >
          <View style={s.tileTop}>
            <Text style={s.tileIcon}>🪷</Text>
            <View style={s.tileBadge}>
              <Text style={s.tileBadgeText}>{days}/7</Text>
            </View>
          </View>
          <Text style={s.tileTitle}>Wochenplan</Text>
          <Text style={s.tileSubWeek}>
            {meals === 0
              ? 'Gerichte auf Tage legen'
              : `${meals} ${meals === 1 ? 'Gericht' : 'Gerichte'} an ${days} ${days === 1 ? 'Tag' : 'Tagen'}`}
          </Text>

          {upcoming.length > 0 ? (
            <View style={s.preview}>
              {upcoming.map((r, i) => (
                <Text key={`${r.id}-${i}`} style={s.previewIcon}>
                  {recipeIcon(r.title)}
                </Text>
              ))}
            </View>
          ) : null}
        </Pressable>

        <Pressable
          onPress={onOpenRecipes}
          style={({ pressed }) => [s.tile, s.tileRecipes, pressed && s.pressed]}
        >
          <View style={s.tileTop}>
            <Text style={s.tileIcon}>📖</Text>
            <View style={[s.tileBadge, s.tileBadgeDark]}>
              <Text style={[s.tileBadgeText, s.tileBadgeTextDark]}>{recipes.length}</Text>
            </View>
          </View>
          <Text style={[s.tileTitle, s.tileTitleDark]}>Rezepte</Text>
          <Text style={s.tileSubRecipes}>
            {recipes.length === 0
              ? 'Erstes Rezept anlegen'
              : `${recipes.length} gespeichert · anlegen und ändern`}
          </Text>
        </Pressable>

        {/* Dritter Weg, bewusst schmaler als die beiden großen: Der Vorrat
            ist Zuarbeit, kein Ziel. Man geht hier hin, um den Einkauf
            besser zu machen — nicht, um Vorräte zu verwalten. */}
        <Pressable
          onPress={onOpenPantry}
          style={({ pressed }) => [s.pantryTile, pressed && s.pressed]}
        >
          <Text style={s.pantryIcon}>🥫</Text>
          <View style={s.pantryBody}>
            <Text style={s.pantryTitle}>Vorrat</Text>
            <Text style={s.pantrySub}>
              {pantryCount === 0
                ? 'Was hast du schon zu Hause? Wird vom Einkauf abgezogen.'
                : `${pantryCount} ${pantryCount === 1 ? 'Eintrag' : 'Einträge'} · wird vom Einkauf abgezogen`}
            </Text>
          </View>
          <Text style={s.pantryChevron}>›</Text>
        </Pressable>

        {/* Portionen: die einzige Einstellung, die die App nicht selbst
            treffen kann. Sie steht hier statt auf einer Einstellungsseite,
            weil sie jede Zahl in dieser App beeinflusst — Mengen, Preise,
            Nährwerte. Eine Einstellung, die man suchen muss, findet man nie. */}
        <View style={s.servings}>
          <View style={s.servingsHead}>
            <Text style={s.servingsTitle}>Du kochst für</Text>
            <Text style={s.servingsHint}>
              Rezepte werden darauf umgerechnet — das Original bleibt erhalten.
            </Text>
          </View>
          <View style={s.servingsPicker}>
            {[1, 2, 3, 4].map((n) => {
              const aktiv = servingsPerMeal === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => onChangeServings(n)}
                  style={({ pressed }) => [
                    s.servingsBtn,
                    aktiv && s.servingsBtnOn,
                    pressed && s.pressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: aktiv }}
                  accessibilityLabel={`${n} ${n === 1 ? 'Portion' : 'Portionen'}`}
                >
                  <Text style={[s.servingsBtnText, aktiv && s.servingsBtnTextOn]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {servingsPerMeal === 1 ? (
          <Text style={s.servingsNote}>
            ⚠️ Packungen lassen sich nicht vierteln. Gemessen an einer echten
            Woche: bei 1 Portion werden nur 40 % des Eingekauften verkocht, bei
            2 Portionen schon 63 % — für 70 Cent mehr im Einkauf. Wer zweimal
            kocht und zweimal isst, zahlt je Portion die Hälfte.
          </Text>
        ) : null}

        <Text style={s.foot}>
          Preise und Sortiment kommen live von Albert Heijn. Deine Rezepte liegen
          lokal in deiner eigenen Datenbank.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },

  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1 },
  greeting: { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
  brand: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.primaryDeep,
    letterSpacing: -1.2,
    marginTop: -2,
  },

  kees: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  keesText: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600', lineHeight: 20 },

  tile: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.xs,
    minHeight: 150,
    justifyContent: 'center',
  },
  // Zwei kräftige Flächen statt zweier weißer Karten: Der Startbildschirm
  // ist der Ort, an dem die Palette zeigen darf, was sie kann.
  tileWeek: { backgroundColor: colors.primaryDeep },
  tileRecipes: { backgroundColor: colors.sun },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },

  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileIcon: { fontSize: 34 },
  tileBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  tileBadgeDark: { backgroundColor: 'rgba(21,48,29,0.16)' },
  tileBadgeText: { color: colors.onDark, fontWeight: '800', fontSize: 14 },
  tileBadgeTextDark: { color: colors.text },

  tileTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: colors.onDark,
    letterSpacing: -0.6,
    marginTop: spacing.sm,
  },
  tileTitleDark: { color: '#3a2a00' },
  tileSubWeek: { fontSize: 14, color: 'rgba(244,251,239,0.78)' },
  tileSubRecipes: { fontSize: 14, color: 'rgba(58,42,0,0.72)' },

  preview: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  previewIcon: { fontSize: 22 },

  servings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  servingsHead: { flex: 1 },
  servingsTitle: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.text },
  servingsHint: { fontSize: 11, color: colors.textFaint, marginTop: 2, lineHeight: 16 },
  servingsPicker: { flexDirection: 'row', gap: spacing.xs },
  servingsBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingsBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  servingsBtnText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textMuted,
  },
  servingsBtnTextOn: { color: colors.onDark },
  servingsNote: {
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 16,
    paddingHorizontal: spacing.xs,
    marginTop: -spacing.sm,
  },

  pantryTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pantryIcon: { fontSize: 30 },
  pantryBody: { flex: 1 },
  pantryTitle: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '700', color: colors.text },
  pantrySub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  pantryChevron: { fontSize: 22, color: colors.textFaint },
  foot: {
    fontSize: 12,
    color: colors.textFaint,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
