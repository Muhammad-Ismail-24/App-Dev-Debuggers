import type { SFSymbol } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { AppText } from './AppText';
import { GlassButton } from './Button';
import { Icon } from './Icon';

interface EmptyStateProps {
  icon: SFSymbol;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

// Helpful empty list message (rubric: "No matches yet" instead of a blank screen).
export function EmptyState({ icon, title, message, actionLabel, onAction, testID = 'empty-state' }: EmptyStateProps) {
  return (
    <View testID={testID} style={styles.wrap}>
      <View style={styles.badge}>
        <Icon name={icon} size={26} color={colors.textSecondary} />
      </View>
      <AppText variant="headline" align="center" accessibilityRole="header">
        {title}
      </AppText>
      {message ? (
        <AppText variant="callout" tone="secondary" align="center" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? <GlassButton label={actionLabel} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

export const stateStyles = StyleSheet.create({
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.strokeHairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xxl },
  badge: stateStyles.badge,
  message: { maxWidth: 300 },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },
});
