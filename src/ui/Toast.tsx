/**
 * Kurze Rückmeldung am unteren Rand, optional mit einer Aktion.
 *
 * Zwei Zwecke, ein Baustein:
 *
 *   „Gespeichert."                  — bestätigt, dass etwas passiert ist
 *   „Rezept gelöscht. Rückgängig"   — bietet den Rückweg an
 *
 * Warum kein Bestätigungsdialog vor dem Löschen? Weil man den wegklickt.
 * Ein Rückgängig-Streifen kostet keine Aufmerksamkeit, solange alles
 * gutgeht, und rettet den Fehlgriff, wenn nicht. Er verschwindet von selbst
 * — aber erst nach acht Sekunden, denn wer gerade erschrocken ist, braucht
 * einen Moment.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { useReducedMotion } from './motion';
import { colors, fonts, radius, spacing } from './theme';

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastMessage {
  text: string;
  action?: ToastAction;
  /** Tonfall: neutral bestätigend oder warnend. */
  tone?: 'info' | 'warn';
}

interface Props {
  message: ToastMessage | null;
  onDismiss: () => void;
}

/** Ohne Aktion reicht kurz; mit Aktion braucht man Zeit zum Reagieren. */
const DAUER_KURZ = 2600;
const DAUER_MIT_AKTION = 8000;

export function Toast({ message, onDismiss }: Props) {
  const reduced = useReducedMotion();
  const slide = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!message) return;
    setBusy(false);

    if (reduced) {
      slide.setValue(1);
    } else {
      Animated.spring(slide, {
        toValue: 1,
        useNativeDriver: true,
        friction: 9,
        tension: 90,
      }).start();
    }

    const timer = setTimeout(
      onDismiss,
      message.action ? DAUER_MIT_AKTION : DAUER_KURZ,
    );
    return () => {
      clearTimeout(timer);
      slide.setValue(0);
    };
  }, [message, onDismiss, reduced, slide]);

  if (!message) return null;

  const warn = message.tone === 'warn';

  return (
    <Animated.View
      style={[
        s.wrap,
        warn && s.wrapWarn,
        {
          transform: [
            { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) },
          ],
          opacity: slide,
        },
      ]}
      // Bildschirmleser sollen die Meldung vorlesen, ohne dass der Fokus springt.
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={s.text} numberOfLines={2}>
        {message.text}
      </Text>

      {message.action ? (
        <Pressable
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await message.action?.run();
            } finally {
              onDismiss();
            }
          }}
          hitSlop={10}
          style={({ pressed }) => [s.action, pressed && s.actionPressed]}
        >
          <Text style={s.actionText}>{busy ? '…' : message.action.label}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onDismiss} hitSlop={10} style={s.action}>
          <Text style={s.close}>✕</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    zIndex: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 560,
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  wrapWarn: { backgroundColor: colors.alarm },
  text: { flex: 1, color: colors.onDark, fontSize: 14, lineHeight: 19 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  actionPressed: { opacity: 0.6 },
  actionText: {
    fontFamily: fonts.heading,
    color: colors.sun,
    fontSize: 14,
    fontWeight: '700',
  },
  close: { color: colors.textFaint, fontSize: 16, fontWeight: '700' },
});
