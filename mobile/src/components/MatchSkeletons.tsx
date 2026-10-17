import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import { COMPACT_CARD_WIDTH } from './CompactMatchCard';
import { FEATURED_CARD_HEIGHT } from './FeaturedMatchCard';
import { SkeletonBlock } from './LoadingState';

export function FeaturedMatchSkeleton({ width }: { width: number }) {
  return (
    <View style={[styles.featured, { width }]}>
      <View style={styles.row}>
        <SkeletonBlock width="45%" height={12} />
        <SkeletonBlock width={64} height={20} radius={10} />
      </View>
      <View style={styles.row}>
        <SkeletonBlock width={48} height={48} radius={24} />
        <SkeletonBlock width={72} height={32} />
        <SkeletonBlock width={48} height={48} radius={24} />
      </View>
      <SkeletonBlock width="40%" height={12} />
    </View>
  );
}

export function CompactMatchSkeleton() {
  return (
    <View style={styles.compact}>
      <SkeletonBlock width="70%" height={12} />
      <SkeletonBlock width="100%" height={18} />
      <SkeletonBlock width="100%" height={18} />
    </View>
  );
}

const styles = StyleSheet.create({
  featured: { height: FEATURED_CARD_HEIGHT, borderRadius: radii.hero - 8, padding: spacing.lg, justifyContent: 'space-between', backgroundColor: colors.bgRaised },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compact: { width: COMPACT_CARD_WIDTH, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline, padding: spacing.md, gap: spacing.md },
});
