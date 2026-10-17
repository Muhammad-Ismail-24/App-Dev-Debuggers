import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import type { MatchSummary } from '../types/league';
import { AppText } from './AppText';
import { Crest } from './TeamIdentity';
import { PressableScale } from './PressableScale';
import { matchA11yLabel } from './MatchCard';

// Top rail of other matches (reference Match Detail ticker). The current match is the lighter chip,
// and also says "Viewing" to assistive tech, so selection is not color-only.
export function ScoreTicker({ matches, currentId, onSelect }: { matches: MatchSummary[]; currentId: string; onSelect: (id: string) => void }) {
  if (matches.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.rail} testID="score-ticker">
      {matches.map((m) => {
        const current = m.id === currentId;
        const status = m.status === 'live' ? 'LIVE' : m.status === 'final' ? 'FT' : 'Soon';
        return (
          <PressableScale
            key={m.id}
            testID={`ticker-${m.id}`}
            onPress={() => !current && onSelect(m.id)}
            scaleTo={0.96}
            accessibilityLabel={`${matchA11yLabel(m)}${current ? ', currently viewing' : ''}`}
            accessibilityState={{ selected: current }}
            style={[styles.chip, current && styles.current]}
          >
            <AppText variant="caption" tone={m.status === 'live' ? 'danger' : 'secondary'} style={styles.status}>{status}</AppText>
            {[m.home, m.away].map((side) => (
              <View key={side.team.id} style={styles.team}>
                <Crest team={side.team} size={16} />
                <AppText variant="caption" style={styles.abbr} numberOfLines={1}>{side.team.shortName}</AppText>
                {side.scoreDisplay != null ? <AppText variant="caption" style={styles.score} numberOfLines={1}>{side.scoreDisplay}</AppText> : null}
              </View>
            ))}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { flexGrow: 0 },
  row: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
  chip: { width: 118, minHeight: spacing.minTouchTarget + 14, borderRadius: radii.chip, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline, padding: spacing.sm, gap: 2 },
  current: { backgroundColor: colors.bgSelected },
  status: { fontWeight: '700' },
  team: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  abbr: { flex: 1, fontWeight: '700' },
  score: { fontVariant: ['tabular-nums'], fontWeight: '700' },
});
