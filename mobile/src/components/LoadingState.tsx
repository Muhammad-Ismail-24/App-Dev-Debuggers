import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radii, spacing } from '../theme';
import { AppText } from './AppText';

interface SkeletonBlockProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
}

// MOTION_SPEC N8: a soft highlight sweeps left → right every 1.2s. Static under Reduce Motion.
export function SkeletonBlock({ width = '100%', height, radius = radii.chip }: SkeletonBlockProps) {
  const reduceMotion = useReducedMotion();
  const [blockWidth, setBlockWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || blockWidth === 0) return;
    progress.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1);
  }, [reduceMotion, blockWidth, progress]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -blockWidth + progress.value * blockWidth * 2 }],
  }));

  return (
    <View
      onLayout={(e) => setBlockWidth(e.nativeEvent.layout.width)}
      style={[styles.block, { width, height, borderRadius: radius }]}
    >
      {!reduceMotion && blockWidth > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.06)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

// Placeholder shaped like the reference match card (status row, two team rows, meta row).
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <SkeletonBlock width="40%" height={12} />
        <SkeletonBlock width="18%" height={12} />
      </View>
      <View style={styles.team}>
        <SkeletonBlock width={22} height={22} radius={11} />
        <SkeletonBlock width="35%" height={14} />
      </View>
      <View style={styles.team}>
        <SkeletonBlock width={22} height={22} radius={11} />
        <SkeletonBlock width="30%" height={14} />
      </View>
    </View>
  );
}

interface LoadingStateProps {
  // What is loading, in plain language — announced to VoiceOver.
  label: string;
  variant?: 'cards' | 'spinner';
  count?: number;
}

export function LoadingState({ label, variant = 'cards', count = 3 }: LoadingStateProps) {
  return (
    <View
      testID="loading-state"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={variant === 'spinner' ? styles.spinnerWrap : styles.cards}
    >
      {variant === 'spinner' ? (
        <>
          <ActivityIndicator color={colors.textSecondary} />
          <AppText variant="callout" tone="secondary" align="center">
            {label}
          </AppText>
        </>
      ) : (
        Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.bgRaised, overflow: 'hidden' },
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.strokeHairline,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  team: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cards: { gap: spacing.railGap },
  spinnerWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
});
