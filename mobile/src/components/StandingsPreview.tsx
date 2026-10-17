import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import type { Qualification, StandingsPreviewData } from '../types/league';
import { AppText } from './AppText';
import { Card, Divider } from './Card';
import { Crest } from './TeamIdentity';
import { PressableScale } from './PressableScale';
import { SkeletonBlock } from './LoadingState';

// Qualification is a text badge, not just a color (rubric: meaning not by color alone).
export const QUAL: Record<Qualification, { short: string; long: string; color: string }> = {
  qualified: { short: 'Q', long: 'Qualified', color: colors.success },
  playoff: { short: 'PO', long: 'Playoff', color: colors.accent },
  out: { short: 'Out', long: 'Eliminated', color: colors.danger },
};

export function StandingsPreview({ data, onOpen }: { data: StandingsPreviewData; onOpen: () => void }) {
  return (
    <Card padded={false} style={styles.card} accessibilityLabel={`${data.competitionName} standings`}>
      <View style={[styles.row, styles.headRow]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <AppText variant="caption" tone="secondary" style={styles.rank}>#</AppText>
        <AppText variant="caption" tone="secondary" style={styles.team}>Team</AppText>
        <AppText variant="caption" tone="secondary" style={styles.stat}>P</AppText>
        <AppText variant="caption" tone="secondary" style={styles.stat}>Pts</AppText>
      </View>
      <Divider />
      {data.rows.map((r, i) => {
        const q = r.qualification ? QUAL[r.qualification] : undefined;
        return (
          <View key={r.team.id}>
            <PressableScale
              onPress={onOpen}
              scaleTo={0.99}
              style={styles.row}
              accessibilityLabel={`${r.rank}. ${r.team.name}, ${r.played} played, ${r.points} points${q ? `, ${q.long}` : ''}`}
              accessibilityHint="Opens full standings"
            >
              <View style={[styles.bar, { backgroundColor: q?.color ?? 'transparent' }]} />
              <AppText variant="callout" tone="secondary" style={styles.rank} maxFontSizeMultiplier={1.2}>{r.rank}</AppText>
              <View style={styles.team}>
                <Crest team={r.team} size={22} />
                <AppText variant="bodyStrong" numberOfLines={1} style={styles.name} maxFontSizeMultiplier={1.2}>{r.team.name}</AppText>
                {q ? (
                  <View style={[styles.badge, { borderColor: q.color }]}>
                    <AppText variant="caption" style={{ color: q.color, fontWeight: '700' }} maxFontSizeMultiplier={1}>{q.short}</AppText>
                  </View>
                ) : null}
              </View>
              <AppText variant="callout" tone="secondary" style={styles.stat} maxFontSizeMultiplier={1.2}>{r.played}</AppText>
              <AppText variant="bodyStrong" style={styles.stat} maxFontSizeMultiplier={1.2}>{r.points}</AppText>
            </PressableScale>
            {i < data.rows.length - 1 ? <Divider style={styles.inset} /> : null}
          </View>
        );
      })}
    </Card>
  );
}

export function StandingsPreviewSkeleton() {
  return (
    <Card style={styles.skeleton}>
      {Array.from({ length: 4 }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <SkeletonBlock width={18} height={14} />
          <SkeletonBlock width={22} height={22} radius={11} />
          <SkeletonBlock width="50%" height={14} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgRaised, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingRight: spacing.md },
  headRow: { minHeight: 36 },
  bar: { width: 3, alignSelf: 'stretch', marginRight: spacing.sm, borderRadius: radii.pill },
  rank: { width: 24, textAlign: 'center', fontVariant: ['tabular-nums'] },
  team: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  stat: { width: 36, textAlign: 'right', fontVariant: ['tabular-nums'] },
  badge: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 6, minWidth: 26, alignItems: 'center' },
  inset: { marginLeft: spacing.xxxl + spacing.sm },
  skeleton: { gap: spacing.md, backgroundColor: colors.bgRaised },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
