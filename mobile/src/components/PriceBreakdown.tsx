import { StyleSheet, View } from 'react-native';
import { formatPkr } from '../store/money';
import { colors, spacing } from '../theme';
import { AppText } from './AppText';

interface Props {
  subtotalMinor: number;
  discountMinor?: number;
  totalMinor?: number; // final total from the server; omit to show the pre-discount estimate
  // True when a discount code is entered but its amount is only known after the order is placed.
  discountPending?: boolean;
}

export function PriceBreakdown({ subtotalMinor, discountMinor = 0, totalMinor, discountPending = false }: Props) {
  const total = totalMinor ?? subtotalMinor - discountMinor;
  return (
    <View style={styles.wrap} testID="price-breakdown">
      <Row label="Subtotal" value={formatPkr(subtotalMinor)} />
      {discountMinor > 0 ? <Row label="Discount" value={`-${formatPkr(discountMinor)}`} /> : null}
      {discountPending ? <AppText variant="caption" tone="secondary">Discount code will be applied when you place the order.</AppText> : null}
      <View style={styles.rule} />
      <Row label={discountPending ? 'Total before discount' : 'Total'} value={formatPkr(total)} strong />
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant={strong ? 'headline' : 'callout'} tone={strong ? 'primary' : 'secondary'}>{label}</AppText>
      <AppText variant={strong ? 'headline' : 'callout'} style={styles.num}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md },
  num: { fontVariant: ['tabular-nums'] },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.strokeHairline },
});
