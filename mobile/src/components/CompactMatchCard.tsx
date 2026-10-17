import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import type { MatchSummary } from '../types/league';
import { formatTime } from '../utils/dateFormat';
import { AppText } from './AppText';
import { Card, Divider } from './Card';
import { matchA11yLabel } from './MatchCard';
import { TeamIdentity } from './TeamIdentity';

export const COMPACT_CARD_WIDTH = 150;

// The reference's ~120×100 rail card: competition + time, hairline, two crest/abbreviation rows.
// Widened to 150 so ≥13pt text and 48pt-high touch area both fit.
export function CompactMatchCard({ match, onPress, testID }: { match: MatchSummary; onPress: (id: string) => void; testID?: string }) {
  const trailing = (side: MatchSummary['home']) => side.scoreDisplay;
  return (
    <Card
      testID={testID}
      onPress={() => onPress(match.id)}
      accessibilityLabel={matchA11yLabel(match)}
      accessibilityHint="Opens match details"
      style={styles.card}
    >
      <View style={styles.header}>
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.comp}>{match.competitionName}</AppText>
        <AppText variant="caption" tone={match.status === 'live' ? 'danger' : 'primary'} style={styles.time}>
          {match.status === 'live' ? 'LIVE' : match.status === 'final' ? 'FT' : formatTime(match.startsAt)}
        </AppText>
      </View>
      <Divider style={styles.divider} />
      {[match.home, match.away].map((side) => (
        <View key={side.team.id} style={styles.row}>
          <TeamIdentity team={side.team} size={20} label="short" />
          {trailing(side) != null ? (
            <AppText variant="bodyStrong" style={styles.score} numberOfLines={1} adjustsFontSizeToFit>{trailing(side)}</AppText>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: COMPACT_CARD_WIDTH, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  comp: { flexShrink: 1 },
  time: { fontWeight: '700' },
  divider: { marginVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28, gap: spacing.xs },
  score: { fontVariant: ['tabular-nums'], maxWidth: 64 },
});
