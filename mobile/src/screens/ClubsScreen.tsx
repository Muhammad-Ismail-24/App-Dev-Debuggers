import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClubCard, ClubCardSkeleton } from '../components/ClubCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { StackHeader } from '../components/StackHeader';
import { devSportsRepository } from '../data/devSportsRepository';
import type { SportsRepository } from '../data/sportsRepository';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import type { RootStackScreenProps } from '../navigation/types';
import type { ClubSummary } from '../types/league';
import { colors, spacing } from '../theme';

// Pushed from Home ("All clubs"): a simple two-column directory of club tiles → ClubProfile.
export function ClubsScreen({ navigation, repository = devSportsRepository }: RootStackScreenProps<'Clubs'> & { repository?: SportsRepository }) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const load = useCallback(() => repository.listClubs(session!), [repository, session]);
  const { state, refreshing, refresh, retry } = useLoad<ClubSummary[]>(load);

  return (
    <View style={styles.root} testID="clubs-screen">
      <StackHeader title="Clubs" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textPrimary} />}
      >
        {state.status === 'loading' ? (
          <View style={styles.grid} accessible accessibilityRole="progressbar" accessibilityLabel="Loading clubs" accessibilityState={{ busy: true }}>
            {Array.from({ length: 4 }, (_, i) => <ClubCardSkeleton key={i} />)}
          </View>
        ) : null}
        {state.status === 'error' ? <ErrorState message={`${state.message} Check your connection and try again.`} onRetry={retry} /> : null}
        {state.status === 'ready' && state.data.length === 0 ? (
          <EmptyState icon="shield" title="No clubs yet" message="Clubs will appear here once they join a league." />
        ) : null}
        {state.status === 'ready' && state.data.length > 0 ? (
          <View style={styles.grid}>
            {state.data.map((c) => (
              <ClubCard key={c.id} club={c} testID={`club-card-${c.id}`} onPress={(clubId) => navigation.navigate('ClubProfile', { clubId })} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.railGap },
});
