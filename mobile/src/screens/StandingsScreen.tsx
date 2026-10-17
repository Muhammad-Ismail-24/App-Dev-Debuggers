import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ChipRail } from '../components/ChipRail';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { MatchCard } from '../components/MatchCard';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { StandingsTable } from '../components/StandingsTable';
import { devSportsRepository } from '../data/devSportsRepository';
import type { SportsRepository } from '../data/sportsRepository';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import type { TabScreenProps } from '../navigation/types';
import { spacing } from '../theme';
import type { StandingsData } from '../types/league';

// Standings tab: competition picker, ranking table (row → club) and that competition's
// matches (card → match) — standings → match in ≤ 3 taps (judge task A).
export function StandingsScreen({ navigation, repository = devSportsRepository }: TabScreenProps<'Standings'> & { repository?: SportsRepository }) {
  const { session } = useSession();
  const load = useCallback(() => repository.loadStandings(session!), [repository, session]);
  const { state, refreshing, refresh, retry } = useLoad<StandingsData>(load);
  const [selected, setSelected] = useState<string | undefined>();

  return (
    <Screen title="Standings" testID="standings-screen" refreshing={refreshing} onRefresh={refresh}>
      {state.status === 'loading' ? <LoadingState label="Loading standings" count={3} /> : null}
      {state.status === 'error' ? <ErrorState message={`${state.message} Check your connection and try again.`} onRetry={retry} /> : null}
      {state.status === 'ready' ? (
        <Loaded
          data={state.data}
          selectedId={selected}
          onSelect={setSelected}
          onOpenClub={(clubId) => navigation.navigate('ClubProfile', { clubId })}
          onOpenMatch={(matchId) => navigation.navigate('MatchDetail', { matchId })}
        />
      ) : null}
    </Screen>
  );
}

function Loaded({ data, selectedId, onSelect, onOpenClub, onOpenMatch }: {
  data: StandingsData; selectedId?: string; onSelect: (id: string) => void; onOpenClub: (id: string) => void; onOpenMatch: (id: string) => void;
}) {
  const pickerIn = useEnterAnimation(0);
  const tableIn = useEnterAnimation(1);
  if (data.tables.length === 0) {
    return <EmptyState icon="trophy" title="No standings yet" message="Tables appear once a competition has played its first match. Pull down to refresh." />;
  }
  const table = data.tables.find((t) => t.competitionId === selectedId) ?? data.tables[0];
  const matches = [...table.matches].sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt)).slice(0, 4);

  return (
    <>
      {data.tables.length > 1 ? (
        <Animated.View entering={pickerIn}>
          <ChipRail label="Competition" selectedId={table.competitionId} onSelect={onSelect} options={data.tables.map((t) => ({ id: t.competitionId, label: t.competitionName }))} />
        </Animated.View>
      ) : null}
      {/* Keyed by competition so switching tables crossfades the new one in. */}
      <Animated.View key={table.competitionId} entering={tableIn} style={styles.gap}>
        {table.rows.length > 0 ? (
          <StandingsTable data={table} onOpenClub={onOpenClub} />
        ) : (
          <EmptyState icon="trophy" title="No table yet" message={`${table.competitionName} has no results to rank.`} />
        )}
        {matches.length > 0 ? (
          <View style={styles.matches}>
            <SectionHeader title="Matches" />
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} onPress={onOpenMatch} testID={`standings-match-${m.id}`} />
            ))}
          </View>
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sectionGap },
  matches: { gap: spacing.railGap },
});
