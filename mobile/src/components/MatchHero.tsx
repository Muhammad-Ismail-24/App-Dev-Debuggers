import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOutUp, useReducedMotion } from 'react-native-reanimated';
import { colors, radii, spacing } from '../theme';
import { clubColor } from '../theme/clubColor';
import type { MatchSummary } from '../types/league';
import { formatDayLabel, formatTime } from '../utils/dateFormat';
import { AppText } from './AppText';
import { CompetitionLabel } from './CompetitionLabel';
import { MatchStatusBadge } from './MatchStatusBadge';
import { TeamIdentity } from './TeamIdentity';

// A changed score slides the old value out and the new one in (MOTION S2, inferred).
// Keyed on the text so only the side that changed animates; Reduce Motion → plain crossfade.
function ScoreValue({ value }: { value: string }) {
  const reduce = useReducedMotion();
  return (
    <View style={styles.scoreBox}>
      <Animated.View key={value} entering={reduce ? FadeIn.duration(150) : FadeInDown.duration(300)} exiting={reduce ? undefined : FadeOutUp.duration(200)}>
        <AppText variant="displayScore" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.1} style={styles.score}>
          {value}
        </AppText>
      </Animated.View>
    </View>
  );
}

// Club-color diagonal hero (reference Match Detail): home color → neutral → away color, fading
// into the page background, with a scrim under all text. Layout flexes down to 320pt widths.
export function MatchHero({ match }: { match: MatchSummary }) {
  const reduce = useReducedMotion();
  const home = clubColor(match.home.team.id, match.home.team.color);
  const away = clubColor(match.away.team.id, match.away.team.color);
  const hasScore = match.home.scoreDisplay != null && match.away.scoreDisplay != null;

  return (
    <View style={styles.hero} testID="match-hero">
      {/* S1: color layer fades in on mount (inferred). */}
      <Animated.View entering={reduce ? FadeIn.duration(150) : FadeIn.duration(450)} style={StyleSheet.absoluteFill}>
        <LinearGradient colors={[`${home}E6`, '#353A36', `${away}E6`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(0,0,0,0.2)', 'rgba(25,27,31,0)', colors.bgBase]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View style={styles.meta}>
        <CompetitionLabel name={match.competitionName} sport={match.sportLabel} numberOfLines={2} />
        <AppText variant="caption" tone="secondary">
          {formatDayLabel(match.startsAt)} · {formatTime(match.startsAt)}
        </AppText>
      </View>

      <View style={styles.row}>
        <TeamIdentity team={match.home.team} layout="stacked" size={56} />
        <View style={styles.center}>
          {hasScore ? (
            <View style={styles.scoreRow}>
              <ScoreValue value={match.home.scoreDisplay!} />
              <AppText variant="title" tone="secondary">–</AppText>
              <ScoreValue value={match.away.scoreDisplay!} />
            </View>
          ) : (
            <AppText variant="title" align="center">vs</AppText>
          )}
          <MatchStatusBadge status={match.status} statusDetail={match.statusDetail} startsAt={match.startsAt} />
        </View>
        <TeamIdentity team={match.away.team} layout="stacked" size={56} />
      </View>

      {match.status === 'final' && match.statusDetail ? (
        <AppText variant="callout" align="center">{match.statusDetail}</AppText>
      ) : null}
      {match.venue ? <AppText variant="caption" tone="secondary" align="center">{match.venue}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderTopLeftRadius: radii.hero, borderTopRightRadius: radii.hero, overflow: 'hidden', padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, backgroundColor: colors.bgRaised },
  meta: { alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  center: { flex: 1.3, alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  scoreBox: { minWidth: 36, maxWidth: 88, overflow: 'hidden', alignItems: 'center' },
  score: { fontSize: 40, lineHeight: 46 },
});
