import { StyleSheet, View } from 'react-native';
import type { RoleAction, RoleActionId } from '../auth';
import { colors, radii, spacing } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

// Contextual shortcuts. Presentation only: the backend decides what each role may actually do.
export function RoleActions({ actions, onPress }: { actions: RoleAction[]; onPress: (id: RoleActionId) => void }) {
  if (actions.length === 0) return null;
  return (
    <View style={styles.row}>
      {actions.map((a) => (
        <PressableScale
          key={a.id}
          testID={`role-action-${a.id}`}
          onPress={() => onPress(a.id)}
          haptic
          accessibilityLabel={a.label}
          accessibilityHint={a.hint}
          style={styles.tile}
        >
          <View style={styles.iconWrap}>
            <Icon name={a.icon} size={20} color={colors.accent} weight="medium" />
          </View>
          <View style={styles.text}>
            <AppText variant="bodyStrong" numberOfLines={1}>{a.label}</AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={2}>{a.hint}</AppText>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.railGap },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: spacing.minTouchTarget + 12,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.strokeHairline,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(79,174,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
});
