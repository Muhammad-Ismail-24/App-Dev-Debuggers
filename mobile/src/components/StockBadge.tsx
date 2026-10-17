import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export function stockLabel(stock: number): string {
  return stock <= 0 ? 'Out of stock' : stock === 1 ? 'Only 1 left' : stock <= 3 ? `Only ${stock} left` : 'In stock';
}

// Text + icon, never color alone.
export function StockBadge({ stock }: { stock: number }) {
  const out = stock <= 0;
  const low = stock > 0 && stock <= 3;
  return (
    <View style={styles.row} accessible accessibilityLabel={stockLabel(stock)}>
      <Icon name={out ? 'xmark.circle.fill' : low ? 'exclamationmark.circle.fill' : 'checkmark.circle.fill'} size={13} color={out ? colors.danger : low ? colors.statusOffline : colors.success} />
      <AppText variant="caption" tone={out ? 'danger' : 'secondary'} maxFontSizeMultiplier={1.2}>{stockLabel(stock)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 1 } });
