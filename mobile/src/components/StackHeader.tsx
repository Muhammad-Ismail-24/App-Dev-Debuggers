import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { AppText } from './AppText';
import { ConnectivityPill } from './ConnectivityPill';
import { Icon } from './Icon';

interface StackHeaderProps {
  title?: string;
  onBack: () => void;
  backLabel?: string;
  onConnectivityPress?: () => void;
  // Transparent over a hero (Match Detail) vs. solid base color.
  transparent?: boolean;
}

// Header for pushed screens: the reference's bare white chevron (no "Back" text) in a
// 48pt hit box, optional centered title, connectivity pill on the right.
// Edge-swipe back comes from the native stack.
export function StackHeader({
  title,
  onBack,
  backLabel = 'Back',
  onConnectivityPress,
  transparent = false,
}: StackHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top }, !transparent && styles.solid]}>
      <View style={styles.row}>
        <Pressable
          testID="header-back-button"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name="chevron.left" size={20} weight="semibold" />
        </Pressable>
        {title ? (
          <AppText variant="headline" numberOfLines={1} style={styles.title} accessibilityRole="header">
            {title}
          </AppText>
        ) : (
          <View style={styles.title} />
        )}
        <View style={styles.right}>
          <ConnectivityPill onPress={onConnectivityPress} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { zIndex: 10 },
  solid: { backgroundColor: colors.bgBase },
  row: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs },
  back: {
    width: spacing.minTouchTarget,
    height: spacing.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, textAlign: 'center' },
  right: { minWidth: spacing.minTouchTarget, alignItems: 'flex-end', paddingRight: spacing.md },
});
