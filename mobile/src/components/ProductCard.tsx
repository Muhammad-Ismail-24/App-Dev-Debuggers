import { StyleSheet, View } from 'react-native';
import { formatPkr } from '../store/money';
import { colors, radii, spacing } from '../theme';
import type { Product } from '../types/store';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { ProductImage } from './ProductImage';
import { SkeletonBlock } from './LoadingState';
import { StockBadge, stockLabel } from './StockBadge';

export const totalStock = (p: Product) => p.variants.reduce((s, v) => s + Math.max(0, v.stock), 0);

// Grid tile: square image, name (2 lines max), price, stock indicator.
export function ProductCard({ product, onPress, testID }: { product: Product; onPress: (id: string) => void; testID?: string }) {
  const stock = totalStock(product);
  return (
    <PressableScale
      testID={testID}
      onPress={() => onPress(product.id)}
      accessibilityLabel={`${product.name}, ${formatPkr(product.priceMinor)}, ${stockLabel(stock)}`}
      accessibilityHint="Opens product details"
      style={styles.card}
    >
      <View style={[styles.image, stock === 0 && styles.dim]}>
        <ProductImage image={product.images[0] ?? { tint: colors.bgSelected }} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={2} maxFontSizeMultiplier={1.2}>{product.name}</AppText>
        <AppText variant="callout" maxFontSizeMultiplier={1.2}>{formatPkr(product.priceMinor)}</AppText>
        <StockBadge stock={stock} />
      </View>
    </PressableScale>
  );
}

export function ProductCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonBlock height={150} radius={radii.card} />
      <View style={styles.text}>
        <SkeletonBlock width="80%" height={14} />
        <SkeletonBlock width="40%" height={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '48.2%', gap: spacing.sm },
  image: { aspectRatio: 1, borderRadius: radii.card, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline, backgroundColor: colors.bgRaised },
  dim: { opacity: 0.5 },
  text: { gap: 3 },
});
