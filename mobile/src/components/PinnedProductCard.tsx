import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import type { PinnedProduct } from '../types/league';
import { AppText } from './AppText';
import { PrimaryButton } from './Button';
import { Icon } from './Icon';

// Merchandise pinned to a match. The white "Buy" pill is the screen's one primary action.
export function PinnedProductCard({ product, onBuy }: { product: PinnedProduct; onBuy: () => void }) {
  return (
    <View style={styles.card} testID="pinned-product">
      <View style={styles.top}>
        <View style={styles.thumb}>
          <Icon name="tshirt" size={26} color={colors.textSecondary} />
        </View>
        <View style={styles.text}>
          <AppText variant="caption" tone="secondary">Pinned for this match</AppText>
          <AppText variant="bodyStrong" numberOfLines={2}>{product.name}</AppText>
          <AppText variant="callout">{product.priceDisplay}</AppText>
          {product.stockNote ? <AppText variant="caption" tone="secondary">{product.stockNote}</AppText> : null}
        </View>
      </View>
      <PrimaryButton testID="pinned-buy-button" label="View in store" icon="bag" onPress={onBuy} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline, backgroundColor: colors.bgRaised, padding: spacing.md, gap: spacing.md },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: radii.chip, backgroundColor: colors.bgSelected, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
