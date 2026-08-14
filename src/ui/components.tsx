/**
 * Kleine, wiederverwendete Bausteine.
 * Hält die Screens frei von wiederholtem Style-Code.
 */

import type { ReactNode } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';

import { CONTENT_MAX_WIDTH, colors, radius, spacing } from './theme';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <View style={s.screen}>
      <View style={s.container}>{children}</View>
    </View>
  );
}

/**
 * Kopfbereich eines Bildschirms.
 *
 * `tone` bestimmt den Grund: „plain" für die alte helle Variante, „pond"
 * für ein tiefgrünes Band, „sun" für ein gelbes. Die farbigen Bänder geben
 * jedem Bildschirm sofort einen Charakter — und mit `extra` lässt sich
 * etwas hineinlegen, das auf dem Band liegen soll statt darunter.
 */
export function Header({
  title,
  subtitle,
  onBack,
  right,
  tone = 'plain',
  extra,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  tone?: 'plain' | 'pond' | 'sun';
  extra?: ReactNode;
}) {
  const banded = tone !== 'plain';
  const onSun = tone === 'sun';

  return (
    <View
      style={[
        s.header,
        tone === 'pond' && s.headerPond,
        tone === 'sun' && s.headerSun,
      ]}
    >
      {onBack ? (
        <Pressable onPress={onBack} style={s.back} hitSlop={10}>
          <Text style={[s.backText, banded && (onSun ? s.onSunSoft : s.onPondSoft)]}>
            ‹ Zurück
          </Text>
        </Pressable>
      ) : null}
      <View style={s.headerRow}>
        <View style={s.headerText}>
          <Text style={[s.title, banded && (onSun ? s.onSunTitle : s.onPondTitle)]}>{title}</Text>
          {subtitle ? (
            <Text style={[s.subtitle, banded && (onSun ? s.onSunSoft : s.onPondSoft)]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {extra}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        variant === 'secondary' && s.btnSecondary,
        variant === 'danger' && s.btnDanger,
        disabled && s.btnDisabled,
        pressed && !disabled && s.btnPressed,
      ]}
    >
      <Text
        style={[
          s.btnText,
          variant === 'secondary' && s.btnTextSecondary,
          variant === 'danger' && s.btnTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Notice({ tone, children }: { tone: 'info' | 'warn'; children: ReactNode }) {
  return (
    <View style={[s.notice, tone === 'warn' && s.noticeWarn]}>
      <Text style={[s.noticeText, tone === 'warn' && s.noticeTextWarn]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.select({
      ios: 56,
      android: (StatusBar.currentHeight ?? 0) + 12,
      default: 24,
    }),
  },
  container: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  // Farbige Kopfbänder ziehen sich über die volle Breite und geben jedem
  // Bildschirm sofort einen Charakter.
  headerPond: {
    backgroundColor: colors.primaryDeep,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    marginBottom: spacing.sm,
  },
  headerSun: {
    backgroundColor: colors.sun,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    marginBottom: spacing.sm,
  },
  onPondTitle: { color: colors.onDark },
  onPondSoft: { color: 'rgba(244,251,239,0.78)' },
  onSunTitle: { color: '#3a2a00' },
  onSunSoft: { color: 'rgba(58,42,0,0.72)' },
  back: { paddingVertical: spacing.xs, marginBottom: spacing.xs },
  backText: { color: colors.textMuted, fontSize: 15 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1 },
  title: { fontSize: 27, fontWeight: '700', color: colors.primary, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },

  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: colors.alarmBg },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.75 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnTextSecondary: { color: colors.text },
  btnTextDanger: { color: colors.alarm },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },

  notice: {
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  noticeWarn: { backgroundColor: colors.alarmBg },
  noticeText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  noticeTextWarn: { color: colors.alarm },
});
