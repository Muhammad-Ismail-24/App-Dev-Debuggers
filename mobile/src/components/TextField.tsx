import { useState, type ComponentRef, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radii, spacing, timing, typography } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface TextFieldProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label: string;
  helper?: string;
  error?: string;
  ref?: Ref<ComponentRef<typeof TextInput>>;
  // Masks the text and adds a show/hide toggle (passwords).
  secure?: boolean;
}

// Dark re-skin of the reference's form fields: sunken well, hairline stroke that crossfades to
// accent on focus (150ms), label above (never placeholder-only), plain-language error below.
export function TextField({ label, helper, error, secure = false, style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const [visible, setVisible] = useState(false);
  const focus = useSharedValue(0);
  const wellStyle = useAnimatedStyle(() => ({
    borderColor: error ? colors.danger : interpolateColor(focus.value, [0, 1], [colors.strokeHairline, colors.accent]),
  }));

  return (
    <View style={styles.wrap}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <Animated.View style={[styles.well, wellStyle]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? helper}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          keyboardAppearance="dark"
          secureTextEntry={secure && !visible}
          onFocus={(e) => {
            focus.value = withTiming(1, timing.fast);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            focus.value = withTiming(0, timing.fast);
            onBlur?.(e);
          }}
          style={[styles.input, style]}
          {...rest}
        />
        {secure ? (
          <Pressable
            testID="password-visibility-toggle"
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            hitSlop={4}
            style={styles.toggle}
          >
            <Icon name={visible ? 'eye.slash' : 'eye'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" tone="tertiary">
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  well: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderRadius: radii.chip + 2,
    backgroundColor: colors.bgSunken,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  input: { ...typography.body, flex: 1, color: colors.textPrimary, minHeight: 50, paddingHorizontal: spacing.md },
  toggle: { width: spacing.minTouchTarget, height: spacing.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
