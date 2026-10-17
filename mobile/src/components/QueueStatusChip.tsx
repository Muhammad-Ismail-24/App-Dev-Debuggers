import type { SFSymbol } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import type { QueueStatus } from '../storage/offlineQueueRepository';
import { AppText } from './AppText';
import { Icon } from './Icon';

const CONFIG: Record<QueueStatus, { label: string; icon: SFSymbol; color: string }> = {
  pending: { label: 'Pending', icon: 'clock', color: colors.statusOffline },
  syncing: { label: 'Syncing', icon: 'arrow.triangle.2.circlepath', color: colors.statusSyncing },
  synced: { label: 'Synced', icon: 'checkmark.circle.fill', color: colors.success },
  rejected: { label: 'Rejected', icon: 'xmark.octagon.fill', color: colors.danger },
  failed: { label: 'Will retry', icon: 'arrow.clockwise', color: colors.statusOffline },
};

// Status is always icon + text, never color alone.
export function QueueStatusChip({ status }: { status: QueueStatus }) {
  const c = CONFIG[status];
  return (
    <View style={[styles.chip, { borderColor: c.color }]} accessible accessibilityLabel={`Status: ${c.label}`}>
      <Icon name={c.icon} size={12} color={c.color} weight="semibold" />
      <AppText variant="caption" style={{ color: c.color, fontWeight: '700' }} maxFontSizeMultiplier={1.2}>{c.label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
});
