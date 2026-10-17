import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, pressScale, radii, spacing, spring, timing } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconProps } from './Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface BaseButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconProps['name'];
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

function usePressAnimation(disabled: boolean) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const disabledProgress = useSharedValue(disabled ? 1 : 0);

  // MOTION_SPEC M3: enabled ↔ disabled crossfade.
  useEffect(() => {
    disabledProgress.value = withTiming(disabled ? 1 : 0, timing.base);
  }, [disabled, disabledProgress]);

  const handlers = {
    onPressIn: () => {
      pressed.value = withTiming(1, timing.fast);
    },
    onPressOut: () => {
      pressed.value = withSpring(0, spring.snappy);
    },
  };
  return { pressed, disabledProgress, reduceMotion, handlers };
}

// The one opaque element on screen — the reference's white "Continue" pill. Use for the
// single most important action (Buy, Pay, Sign in, Sync now).
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  accessibilityHint,
  testID,
  style,
}: BaseButtonProps) {
  const inactive = disabled || loading;
  const { pressed, disabledProgress, reduceMotion, handlers } = usePressAnimation(disabled);

  // MOTION_SPEC M2: scale 0.98 + background darkens while pressed.
  const animatedStyle = useAnimatedStyle(() => {
    const pressedBg = interpolateColor(pressed.value, [0, 1], [colors.ctaBg, colors.ctaBgPressed]);
    return {
      backgroundColor: interpolateColor(disabledProgress.value, [0, 1], [pressedBg, colors.ctaBgDisabled]),
      transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * (1 - pressScale.button) }],
    };
  });
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - disabledProgress.value * 0.4 }));

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={[styles.primary, animatedStyle, style]}
      {...handlers}
    >
      {loading ? (
        <ActivityIndicator color={colors.ctaFg} />
      ) : (
        <Animated.View style={[styles.content, contentStyle]}>
          {icon ? <Icon name={icon} size={18} color={colors.ctaFg} weight="semibold" /> : null}
          <AppText variant="bodyStrong" tone="onCta" style={styles.primaryLabel}>
            {label}
          </AppText>
        </Animated.View>
      )}
    </AnimatedPressable>
  );
}

// Frosted pill used over gradients/imagery ("Watch on TV", "Create an account").
export function GlassButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  accessibilityHint,
  testID,
  style,
}: BaseButtonProps) {
  const inactive = disabled || loading;
  const { pressed, disabledProgress, reduceMotion, handlers } = usePressAnimation(disabled);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: 1 - disabledProgress.value * 0.5,
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * (1 - pressScale.button) }],
  }));
  // MOTION_SPEC S9: glass overlay brightens 14% → 24% while pressed.
  const overlayStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pressed.value, [0, 1], [colors.glassFill, colors.glassFillPressed]),
  }));

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={[styles.glass, containerStyle, style]}
      {...handlers}
    >
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]} />
      {loading ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={18} weight="medium" /> : null}
          <AppText variant="bodyStrong">{label}</AppText>
        </View>
      )}
    </AnimatedPressable>
  );
}

// Plain text action ("Sign in", "Skip", "See all"). Still a 48pt hit target.
export function TextButton({
  label,
  onPress,
  disabled = false,
  tone = 'secondary',
  testID,
  style,
}: Pick<BaseButtonProps, 'label' | 'onPress' | 'disabled' | 'testID' | 'style'> & {
  tone?: 'primary' | 'secondary' | 'accent';
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.text, { opacity: pressed ? 0.6 : disabled ? 0.4 : 1 }, style]}
    >
      <AppText variant="callout" tone={tone}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 52,
    borderRadius: radii.button,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { fontSize: 17 },
  glass: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: {
    minHeight: spacing.minTouchTarget,
    minWidth: spacing.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
});
