import { useCallback, useMemo } from 'react';
import { ActionSheetIOS, Alert, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RosterChange } from '../api/audit';
import { canManageRoster } from '../auth';
import { AppText } from '../components/AppText';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { SkeletonBlock } from '../components/LoadingState';
import { PressableScale } from '../components/PressableScale';
import { QueueStatusChip } from '../components/QueueStatusChip';
import { StackHeader } from '../components/StackHeader';
import { devSportsRepository } from '../data/devSportsRepository';
import type { SportsRepository } from '../data/sportsRepository';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import { useSync } from '../hooks/useSync';
import type { RootStackScreenProps } from '../navigation/types';
import { explainRejection } from '../sync/errorMessages';
import { colors, radii, spacing } from '../theme';
import type { ClubProfileData, RosterPlayer } from '../types/league';

const LABEL: Record<RosterChange, string> = { transfer: 'Transfer', loan: 'Loan', release: 'Release' };

// Club Manager view of the squad. Rows show server-known data plus this device's unconfirmed
// changes (Pending / Will retry / Rejected). "Add player" is not offered: the contract has no
// add route (only transfer, loan and release; /roster/setup rebuilds a whole league scenario).
export function RosterManagementScreen({ navigation, route, repository = devSportsRepository }: RootStackScreenProps<'RosterManagement'> & { repository?: SportsRepository }) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { items } = useSync();
  const { clubId } = route.params;
  const load = useCallback(() => repository.loadClub(session!, clubId), [repository, session, clubId]);
  const { state, refreshing, refresh, retry } = useLoad<ClubProfileData>(load);
  const allowed = session ? canManageRoster(session.role) : false; // visibility only; the server enforces

  const pendingByPlayer = useMemo(() => {
    const m = new Map<string, typeof items>();
    items.filter((i) => i.type === 'roster_transfer').forEach((i) => m.set(i.entityId, [...(m.get(i.entityId) ?? []), i]));
    return m;
  }, [items]);

  const openActions = (player: RosterPlayer) => {
    const go = (action: RosterChange) => navigation.navigate('RosterAction', { clubId, playerId: player.id, action });
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: player.name, options: ['Transfer', 'Loan', 'Release', 'Cancel'], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (i) => { if (i === 0) go('transfer'); else if (i === 1) go('loan'); else if (i === 2) go('release'); },
      );
    } else {
      Alert.alert(player.name, undefined, [
        { text: 'Transfer', onPress: () => go('transfer') },
        { text: 'Loan', onPress: () => go('loan') },
        { text: 'Release', style: 'destructive', onPress: () => go('release') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={styles.root} testID="roster-management-screen">
      <StackHeader title="Roster" onBack={() => navigation.goBack()} onConnectivityPress={() => navigation.navigate('SyncStatus')} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textPrimary} />}
      >
        {!allowed ? <EmptyState icon="lock" title="Roster changes aren't available for your role" message="Only club managers and administrators can change a roster." testID="roster-forbidden" /> : null}
        {allowed && state.status === 'loading' ? (
          <View style={styles.stack} testID="roster-loading" accessible accessibilityRole="progressbar" accessibilityLabel="Loading roster" accessibilityState={{ busy: true }}>
            {Array.from({ length: 6 }, (_, i) => <SkeletonBlock key={i} height={56} />)}
          </View>
        ) : null}
        {allowed && state.status === 'error' ? <ErrorState message={`${state.message} Check your connection and try again.`} onRetry={retry} /> : null}
        {allowed && state.status === 'ready' ? (
          <View>
            <AppText variant="title" accessibilityRole="header" numberOfLines={2}>{state.data.club.name}</AppText>
            <AppText variant="caption" tone="secondary" style={styles.sub}>
              {state.data.roster.length} players{state.data.rosterContext?.maxSquadSize ? ` · max ${state.data.rosterContext.maxSquadSize}` : ''}
            </AppText>
            {state.data.roster.length === 0 ? <EmptyState icon="person.2" title="No players listed" testID="roster-empty" /> : null}
            {state.data.roster.map((p) => {
              const mine = pendingByPlayer.get(p.id) ?? [];
              return (
                <PressableScale key={p.id} testID={`roster-player-${p.id}`} onPress={() => openActions(p)} scaleTo={0.99} accessibilityLabel={`${p.name}, ${p.position}${mine.length ? `, ${mine.length} unconfirmed change` : ''}`} accessibilityHint="Opens transfer, loan and release options" style={styles.player}>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{p.name}</AppText>
                    <AppText variant="caption" tone="secondary">{p.position}{p.roleChip ? ` · ${p.roleChip}` : ''}{p.onLoan ? ' · On loan' : ''}</AppText>
                    {mine.map((i) => (
                      <View key={i.actionId} style={styles.change}>
                        <QueueStatusChip status={i.status} />
                        <AppText variant="caption" tone="secondary" style={styles.flex}>{i.status === 'rejected' ? explainRejection(i.errorCode) : i.summary}</AppText>
                      </View>
                    ))}
                  </View>
                  <Icon name="ellipsis.circle" size={22} color={colors.textSecondary} />
                </PressableScale>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  stack: { gap: spacing.sm },
  sub: { marginBottom: spacing.md },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: spacing.minTouchTarget + 8, paddingVertical: spacing.sm, borderRadius: radii.chip, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.strokeHairline },
  change: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
});
