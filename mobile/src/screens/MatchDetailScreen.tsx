import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canScoreMatches } from '../auth';
import { AppText } from '../components/AppText';
import { GlassButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonBlock } from '../components/LoadingState';
import { MatchHero } from '../components/MatchHero';
import { PinnedProductCard } from '../components/PinnedProductCard';
import { ScoreTicker } from '../components/ScoreTicker';
import { StackHeader } from '../components/StackHeader';
import { TimelineRow } from '../components/TimelineRow';
import { UnderlineTabs } from '../components/UnderlineTabs';
import { devSportsRepository } from '../data/devSportsRepository';
import type { SportsRepository } from '../data/sportsRepository';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme';
import type { MatchDetailData } from '../types/league';

type DetailTab = 'timeline' | 'store' | 'info';
const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'store', label: 'Store' },
  { id: 'info', label: 'Info' },
];

export function MatchDetailScreen({ navigation, route, repository = devSportsRepository }: RootStackScreenProps<'MatchDetail'> & { repository?: SportsRepository }) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { matchId } = route.params;
  const load = useCallback(() => repository.loadMatch(session!, matchId), [repository, session, matchId]);
  const { state, refreshing, refresh, retry } = useLoad<MatchDetailData>(load);
  const [tab, setTab] = useState<DetailTab>('timeline');

  return (
    <View style={styles.root} testID="match-detail-screen">
      <StackHeader title="Match" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textPrimary} />}
        showsVerticalScrollIndicator={false}
      >
        {state.status === 'loading' ? <DetailSkeleton /> : null}
        {state.status === 'error' ? <ErrorState message={`${state.message} Check your connection and try again.`} onRetry={retry} /> : null}
        {state.status === 'ready' ? (
          <Loaded
            data={state.data}
            tab={tab}
            setTab={setTab}
            canScore={session ? canScoreMatches(session.role) : false}
            onScore={(matchId) => navigation.navigate('ScoringEntry', { matchId })}
            onSelectMatch={(id) => navigation.setParams({ matchId: id })}
            onOpenStore={(productId) => navigation.navigate('ProductDetail', { productId })}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Loaded({ data, tab, setTab, canScore, onScore, onSelectMatch, onOpenStore }: {
  data: MatchDetailData; tab: DetailTab; setTab: (t: DetailTab) => void; canScore: boolean; onScore: (matchId: string) => void; onSelectMatch: (id: string) => void; onOpenStore: (productId: string) => void;
}) {
  const { match } = data;
  const live = match.status === 'live' || match.status === 'break';
  return (
    <View style={styles.stack}>
      <ScoreTicker matches={data.ticker} currentId={match.id} onSelect={onSelectMatch} />
      <MatchHero match={match} />
      <View style={styles.body}>
        {canScore && live ? (
          <GlassButton
            testID="enter-score-button"
            label="Enter score"
            icon="plus.forwardslash.minus"
            onPress={() => onScore(match.id)}
          />
        ) : null}
        <UnderlineTabs tabs={TABS} activeId={tab} onChange={(id) => setTab(id as DetailTab)} />
        {/* Keyed so each tab crossfades in (MOTION M6 content swap, inferred). */}
        <Animated.View key={tab} entering={FadeIn.duration(200)} style={styles.panel}>
          {tab === 'timeline' ? (
            data.events.length > 0 ? (
              <View testID="timeline">
                {data.events.map((e, i) => (
                  <TimelineRow key={e.id} event={e} match={match} index={i} />
                ))}
              </View>
            ) : (
              <EmptyState icon="clock" title="No events yet" message={match.status === 'scheduled' ? 'Events will appear here once the match starts.' : 'No events were recorded for this match.'} testID="timeline-empty" />
            )
          ) : null}
          {tab === 'store' ? (
            data.pinned ? (
              <PinnedProductCard product={data.pinned} onBuy={() => onOpenStore(data.pinned!.id)} />
            ) : (
              <EmptyState icon="bag" title="Nothing pinned" message="No merchandise is pinned to this match." testID="store-empty" />
            )
          ) : null}
          {tab === 'info' ? (
            <View testID="match-info">
              {data.info.map((row) => (
                <View key={row.label} style={styles.infoRow}>
                  <AppText variant="callout" tone="secondary">{row.label}</AppText>
                  <AppText variant="callout" style={styles.infoValue}>{row.value}</AppText>
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View style={[styles.body, styles.stack]} testID="match-loading" accessible accessibilityRole="progressbar" accessibilityLabel="Loading match" accessibilityState={{ busy: true }}>
      <SkeletonBlock height={210} radius={28} />
      <SkeletonBlock height={20} width="60%" />
      <SkeletonBlock height={56} />
      <SkeletonBlock height={56} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  stack: { gap: spacing.md },
  body: { paddingHorizontal: spacing.gutter, gap: spacing.md },
  panel: { minHeight: 120 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.strokeHairline },
  infoValue: { flexShrink: 1, textAlign: 'right' },
});
