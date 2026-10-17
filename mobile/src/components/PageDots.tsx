import { StyleSheet, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { colors, spacing } from '../theme';

function Dot({ index, scrollX, step }: { index: number; scrollX: SharedValue<number>; step: number }) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * step, index * step, (index + 1) * step];
    return {
      width: interpolate(scrollX.value, input, [6, 18, 6], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, input, [0.4, 1, 0.4], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

// Active-card indicator driven 1:1 by the carousel's scroll offset (UI thread).
export function PageDots({ count, scrollX, step }: { count: number; scrollX: SharedValue<number>; step: number }) {
  if (count < 2) return null;
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} index={i} scrollX={scrollX} step={step} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs + 2, height: 16 },
  dot: { height: 6, borderRadius: 3, backgroundColor: colors.textPrimary },
});
