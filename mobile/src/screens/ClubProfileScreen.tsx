import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canManageRoster } from '../auth';
import { AppText } from '../components/AppText';
import { GlassButton } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { SkeletonBlock } from '../components/LoadingState';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader } from '../components/SectionHeader';
import { StackHeader } from '../components/StackHeader';
import { Crest } from '../components/TeamIdentity';
import { UnderlineTabs } from '../components/UnderlineTabs';
import { devSportsRepository } from '../data/devSportsRepository';
import type { SportsRepository } from '../data/sportsRepository';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, radii, spacing } from '../theme';
import { clubColor } from '../theme/clubColor';
import type { ClubProfileData } from '../types/league';

type ClubTab = 'overview' | 'roster' | 'staff';
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'roster', label: 'Roster' },
  { id: 'staff', label: 'Staff' },
];

export function ClubProfileScreen({ navigation, route, repository = devSportsRepository }: RootStackScreenProps<'ClubProfile'> & { repository?: SportsRepository }) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { clubId } = route.params;
  const load = useCallback(() => repository.loadClub(session!, clubId), [repository, session, clubId]);
  const { state, refreshing, refresh, retry } = useLoad<ClubProfileData>(load);
  const [tab, setTab] = useState<ClubTab>('overview');

  return (
    <View style={styles.root} testID="club-profile-screen">
      <StackHeader title="Club" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textPrimary} />}
        showsVerticalScrollIndicator={false}
      >
        {state.status === 'loading' ? (
          <View style={styles.body} testID="club-loading" accessible accessibilityRole="progressbar" accessibilityLabel="Loading club" accessibilityState={{ busy: true }}>
            <SkeletonBlock height={200} radius={28} />
            <SkeletonBlock height={48} />
            <SkeletonBlock height={96} />
          </View>
        ) : null}
        {state.status === 'error' ? <ErrorState message={`${state.message} Check your connection and try again.`} onRetry={retry} /> : null}
        {state.status === 'ready' ? (
          <Loaded
            data={state.data}
            tab={tab}
            setTab={setTab}
            canManage={session ? canManageRoster(session.role) : false}
            onOpenMatch={(matchId) => navigation.navigate('MatchDetail', { matchId })}
            onManageRoster={(id) => navigation.navigate('RosterManagement', { clubId: id })}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Loaded({ data, tab, setTab, canManage, onOpenMatch, onManageRoster }: { data: ClubProfileData; tab: ClubTab; setTab: (t: ClubTab) => void; canManage: boolean; onOpenMatch: (id: string) => void; onManageRoster: (clubId: string) => void }) {
  const { club } = data;
  const color = clubColor(club.id, club.color);
  const groups = useMemo(() => {
    const map = new Map<string, ClubProfileData['roster']>();
    data.roster.forEach((p) => map.set(p.position, [...(map.get(p.position) ?? []), p]));
    return [...map.entries()];
  }, [data.roster]);

  return (
    <View style={styles.stack}>
      {/* Spotlight hero: crest over a club-color glow (reference Select-Club spotlight, adapted). */}
      <View style={styles.hero}>
        <LinearGradient colors={[`${color}99`, `${color}33`, colors.bgBase]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        <Crest team={{ id: club.id, shortName: club.shortName, color: club.color, logoUri: club.logoUri }} size={88} />
        <AppText variant="titleLarge" align="center" accessibilityRole="header" style={styles.name} numberOfLines={3}>{club.name}</AppText>
        {data.venue ? (
          <View style={styles.venuePill}>
            <Icon name="mappin.and.ellipse" size={14} color={colors.textSecondary} />
            <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.venueText}>{data.venue.name}</AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        {canManage ? (
          <GlassButton
            testID="manage-roster-button"
            label="Manage roster"
            icon="person.2"
            onPress={() => onManageRoster(club.id)}
          />
        ) : null}
        <UnderlineTabs tabs={TABS} activeId={tab} onChange={(id) => setTab(id as ClubTab)} />
        <Animated.View key={tab} entering={FadeIn.duration(200)} style={styles.panel}>
          {tab === 'overview' ? (
            <View style={styles.stack}>
              {data.venue ? (
                <View style={styles.section}>
                  <SectionHeader title="Home venue" />
                  <Card style={styles.venueCard} testID="club-venue">
                    <AppText variant="bodyStrong">{data.venue.name}</AppText>
                    {data.venue.address ? <AppText variant="callout" tone="secondary">{data.venue.address}</AppText> : null}
                    {data.venue.capacity ? <AppText variant="callout" tone="secondary">Capacity {data.venue.capacity}</AppText> : null}
                  </Card>
                </View>
              ) : null}
              <View style={styles.section}>
                <SectionHeader title="Fixtures" />
                {data.fixtures.length > 0 ? (
                  data.fixtures.map((m) => <MatchCard key={m.id} match={m} onPress={onOpenMatch} testID={`club-fixture-${m.id}`} />)
                ) : (
                  <AppText variant="callout" tone="secondary">No fixtures scheduled for this club.</AppText>
                )}
              </View>
            </View>
          ) : null}

          {tab === 'roster' ? (
            groups.length > 0 ? (
              <View style={styles.stack} testID="club-roster">
                {groups.map(([position, players]) => (
                  <View key={position} style={styles.section}>
                    <AppText variant="headline" accessibilityRole="header">{position}s</AppText>
                    {players.map((p) => (
                      <View key={p.id} style={styles.player} accessible accessibilityLabel={`${p.name}, ${p.position}${p.number ? `, number ${p.number}` : ''}${p.roleChip ? `, ${p.roleChip}` : ''}`}>
                        <AppText variant="callout" tone="secondary" style={styles.number}>{p.number ?? ''}</AppText>
                        <AppText variant="bodyStrong" style={styles.playerName} numberOfLines={1}>{p.name}</AppText>
                        {p.roleChip ? (
                          <View style={styles.chip}>
                            <AppText variant="caption" tone="secondary" style={styles.chipText}>{p.roleChip}</AppText>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState icon="person.2" title="No players listed" message="This club hasn't published a roster yet." testID="roster-empty" />
            )
          ) : null}

          {tab === 'staff' ? (
            data.staff.length > 0 ? (
              <View testID="club-staff">
                {data.staff.map((s) => (
                  <View key={s.id} style={styles.player} accessible accessibilityLabel={`${s.name}, ${s.title}`}>
                    <Icon name="person.crop.circle" size={28} color={colors.textSecondary} />
                    <View style={styles.playerName}>
                      <AppText variant="bodyStrong">{s.name}</AppText>
                      <AppText variant="caption" tone="secondary">{s.title}</AppText>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState icon="person.crop.circle" title="No staff listed" testID="staff-empty" />
            )
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  stack: { gap: spacing.md },
  body: { paddingHorizontal: spacing.gutter, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.xxl, paddingHorizontal: spacing.gutter, borderTopLeftRadius: radii.hero, borderTopRightRadius: radii.hero, overflow: 'hidden' },
  name: { fontSize: 28, lineHeight: 34 },
  venuePill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, paddingHorizontal: spacing.md, minHeight: 32, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.1)', maxWidth: '100%' },
  venueText: { flexShrink: 1 },
  panel: { minHeight: 120 },
  section: { gap: spacing.sm },
  venueCard: { gap: 2, backgroundColor: colors.bgRaised },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: spacing.minTouchTarget, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.strokeHairline },
  number: { width: 28, fontVariant: ['tabular-nums'], textAlign: 'right' },
  playerName: { flex: 1 },
  chip: { borderWidth: 1, borderColor: colors.strokeHairline, borderRadius: radii.pill, paddingHorizontal: spacing.sm },
  chipText: { fontWeight: '600' },
});
