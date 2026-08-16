/**
 * Startbildschirm.
 *
 * Zwei Wege, mehr braucht es nicht: ein Gericht finden oder Rezepte pflegen.
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
import { BookIcon, CalendarIcon, ChevronIcon, JarIcon } from '../ui/icons';
import { Kees, type Mood } from '../ui/Kees';
import { Sunflower } from '../ui/Sunflower';
import { Screen } from '../ui/components';
import { Monogram } from '../ui/Monogram';
import { colors, fonts, radius, spacing } from '../ui/theme';

interface Props {
  plan: WeekPlan;
  recipes: Recipe[];
  onOpenWeek: () => void;
  onOpenRecipes: () => void;
  onOpenPantry: () => void;
  onOpenPlanner: () => void;
  pantryCount: number;
  pantryReviewDue: boolean;
  onPantryReviewed: () => void;
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
  onOpenPlanner,
  pantryCount,
  pantryReviewDue,
  onPantryReviewed,
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
            <Text style={s.tagline}>Gerichte finden, einkaufen, nichts wegwerfen</Text>
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

        {/* Wöchentliche Vorratserinnerung. Sie kommt am Montag, weil dann
            die Woche geplant wird — am Sonntagabend würde sie nur stören.
            Und sie lässt sich wegdrücken, ohne den Vorrat zu öffnen: Wer
            gerade nachgesehen hat, soll nicht dorthin gezwungen werden. */}
        {pantryReviewDue ? (
          <View style={s.reminder}>
            <View style={s.reminderBody}>
              <Text style={s.reminderTitle}>Neue Woche — stimmt dein Vorrat noch?</Text>
              <Text style={s.reminderText}>
                {pantryCount === 0
                  ? 'Noch nichts eingetragen. Was zu Hause steht, wird vom Einkauf abgezogen.'
                  : `${pantryCount} ${pantryCount === 1 ? 'Eintrag' : 'Einträge'} — was ist aufgebraucht, was ist dazugekommen?`}
              </Text>
            </View>
            <View style={s.reminderActions}>
              <Pressable
                onPress={onOpenPantry}
                style={({ pressed }) => [s.reminderBtn, pressed && s.pressed]}
              >
                <Text style={s.reminderBtnText}>Durchsehen</Text>
              </Pressable>
              <Pressable onPress={onPantryReviewed} hitSlop={8} style={s.reminderDismiss}>
                <Text style={s.reminderDismissText}>Passt schon</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Der Finder sitzt vor den beiden Wegen: Wer nicht weiß, was er
            kochen will, soll nicht erst durch den leeren Wochenplan. */}
        <Pressable
          onPress={onOpenPlanner}
          style={({ pressed }) => [s.plannerTile, pressed && s.pressed]}
        >
          <View style={s.plannerBody}>
            <Text style={s.plannerTitle}>Gericht finden</Text>
            <Text style={s.plannerSub}>
              Schnell oder in Ruhe, günstig und gesund — oder etwas, das deinen
              Vorrat aufbraucht
            </Text>
          </View>
          <ChevronIcon size={18} color={colors.onDark} />
        </Pressable>

        {/* ── Die zwei Wege ── */}
        <Pressable
          onPress={onOpenWeek}
          style={({ pressed }) => [s.tile, s.tileWeek, pressed && s.pressed]}
        >
          <View style={s.tileTop}>
            <CalendarIcon size={30} color={colors.onDark} />
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
                <Monogram key={`${r.id}-${i}`} title={r.title} size={26} />
              ))}
            </View>
          ) : null}
        </Pressable>

        <Pressable
          onPress={onOpenRecipes}
          style={({ pressed }) => [s.tile, s.tileRecipes, pressed && s.pressed]}
        >
          <View style={s.tileTop}>
            <BookIcon size={30} color="#3a2a00" />
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
          <JarIcon size={26} color={colors.seed} />
          <View style={s.pantryBody}>
            <Text style={s.pantryTitle}>Vorrat</Text>
            <Text style={s.pantrySub}>
              {pantryCount === 0
                ? 'Was hast du schon zu Hause? Wird vom Einkauf abgezogen.'
                : `${pantryCount} ${pantryCount === 1 ? 'Eintrag' : 'Einträge'} · wird vom Einkauf abgezogen`}
            </Text>
          </View>
          <ChevronIcon size={18} color={colors.textFaint} />
        </Pressable>

        <Text style={s.foot}>
          Preise und Sortiment live von Albert Heijn · Deine Daten liegen lokal
          in einer eigenen Datenbank, ohne Konto und ohne Cloud
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
    fontFamily: fonts.heading,
    fontSize: 36,
    fontWeight: '800',
    color: colors.primaryDeep,
    letterSpacing: -1,
    marginTop: -2,
  },
  tagline: { fontSize: 12.5, color: colors.textMuted, marginTop: 3, lineHeight: 17 },

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

  reminder: {
    backgroundColor: colors.sunSoft,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.sun,
    padding: spacing.lg,
    gap: spacing.md,
  },
  reminderBody: { gap: 3 },
  reminderTitle: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: '#3a2a00' },
  reminderText: { fontSize: 12.5, color: colors.seed, lineHeight: 18 },
  reminderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reminderBtn: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  reminderBtnText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: colors.onDark },
  reminderDismiss: { minHeight: 40, justifyContent: 'center' },
  reminderDismissText: { fontSize: 12.5, color: colors.seed, textDecorationLine: 'underline' },

  plannerTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.frog,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  plannerBody: { flex: 1, gap: 2 },
  plannerTitle: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '700', color: colors.onDark },
  plannerSub: { fontSize: 12, color: 'rgba(244,251,239,0.85)', lineHeight: 17 },


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
