import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { colors, spacing, spring } from '../theme';
import { AppText } from './AppText';

export interface TabOption {
  id: string;
  label: string;
}

// Reference "Overview / Videos / Play-By-Play" tabs: grey labels, white active label, 2pt accent
// underline that slides + resizes between tabs (MOTION M6; tap-driven, spring.smooth — inferred).
export function UnderlineTabs({ tabs, activeId, onChange }: { tabs: TabOption[]; activeId: string; onChange: (id: string) => void }) {
  const reduceMotion = useReducedMotion();
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);

  const move = (id: string, l: { x: number; width: number }, animate: boolean) => {
    if (id !== activeId) return;
    if (animate && !reduceMotion) {
      x.value = withSpring(l.x, spring.smooth);
      w.value = withSpring(l.width, spring.smooth);
    } else {
      x.value = withTiming(l.x, { duration: reduceMotion ? 150 : 0 });
      w.value = withTiming(l.width, { duration: reduceMotion ? 150 : 0 });
    }
  };

  const indicator = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
        {tabs.map((t) => {
          const active = t.id === activeId;
          return (
            <Pressable
              key={t.id}
              testID={`tab-${t.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
              onLayout={(e) => {
                const l = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
                setLayouts((prev) => ({ ...prev, [t.id]: l }));
                move(t.id, l, false);
              }}
              onPress={() => {
                if (active) return;
                void Haptics.selectionAsync();
                const l = layouts[t.id];
                if (l) {
                  if (!reduceMotion) {
                    x.value = withSpring(l.x, spring.smooth);
                    w.value = withSpring(l.width, spring.smooth);
                  } else {
                    x.value = withTiming(l.x, { duration: 150 });
                    w.value = withTiming(l.width, { duration: 150 });
                  }
                }
                onChange(t.id);
              }}
              style={styles.tab}
            >
              <AppText variant="bodyStrong" tone={active ? 'primary' : 'secondary'} maxFontSizeMultiplier={1.2}>
                {t.label}
              </AppText>
            </Pressable>
          );
        })}
        <Animated.View pointerEvents="none" style={[styles.indicator, indicator]} />
      </ScrollView>
      <View style={styles.hairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -spacing.gutter },
  row: { paddingHorizontal: spacing.gutter, gap: spacing.xl },
  tab: { minHeight: spacing.minTouchTarget, justifyContent: 'center', paddingHorizontal: spacing.xs },
  indicator: { position: 'absolute', left: 0, bottom: 0, height: 2, borderRadius: 1, backgroundColor: colors.accentIndicator },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.strokeHairline },
});
