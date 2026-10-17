import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from './PressableScale';
import { colors, radii, spacing } from '../theme';
import { clubColor } from '../theme/clubColor';
import type { MatchSummary } from '../types/league';
import { formatDayLabel, formatTime } from '../utils/dateFormat';
import { AppText } from './AppText';
import { CompetitionLabel } from './CompetitionLabel';
import { matchA11yLabel } from './MatchCard';
import { MatchStatusBadge } from './MatchStatusBadge';
import { TeamIdentity } from './TeamIdentity';

export const FEATURED_CARD_HEIGHT = 196;

// Large hero card. Diagonal home→away club-color wash (DESIGN_SYSTEM §1.3 recipe) with a dark
// scrim under all text for contrast. Center column shows the score, or kickoff time pre-match.
export function FeaturedMatchCard({ match, width, onPress, testID }: { match: MatchSummary; width: number; onPress: (id: string) => void; testID?: string }) {
  const home = clubColor(match.home.team.id, match.home.team.color);
  const away = clubColor(match.away.team.id, match.away.team.color);
  const hasScore = match.home.scoreDisplay != null && match.away.scoreDisplay != null;

  return (
    <PressableScale
      testID={testID}
      onPress={() => onPress(match.id)}
      accessibilityLabel={matchA11yLabel(match)}
      accessibilityHint="Opens match details"
      style={[styles.card, { width }]}
    >
      <LinearGradient colors={[`${home}E6`, '#353A36', `${away}E6`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFill} />

      <View style={styles.top}>
        <CompetitionLabel name={match.competitionName} sport={match.sportLabel} />
        <MatchStatusBadge status={match.status} statusDetail={match.statusDetail} startsAt={match.startsAt} />
      </View>

      <View style={styles.middle}>
        <TeamIdentity team={match.home.team} layout="stacked" size={48} />
        <View style={styles.center}>
          {hasScore ? (
            <View style={styles.scoreRow}>
              <AppText variant="displayScore" style={styles.score} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.1}>
                {match.home.scoreDisplay}
              </AppText>
              <AppText variant="title" tone="secondary" style={styles.dash}>–</AppText>
              <AppText variant="displayScore" style={styles.score} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.1}>
                {match.away.scoreDisplay}
              </AppText>
            </View>
          ) : (
            <>
              <AppText variant="title" align="center">{formatTime(match.startsAt)}</AppText>
              <AppText variant="caption" tone="secondary" align="center">{formatDayLabel(match.startsAt)}</AppText>
            </>
          )}
        </View>
        <TeamIdentity team={match.away.team} layout="stacked" size={48} />
      </View>

      {match.venue ? (
        <AppText variant="caption" tone="secondary" align="center" numberOfLines={1}>{match.venue}</AppText>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    height: FEATURED_CARD_HEIGHT,
    borderRadius: radii.hero - 8,
    overflow: 'hidden',
    padding: spacing.lg,
    justifyContent: 'space-between',
    backgroundColor: colors.bgRaised,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  middle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  center: { flex: 1.1, alignItems: 'center', justifyContent: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  score: { fontVariant: ['tabular-nums'], flexShrink: 1, fontSize: 36, lineHeight: 42 },
  dash: { opacity: 0.8 },
});
