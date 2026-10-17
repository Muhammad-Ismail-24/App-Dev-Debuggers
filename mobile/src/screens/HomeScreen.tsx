import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { quickActionsFor, type RoleActionId } from '../auth';
import { AppText } from '../components/AppText';
import { AvatarButton } from '../components/AvatarButton';
import { ChipRail } from '../components/ChipRail';
import { ClubCard, ClubCardSkeleton, CLUB_CARD_WIDTH } from '../components/ClubCard';
import { COMPACT_CARD_WIDTH, CompactMatchCard } from '../components/CompactMatchCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { FeaturedMatchCard } from '../components/FeaturedMatchCard';
import { MatchCard } from '../components/MatchCard';
import { CompactMatchSkeleton, FeaturedMatchSkeleton } from '../components/MatchSkeletons';
import { PageDots } from '../components/PageDots';
import { RoleActions } from '../components/RoleActions';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { StandingsPreview, StandingsPreviewSkeleton } from '../components/StandingsPreview';
import { devHomeRepository } from '../data/devHomeRepository';
import type { HomeRepository } from '../data/homeRepository';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { useHomeData } from '../hooks/useHomeData';
import { useSession } from '../hooks/useSession';
import { spacing } from '../theme';
import type { HomeData, MatchSummary } from '../types/league';

const ALL = 'all';
const PEEK = 28; // next featured card peeks in, hinting the rail scrolls (reference Home rail)

export interface HomeScreenProps {
  // Navigation is injected so this screen has no dependency on route names. See
  // PHASE2_INTEGRATION.md for the AppNavigator wiring.
  onOpenMatch: (matchId: string) => void;
  onOpenFixtures: () => void;
  onOpenStandings: (competitionId?: string) => void;
  onOpenClub: (clubId: string) => void;
  onOpenClubs: () => void;
  onOpenProfile: () => void;
  onRoleAction: (action: RoleActionId) => void;
  onConnectivityPress?: () => void;
  // Defaults to the DEV fixtures repository until a backend one exists.
  repository?: HomeRepository;
}

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomeScreen({
  onOpenMatch, onOpenFixtures, onOpenStandings, onOpenClub, onOpenClubs, onOpenProfile, onRoleAction, onConnectivityPress,
  repository = devHomeRepository,
}: HomeScreenProps) {
  const { session } = useSession();
  if (!session) return null; // Home is only reachable after sign-in.
  return (
    <HomeContent
      session={session}
      repository={repository}
      {...{ onOpenMatch, onOpenFixtures, onOpenStandings, onOpenClub, onOpenClubs, onOpenProfile, onRoleAction, onConnectivityPress }}
    />
  );
}

function HomeContent(props: HomeScreenProps & { session: NonNullable<ReturnType<typeof useSession>['session']>; repository: HomeRepository }) {
  const { session, repository } = props;
  const { state, refreshing, refresh, retry } = useHomeData(repository, session);
  const [competitionId, setCompetitionId] = useState(ALL);
  const actions = useMemo(() => quickActionsFor(session.role), [session.role]);

  return (
    <Screen
      title="Home"
      testID="home-screen"
      refreshing={refreshing}
      onRefresh={refresh}
      onConnectivityPress={props.onConnectivityPress}
      headerRight={<AvatarButton name={session.displayName} onPress={props.onOpenProfile} />}
    >
      <Greeting name={session.displayName} simulated={session.source === 'dev-simulated'} />

      {state.status === 'loading' ? <HomeSkeleton /> : null}
      {state.status === 'error' ? <ErrorState message={`${state.message} Check your connection and try again.`} onRetry={retry} /> : null}
      {state.status === 'ready' ? (
        <Loaded {...props} data={state.data} competitionId={competitionId} onSelectCompetition={setCompetitionId} actions={actions} />
      ) : null}
    </Screen>
  );
}

function Greeting({ name, simulated }: { name: string; simulated: boolean }) {
  const entering = useEnterAnimation(0);
  return (
    <Animated.View entering={entering} style={styles.greeting}>
      <AppText variant="title" numberOfLines={1}>{greeting()}, {name.split(' ')[0]}</AppText>
      {simulated ? <AppText variant="caption" tone="secondary">Simulated session · development build</AppText> : null}
    </Animated.View>
  );
}

function Loaded({
  data, competitionId, onSelectCompetition, actions, onOpenMatch, onOpenFixtures, onOpenStandings, onOpenClub, onOpenClubs, onRoleAction,
}: HomeScreenProps & { data: HomeData; competitionId: string; onSelectCompetition: (id: string) => void; actions: ReturnType<typeof quickActionsFor> }) {
  const byComp = <T extends { competitionId: string }>(xs: T[]) => (competitionId === ALL ? xs : xs.filter((x) => x.competitionId === competitionId));
  const featured = byComp(data.featured);
  const upcoming = byComp(data.upcoming);
  const standings = competitionId === ALL ? data.standings[0] : data.standings.find((s) => s.competitionId === competitionId);
  const nothingAtAll = data.featured.length === 0 && data.upcoming.length === 0 && data.standings.length === 0 && data.clubs.length === 0;

  const enterPicker = useEnterAnimation(0);
  const enterFeatured = useEnterAnimation(1);
  const enterActions = useEnterAnimation(2);
  const enterUpcoming = useEnterAnimation(3);
  const enterStandings = useEnterAnimation(4);
  const enterClubs = useEnterAnimation(5);

  if (nothingAtAll) {
    return <EmptyState icon="sportscourt" title="No matches yet" message="Fixtures, standings and clubs will appear here once your league publishes them. Pull down to refresh." />;
  }

  return (
    <>
      {data.competitions.length > 1 ? (
        <Animated.View entering={enterPicker}>
          <ChipRail
            label="Competition"
            selectedId={competitionId}
            onSelect={onSelectCompetition}
            options={[{ id: ALL, label: 'All' }, ...data.competitions.map((c) => ({ id: c.id, label: c.name }))]}
          />
        </Animated.View>
      ) : null}

      <Animated.View entering={enterFeatured} style={styles.section}>
        <SectionHeader title={featured.some((m) => m.status === 'live') ? 'Live & featured' : 'Featured'} />
        {featured.length > 0 ? (
          <FeaturedCarousel matches={featured} onPress={onOpenMatch} />
        ) : (
          <EmptyState icon="sportscourt" title="No featured matches" message="Nothing live or coming up for this competition right now." testID="featured-empty" />
        )}
      </Animated.View>

      {actions.length > 0 ? (
        <Animated.View entering={enterActions} style={styles.section}>
          <SectionHeader title="For you" />
          <RoleActions actions={actions} onPress={onRoleAction} />
        </Animated.View>
      ) : null}

      <Animated.View entering={enterUpcoming} style={styles.section}>
        <SectionHeader title="Upcoming fixtures" actionLabel="All fixtures" onAction={onOpenFixtures} />
        {upcoming.length > 0 ? (
          <MatchRail matches={upcoming} onPress={onOpenMatch} />
        ) : (
          <AppText variant="callout" tone="secondary">No upcoming fixtures for this competition.</AppText>
        )}
      </Animated.View>

      {standings ? (
        <Animated.View entering={enterStandings} style={styles.section}>
          <SectionHeader title={`${standings.competitionName} standings`} actionLabel="Full table" onAction={() => onOpenStandings(standings.competitionId)} />
          <StandingsPreview data={standings} onOpen={() => onOpenStandings(standings.competitionId)} />
        </Animated.View>
      ) : null}

      {data.clubs.length > 0 ? (
        <Animated.View entering={enterClubs} style={styles.section}>
          <SectionHeader title="Clubs" actionLabel="All clubs" onAction={onOpenClubs} />
          <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent} style={styles.bleed} decelerationRate="fast" snapToInterval={CLUB_CARD_WIDTH + spacing.railGap} snapToAlignment="start">
            {data.clubs.map((c) => (
              <ClubCard key={c.id} club={c} onPress={onOpenClub} testID={`club-card-${c.id}`} />
            ))}
          </Animated.ScrollView>
        </Animated.View>
      ) : null}
    </>
  );
}

// Snap-paging rail with a peeking next card, a subtle depth scale on neighbours, and dots
// driven by the same scroll offset. All motion is on the UI thread (inferred, MOTION S5/M7).
function FeaturedCarousel({ matches, onPress }: { matches: MatchSummary[]; onPress: (id: string) => void }) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - spacing.gutter * 2 - PEEK;
  const step = cardWidth + spacing.railGap;
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  return (
    <View style={styles.carousel}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={step}
        snapToAlignment="start"
        disableIntervalMomentum
        contentContainerStyle={[styles.railContent, { gap: spacing.railGap }]}
        style={styles.bleed}
        testID="featured-carousel"
      >
        {matches.map((m, i) => (
          <CarouselItem key={m.id} index={i} step={step} scrollX={scrollX}>
            <FeaturedMatchCard match={m} width={cardWidth} onPress={onPress} testID={`featured-card-${m.id}`} />
          </CarouselItem>
        ))}
      </Animated.ScrollView>
      <PageDots count={matches.length} scrollX={scrollX} step={step} />
    </View>
  );
}

function CarouselItem({ index, step, scrollX, children }: { index: number; step: number; scrollX: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scrollX.value / step - index);
    return { opacity: interpolate(d, [0, 1], [1, 0.72], Extrapolation.CLAMP), transform: [{ scale: interpolate(d, [0, 1], [1, 0.96], Extrapolation.CLAMP) }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

function MatchRail({ matches, onPress }: { matches: MatchSummary[]; onPress: (id: string) => void }) {
  // First two as full-width cards, the rest in the reference's compact horizontal rail.
  const lead = matches.slice(0, 2);
  const rest = matches.slice(2);
  return (
    <View style={styles.stack}>
      {lead.map((m) => (
        <MatchCard key={m.id} match={m} onPress={onPress} testID={`upcoming-card-${m.id}`} />
      ))}
      {rest.length > 0 ? (
        <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.railContent, { gap: spacing.railGap }]} style={styles.bleed} decelerationRate="fast" snapToInterval={COMPACT_CARD_WIDTH + spacing.railGap}>
          {rest.map((m) => (
            <CompactMatchCard key={m.id} match={m} onPress={onPress} testID={`compact-card-${m.id}`} />
          ))}
        </Animated.ScrollView>
      ) : null}
    </View>
  );
}

function HomeSkeleton() {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.sectionGap} testID="home-loading" accessible accessibilityRole="progressbar" accessibilityLabel="Loading your dashboard" accessibilityState={{ busy: true }}>
      <FeaturedMatchSkeleton width={width - spacing.gutter * 2 - PEEK} />
      <View style={styles.railRow}>
        <CompactMatchSkeleton />
        <CompactMatchSkeleton />
      </View>
      <StandingsPreviewSkeleton />
      <View style={styles.railRow}>
        <ClubCardSkeleton />
        <ClubCardSkeleton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { gap: 2 },
  section: { gap: spacing.xs },
  sectionGap: { gap: spacing.sectionGap },
  stack: { gap: spacing.railGap },
  carousel: { gap: spacing.sm },
  // Rails bleed to the screen edge while content stays on the 16pt gutter.
  bleed: { marginHorizontal: -spacing.gutter, flexGrow: 0 },
  railContent: { paddingHorizontal: spacing.gutter, gap: spacing.railGap },
  railRow: { flexDirection: 'row', gap: spacing.railGap, overflow: 'hidden' },
});
