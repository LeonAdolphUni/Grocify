/**
 * Bewegung.
 *
 * Drei Regeln, an die ich mich hier halte:
 *
 * 1. **Kurz.** Alles unter 400 ms. Was länger dauert, wird beim zehnten Mal
 *    zur Wartezeit.
 * 2. **Einmalig.** Nichts wiederholt sich endlos im Hintergrund. Dauernde
 *    Bewegung zieht den Blick von dem ab, was man eigentlich liest.
 * 3. **Abschaltbar.** Wer im Betriebssystem weniger Bewegung eingestellt
 *    hat, bekommt keine — das ist eine Barrierefreiheits-Einstellung, keine
 *    Geschmacksfrage.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from './theme';

/** Hat der Nutzer im System weniger Bewegung eingestellt? */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  return reduced;
}

/**
 * Lässt ein Element hüpfen — für Kees, wenn etwas Gutes passiert.
 *
 * `trigger` ist ein Zähler: Jede Erhöhung löst einen Sprung aus. Das ist
 * verlässlicher als ein Boolean, weil zwei Sprünge hintereinander sonst
 * nicht auseinanderzuhalten wären.
 */
export function Hop({ trigger, children }: { trigger: number; children: React.ReactNode }) {
  const y = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const first = useRef(true);

  useEffect(() => {
    // Beim ersten Rendern nicht springen — sonst hüpft alles beim Öffnen.
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;

    Animated.sequence([
      Animated.timing(y, { toValue: -14, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 190, easing: Easing.bounce, useNativeDriver: true }),
    ]).start();
  }, [trigger, reduced, y]);

  return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

/**
 * Erledigte Zeile sinkt kurz ein, wie ein Stein im Teich.
 *
 * Bewusst nur ein Zusammendrücken und Ausblenden statt eines echten
 * Wegwischens: Die Zeile bleibt stehen, damit man sie wieder anhaken kann.
 */
export function SinkIn({ active, children }: { active: boolean; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      progress.setValue(active ? 1 : 0);
      return;
    }
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [active, reduced, progress]);

  return (
    <Animated.View
      style={{
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.97, 0.99] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

const SEED_COUNT = 14;

/**
 * Samenflug: Wenn alles abgehakt ist, pustet die Blüte ihre Kerne über den
 * Bildschirm. Einmal, kurz, dann ist wieder Ruhe.
 */
export function SeedBurst({ trigger }: { trigger: number }) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const seeds = useRef(
    Array.from({ length: SEED_COUNT }, () => new Animated.Value(0)),
  ).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced || trigger === 0) return;

    setVisible(true);
    Animated.stagger(
      26,
      seeds.map((v) => {
        v.setValue(0);
        return Animated.timing(v, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        });
      }),
    ).start(() => setVisible(false));
  }, [trigger, reduced, seeds]);

  if (!visible) return null;

  return (
    <View style={m.layer} pointerEvents="none">
      {seeds.map((v, i) => {
        // Die Kerne fächern gleichmäßig nach oben auf, mit leicht
        // unterschiedlicher Höhe — sonst sieht es nach Maschine aus.
        const angle = (i / SEED_COUNT) * Math.PI - Math.PI / 2;
        const distance = 130 + (i % 4) * 34;
        return (
          <Animated.View
            key={i}
            style={[
              m.seed,
              {
                opacity: v.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] }) },
                  { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] }) },
                  { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 220}deg`] }) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const m = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  seed: {
    position: 'absolute',
    width: 9,
    height: 13,
    borderRadius: 5,
    backgroundColor: colors.seed,
  },
});
