import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { AppText } from './AppText';
import { PrimaryButton } from './Button';
import { stateStyles } from './EmptyState';
import { Icon } from './Icon';

interface ErrorStateProps {
  title?: string;
  // Plain-language explanation — never a raw code like "Error 500" (PDF §8.6).
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, retrying = false }: ErrorStateProps) {
  return (
    <View testID="error-state" style={styles.wrap} accessibilityLiveRegion="assertive">
      <View style={stateStyles.badge}>
        <Icon name="exclamationmark.triangle" size={26} color={colors.danger} />
      </View>
      <AppText variant="headline" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="callout" tone="secondary" align="center" style={styles.message}>
        {message}
      </AppText>
      {onRetry ? (
        <PrimaryButton
          testID="error-retry-button"
          label="Try again"
          icon="arrow.clockwise"
          onPress={onRetry}
          loading={retrying}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xxl },
  message: { maxWidth: 300 },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },
});
