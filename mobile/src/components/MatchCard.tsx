import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import type { MatchSummary } from '../types/league';
import { formatDayLabel, formatTime } from '../utils/dateFormat';
import { AppText } from './AppText';
import { Card, Divider } from './Card';
import { CompetitionLabel } from './CompetitionLabel';
import { MatchStatusBadge } from './MatchStatusBadge';
import { TeamIdentity } from './TeamIdentity';

export function matchA11yLabel(m: MatchSummary): string {
  const score = m.home.scoreDisplay != null && m.away.scoreDisplay != null ? `, ${m.home.scoreDisplay} to ${m.away.scoreDisplay}` : '';
  const when = m.status === 'scheduled' ? `, ${formatDayLabel(m.startsAt)} at ${formatTime(m.startsAt)}` : m.status === 'live' ? ', live' : '';
  return `${m.home.team.name} versus ${m.away.team.name}${score}${when}, ${m.competitionName}`;
}

interface Props {
  match: MatchSummary;
  onPress: (matchId: string) => void;
  testID?: string;
}

// Vertical-list card (Upcoming fixtures): status/time header, two team rows with scores.
export function MatchCard({ match, onPress, testID }: Props) {
  return (
    <Card
      testID={testID}
      onPress={() => onPress(match.id)}
      accessibilityLabel={matchA11yLabel(match)}
      accessibilityHint="Opens match details"
      style={styles.card}
    >
      <View style={styles.header}>
        <CompetitionLabel name={match.competitionName} sport={match.sportLabel} />
        <View style={styles.when}>
          {match.status === 'scheduled' ? (
            <AppText variant="caption" tone="secondary">{formatDayLabel(match.startsAt)}</AppText>
          ) : null}
          <MatchStatusBadge status={match.status} statusDetail={match.statusDetail} startsAt={match.startsAt} />
        </View>
      </View>
      <Divider style={styles.divider} />
      {[match.home, match.away].map((side) => (
        <View key={side.team.id} style={styles.teamRow}>
          <TeamIdentity team={side.team} size={28} />
          {side.scoreDisplay != null ? (
            <AppText variant="headline" style={styles.score} maxFontSizeMultiplier={1.2}>{side.scoreDisplay}</AppText>
          ) : null}
        </View>
      ))}
      {match.venue ? (
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.venue}>{match.venue}</AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgRaised },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  when: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divider: { marginVertical: spacing.sm },
  teamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, gap: spacing.md },
  score: { fontVariant: ['tabular-nums'] },
  venue: { marginTop: spacing.xs },
});
