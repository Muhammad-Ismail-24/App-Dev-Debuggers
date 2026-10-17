import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import type { QueueItem } from '../storage/offlineQueueRepository';
import { explainRejection } from '../sync/errorMessages';
import { AppText } from './AppText';
import { TextButton } from './Button';
import { QueueStatusChip } from './QueueStatusChip';

const time = (iso: string) => iso.slice(11, 16);

// Plain-language line under each queued action. Never says "synced" unless the server said so.
export function describeItem(i: QueueItem): string {
  switch (i.status) {
    case 'pending': return `Saved on this device at ${time(i.queuedAt)}. Not sent yet.`;
    case 'syncing': return 'Sending to the server…';
    case 'failed': return `${i.lastError ?? "Couldn't reach the server."} It stays in the queue and will be sent again.`;
    case 'rejected': return explainRejection(i.errorCode);
    case 'synced':
      return i.resolution === 'skipped_duplicate' ? 'The server already had this action.'
        : i.resolution === 'rebased_append' ? 'Confirmed by the server and added after newer changes.'
        : 'Confirmed by the server.';
  }
}

export function QueueItemRow({ item, onDismiss }: { item: QueueItem; onDismiss?: (actionId: string) => void }) {
  const conflict = item.status === 'rejected' && (item.resolution === 'server_wins' || item.errorCode === 'INVALID_BASE_VERSION');
  return (
    <View style={styles.row} testID={`queue-item-${item.dedupeKey}`} accessible accessibilityLabel={`${item.summary}. ${item.status}. ${describeItem(item)}`}>
      <View style={styles.top}>
        <AppText variant="bodyStrong" style={styles.title} numberOfLines={2}>{item.summary}</AppText>
        <QueueStatusChip status={item.status} />
      </View>
      {conflict ? <AppText variant="caption" tone="danger" style={styles.conflict}>Conflict · the server's version was kept</AppText> : null}
      <AppText variant="callout" tone="secondary">{describeItem(item)}</AppText>
      {(item.status === 'rejected' || item.status === 'synced') && onDismiss ? (
        <TextButton label="Dismiss" tone="accent" onPress={() => onDismiss(item.actionId)} style={styles.dismiss} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.strokeHairline },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  title: { flex: 1 },
  conflict: { fontWeight: '700' },
  dismiss: { alignSelf: 'flex-start', minHeight: 36 },
});
