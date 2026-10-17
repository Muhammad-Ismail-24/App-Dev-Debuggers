import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { AppText } from '../components/AppText';
import { ChipRail } from '../components/ChipRail';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { MatchCard } from '../components/MatchCard';
import { Screen } from '../components/Screen';
import { devSportsRepository } from '../data/devSportsRepository';
import type { SportsRepository } from '../data/sportsRepository';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import type { TabScreenProps } from '../navigation/types';
import { spacing } from '../theme';
import type { FixturesData } from '../types/league';
import type { MatchSummary } from '../types/league';
import { formatDayLabel } from '../utils/dateFormat';

const ALL = 'all';
type StatusFilter = 'all' | 'live' | 'upcoming' | 'completed';
const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
];

const statusGroup = (m: MatchSummary): Exclude<StatusFilter, 'all'> =>
  m.status === 'live' || m.status === 'break' ? 'live' : m.status === 'final' ? 'completed' : 'upcoming';

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Fixtures tab: competition, status and date filters over date-grouped vertical MatchCards
// (SCREEN_MAP: vertical works at 360pt wide). Filtering is client-side over one loaded list.
export function FixturesScreen({ navigation, repository = devSportsRepository }: TabScreenProps<'Fixtures'> & { repository?: SportsRepository }) {
  const { session } = useSession();
  const load = useCallback(() => repository.loadFixtures(session!), [repository, session]);
  const { state, refreshing, refresh, retry } = useLoad<FixturesData>(load);
  const [competition, setCompetition] = useState(ALL);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [day, setDay] = useState(ALL);

  const open = (matchId: string) => navigation.navigate('MatchDetail', { matchId });

  return (
    <Screen title="Fixtures" testID="fixtures-screen" refreshing={refreshing} onRefresh={refresh}>
      {state.status === 'loading' ? <LoadingState label="Loading fixtures" count={4} /> : null}
      {state.status === 'error' ? <ErrorState message={`${state.message} Check your connection and try again.`} onRetry={retry} /> : null}
      {state.status === 'ready' ? (
        <Loaded
          matches={state.data.matches}
          competitions={state.data.competitions}
          competition={competition}
          status={status}
          day={day}
          setCompetition={setCompetition}
          setStatus={setStatus}
          setDay={setDay}
          onOpen={open}
        />
      ) : null}
    </Screen>
  );
}

interface LoadedProps {
  matches: MatchSummary[];
  competitions: { id: string; name: string }[];
  competition: string;
  status: StatusFilter;
  day: string;
  setCompetition: (v: string) => void;
  setStatus: (v: StatusFilter) => void;
  setDay: (v: string) => void;
  onOpen: (id: string) => void;
}

function Loaded({ matches, competitions, competition, status, day, setCompetition, setStatus, setDay, onOpen }: LoadedProps) {
  const filtersIn = useEnterAnimation(0);
  const listIn = useEnterAnimation(1);

  // Date chips come from the days that actually have matches in the current competition/status.
  const base = useMemo(
    () => matches.filter((m) => (competition === ALL || m.competitionId === competition) && (status === 'all' || statusGroup(m) === status)),
    [matches, competition, status],
  );
  const days = useMemo(() => Array.from(new Set(base.map((m) => dayKey(m.startsAt)))).sort(), [base]);
  const activeDay = day !== ALL && !days.includes(day) ? ALL : day; // selected day vanished after another filter changed
  const visible = useMemo(() => base.filter((m) => activeDay === ALL || dayKey(m.startsAt) === activeDay), [base, activeDay]);

  const groups = useMemo(() => {
    const map = new Map<string, MatchSummary[]>();
    [...visible]
      .sort((a, b) => (statusGroup(a) === 'live' ? -1 : 0) - (statusGroup(b) === 'live' ? -1 : 0) || +new Date(a.startsAt) - +new Date(b.startsAt))
      .forEach((m) => {
        const k = statusGroup(m) === 'live' ? 'live' : dayKey(m.startsAt);
        map.set(k, [...(map.get(k) ?? []), m]);
      });
    return [...map.entries()];
  }, [visible]);

  if (matches.length === 0) {
    return <EmptyState icon="sportscourt" title="No matches yet" message="Fixtures will appear here once your league publishes them. Pull down to refresh." />;
  }

  const filtered = competition !== ALL || status !== 'all' || activeDay !== ALL;

  return (
    <>
      <Animated.View entering={filtersIn} style={styles.filters}>
        {competitions.length > 1 ? (
          <ChipRail label="Competition" selectedId={competition} onSelect={setCompetition} options={[{ id: ALL, label: 'All sports' }, ...competitions.map((c) => ({ id: c.id, label: c.name }))]} />
        ) : null}
        <ChipRail label="Match status" selectedId={status} onSelect={(id) => setStatus(id as StatusFilter)} options={STATUS_OPTIONS} />
        {days.length > 1 ? (
          <ChipRail
            label="Date"
            selectedId={activeDay}
            onSelect={setDay}
            options={[{ id: ALL, label: 'Any date' }, ...days.map((k) => ({ id: k, label: formatDayLabel(`${k}T12:00:00`) }))]}
          />
        ) : null}
      </Animated.View>

      {groups.length === 0 ? (
        <EmptyState
          icon="line.3.horizontal.decrease.circle"
          title="No matches for these filters"
          message="Try a different competition, status or date."
          actionLabel={filtered ? 'Clear filters' : undefined}
          onAction={() => {
            setCompetition(ALL);
            setStatus('all');
            setDay(ALL);
          }}
          testID="fixtures-empty-filtered"
        />
      ) : (
        <Animated.View entering={listIn} style={styles.groups}>
          {groups.map(([key, list]) => (
            <View key={key} style={styles.group}>
              <AppText variant="headline" accessibilityRole="header">{key === 'live' ? 'Live now' : formatDayLabel(`${key}T12:00:00`)}</AppText>
              {list.map((m) => (
                <MatchCard key={m.id} match={m} onPress={onOpen} testID={`fixture-card-${m.id}`} />
              ))}
            </View>
          ))}
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
  groups: { gap: spacing.sectionGap },
  group: { gap: spacing.railGap },
});
