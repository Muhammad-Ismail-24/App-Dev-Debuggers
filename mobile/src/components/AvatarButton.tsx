import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

// Profile entry point: initials disc in a 48pt hit area.
export function AvatarButton({ name, onPress }: { name: string; onPress: () => void }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (
    <PressableScale
      testID="home-avatar-button"
      onPress={onPress}
      accessibilityLabel="Profile"
      accessibilityHint="Opens your profile and settings"
      hitSlop={6}
      style={styles.hit}
    >
      <View style={styles.disc}>
        <AppText variant="caption" style={styles.text} maxFontSizeMultiplier={1}>{initials || '?'}</AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hit: { width: spacing.minTouchTarget - 8, height: spacing.minTouchTarget - 8, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgSelected, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
