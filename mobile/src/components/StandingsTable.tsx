import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors, radii, spacing } from '../theme';
import type { StandingsTableData } from '../types/league';
import { AppText } from './AppText';
import { Card, Divider } from './Card';
import { PressableScale } from './PressableScale';
import { QUAL } from './StandingsPreview';
import { Crest } from './TeamIdentity';

// Full points table. Qualification = left bar + text badge (+ legend below), never color alone.
// Narrow phones (<375pt, e.g. SE) drop the record column; rank, team, P, diff and Pts always stay.
export function StandingsTable({ data, onOpenClub }: { data: StandingsTableData; onOpenClub: (clubId: string) => void }) {
  const { width } = useWindowDimensions();
  const showRecord = width >= 375 && data.rows.some((r) => r.record);
  const showDiff = data.rows.some((r) => r.diffDisplay);
  const legend = Array.from(new Set(data.rows.map((r) => r.qualification).filter(Boolean))) as (keyof typeof QUAL)[];

  return (
    <View style={styles.gap}>
      <Card padded={false} style={styles.card} testID="standings-table">
        <View style={[styles.row, styles.head]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AppText variant="caption" tone="secondary" style={styles.rank}>#</AppText>
          <AppText variant="caption" tone="secondary" style={styles.team}>Team</AppText>
          <AppText variant="caption" tone="secondary" style={styles.stat}>P</AppText>
          {showRecord ? <AppText variant="caption" tone="secondary" style={styles.record}>{data.recordLabel ?? 'Rec'}</AppText> : null}
          {showDiff ? <AppText variant="caption" tone="secondary" style={styles.diff}>{data.diffLabel ?? '+/-'}</AppText> : null}
          <AppText variant="caption" tone="secondary" style={styles.stat}>Pts</AppText>
        </View>
        <Divider />
        {data.rows.map((r, i) => {
          const q = r.qualification ? QUAL[r.qualification] : undefined;
          return (
            <View key={r.team.id}>
              <PressableScale
                testID={`standing-row-${r.team.id}`}
                onPress={() => onOpenClub(r.team.id)}
                scaleTo={0.99}
                style={styles.row}
                accessibilityLabel={`${r.rank}. ${r.team.name}, ${r.played} played${r.record ? `, record ${r.record}` : ''}, ${r.points} points${q ? `, ${q.long}` : ''}`}
                accessibilityHint="Opens club profile"
              >
                <View style={[styles.bar, { backgroundColor: q?.color ?? 'transparent' }]} />
                <AppText variant="callout" tone="secondary" style={styles.rank} maxFontSizeMultiplier={1.2}>{r.rank}</AppText>
                <View style={styles.team}>
                  <Crest team={r.team} size={22} />
                  <AppText variant="bodyStrong" numberOfLines={1} style={styles.name} maxFontSizeMultiplier={1.2}>{width < 375 ? r.team.shortName : r.team.name}</AppText>
                  {q ? (
                    <View style={[styles.badge, { borderColor: q.color }]}>
                      <AppText variant="caption" style={{ color: q.color, fontWeight: '700' }} maxFontSizeMultiplier={1}>{q.short}</AppText>
                    </View>
                  ) : null}
                </View>
                <AppText variant="callout" tone="secondary" style={styles.stat} maxFontSizeMultiplier={1.2}>{r.played}</AppText>
                {showRecord ? <AppText variant="callout" tone="secondary" style={styles.record} maxFontSizeMultiplier={1.2}>{r.record ?? ''}</AppText> : null}
                {showDiff ? <AppText variant="callout" tone="secondary" style={styles.diff} maxFontSizeMultiplier={1.2}>{r.diffDisplay ?? ''}</AppText> : null}
                <AppText variant="bodyStrong" style={styles.stat} maxFontSizeMultiplier={1.2}>{r.points}</AppText>
              </PressableScale>
              {i < data.rows.length - 1 ? <Divider style={styles.inset} /> : null}
            </View>
          );
        })}
      </Card>
      {legend.length > 0 ? (
        <View style={styles.legend}>
          {legend.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.badge, { borderColor: QUAL[k].color }]}>
                <AppText variant="caption" style={{ color: QUAL[k].color, fontWeight: '700' }} maxFontSizeMultiplier={1}>{QUAL[k].short}</AppText>
              </View>
              <AppText variant="caption" tone="secondary">{QUAL[k].long}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  card: { backgroundColor: colors.bgRaised, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: spacing.minTouchTarget + 4, paddingRight: spacing.md },
  head: { minHeight: 36 },
  bar: { width: 3, alignSelf: 'stretch', marginRight: spacing.sm, borderRadius: radii.pill },
  rank: { width: 24, textAlign: 'center', fontVariant: ['tabular-nums'] },
  team: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  stat: { width: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },
  record: { width: 58, textAlign: 'right', fontVariant: ['tabular-nums'] },
  diff: { width: 50, textAlign: 'right', fontVariant: ['tabular-nums'] },
  badge: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 6, minWidth: 26, alignItems: 'center' },
  inset: { marginLeft: spacing.xxxl + spacing.sm },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
});
