import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../theme';
import { PressableScale } from './PressableScale';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  selected?: boolean;
  padded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

// Reference card geometry: base fill + 1px hairline stroke, no shadow (depth comes from
// light, not elevation). Pressable cards get MOTION_SPEC M1.
export function Card({
  onPress,
  selected = false,
  padded = true,
  style,
  children,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: CardProps) {
  const cardStyle = [styles.card, padded && styles.padded, selected && styles.selected, style];

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected }}
        style={cardStyle}
        {...rest}
      >
        {children}
      </PressableScale>
    );
  }
  return (
    <View style={cardStyle} accessibilityLabel={accessibilityLabel} {...rest}>
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.strokeHairline,
  },
  padded: { padding: spacing.md },
  selected: { backgroundColor: colors.bgSelected },
  divider: { height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.strokeHairline },
});
