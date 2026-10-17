import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useCart } from '../hooks/useCart';
import { colors, spacing, spring } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

// Bag icon with a live count. The count badge bumps whenever the count changes (cart feedback).
export function CartButton({ onPress }: { onPress: () => void }) {
  const { count } = useCart();
  const reduce = useReducedMotion();
  const bump = useSharedValue(1);
  useEffect(() => {
    if (count > 0 && !reduce) bump.value = withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, spring.bouncy));
  }, [count, reduce, bump]);
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  return (
    <PressableScale
      testID="cart-button"
      onPress={onPress}
      accessibilityLabel={count > 0 ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart, empty'}
      accessibilityHint="Opens your cart"
      hitSlop={6}
      style={styles.hit}
    >
      <View>
        <Icon name="bag" size={24} />
        {count > 0 ? (
          <Animated.View style={[styles.badge, badge]} pointerEvents="none">
            <AppText variant="caption" style={styles.badgeText} maxFontSizeMultiplier={1}>{count > 99 ? '99+' : count}</AppText>
          </Animated.View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hit: { width: spacing.minTouchTarget - 8, height: spacing.minTouchTarget - 8, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -6, right: -9, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.live, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, lineHeight: 14, fontWeight: '700' },
});
