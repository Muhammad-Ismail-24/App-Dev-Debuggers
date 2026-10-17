import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { PrimaryButton, TextButton } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { QueueItemRow } from '../components/QueueItemRow';
import { useSync } from '../hooks/useSync';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, radii, spacing } from '../theme';

function lastSyncText(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Modal sheet opened from the always-visible connectivity pill and from Profile.
export function SyncStatusScreen({ navigation }: RootStackScreenProps<'SyncStatus'>) {
  const insets = useSafeAreaInsets();
  const { online, syncing, items, counts, unsyncedCount, lastSyncAt, lastOutcome, storageError, syncNow, clearResolved, dismiss } = useSync();
  const resolved = counts.synced + counts.rejected;
  const state = syncing ? 'Syncing' : online ? 'Online' : 'Offline';

  return (
    <View style={styles.root} testID="sync-status-screen">
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">Sync status</AppText>
        <TextButton testID="sync-close-button" label="Close" tone="accent" onPress={() => navigation.goBack()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} showsVerticalScrollIndicator={false}>
        {storageError ? (
          <View style={styles.alert} accessibilityRole="alert" testID="sync-storage-error">
            <Icon name="exclamationmark.triangle.fill" size={18} color={colors.danger} />
            <AppText variant="callout" style={styles.flex}>The on-device database couldn't be opened, so changes made offline can't be saved. Restart the app. ({storageError})</AppText>
          </View>
        ) : null}

        <Card style={styles.card}>
          <Row label="Connection" value={state} testID="sync-connection" />
          <Row label="Waiting to sync" value={String(unsyncedCount)} testID="sync-unsynced-count" />
          <Row label="Last confirmed by server" value={lastSyncText(lastSyncAt)} testID="sync-last" />
          {lastOutcome?.error ? <AppText variant="callout" tone="danger" testID="sync-last-error">Last attempt failed: {lastOutcome.error}</AppText> : null}
          <PrimaryButton
            testID="sync-now-button"
            label={syncing ? 'Syncing…' : online ? 'Sync now' : 'Offline — will sync when connected'}
            icon="arrow.triangle.2.circlepath"
            loading={syncing}
            disabled={!online || unsyncedCount === 0}
            onPress={() => void syncNow()}
          />
          {online && unsyncedCount === 0 ? <AppText variant="caption" tone="secondary">Nothing is waiting to be sent.</AppText> : null}
        </Card>

        {items.length === 0 ? (
          <EmptyState icon="checkmark.icloud" title="Queue is empty" message="Scores and roster changes made while offline will appear here until the server confirms them." testID="sync-empty" />
        ) : (
          <View>
            <View style={styles.listHead}>
              <AppText variant="headline" accessibilityRole="header">Queued actions</AppText>
              {resolved > 0 ? <TextButton testID="sync-clear-resolved" label={`Clear resolved (${resolved})`} tone="accent" onPress={() => void clearResolved()} /> : null}
            </View>
            {items.map((i) => (
              <QueueItemRow key={i.actionId} item={i} onDismiss={(id) => void dismiss(id)} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="callout" tone="secondary">{label}</AppText>
      <AppText testID={testID} variant="callout" style={styles.value}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.gutter, paddingRight: spacing.sm, paddingTop: spacing.sm },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.xl, paddingTop: spacing.md },
  card: { backgroundColor: colors.bgRaised, gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  value: { flexShrink: 1, textAlign: 'right' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  alert: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radii.card, borderWidth: 1, borderColor: colors.danger, backgroundColor: 'rgba(255,107,107,0.08)' },
});
