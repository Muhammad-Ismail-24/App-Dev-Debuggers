import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, SlideOutLeft, useReducedMotion } from 'react-native-reanimated';
import { lineTotal } from '../store/cartReducer';
import { formatPkr } from '../store/money';
import { colors, radii, spacing } from '../theme';
import type { CartLine } from '../types/store';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { ProductImage } from './ProductImage';
import { QuantityStepper } from './QuantityStepper';

// One cart line. Removal animates the row out and the rest slide up (layout animation).
export function CartLineRow({ line, onQuantity, onRemove, readOnly = false }: { line: CartLine; onQuantity?: (n: number) => void; onRemove?: () => void; readOnly?: boolean }) {
  const reduce = useReducedMotion();
  const name = `${line.productName}, ${line.variantLabel}`;
  return (
    <Animated.View
      testID={`cart-line-${line.variantId}`}
      layout={reduce ? undefined : LinearTransition.duration(220)}
      exiting={reduce ? FadeOut.duration(120) : SlideOutLeft.duration(220)}
      style={styles.row}
    >
      <View style={styles.thumb}><ProductImage image={{ tint: line.tint }} iconSize={24} /></View>
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={2} maxFontSizeMultiplier={1.2}>{line.productName}</AppText>
        <AppText variant="caption" tone="secondary">Size {line.variantLabel} · {formatPkr(line.unitMinor)} each</AppText>
        {readOnly ? (
          <AppText variant="callout" tone="secondary">Qty {line.quantity}</AppText>
        ) : (
          <View style={styles.controls}>
            <QuantityStepper testID={`qty-${line.variantId}`} value={line.quantity} max={Math.max(line.maxQuantity, 1)} itemName={name} onChange={(n) => onQuantity?.(n)} />
            <PressableScale testID={`remove-${line.variantId}`} onPress={onRemove} haptic accessibilityLabel={`Remove ${name} from cart`} style={styles.remove}>
              <Icon name="trash" size={18} color={colors.danger} />
            </PressableScale>
          </View>
        )}
        {!readOnly && line.quantity >= line.maxQuantity ? <AppText variant="caption" tone="secondary">Maximum available quantity</AppText> : null}
      </View>
      <AppText variant="bodyStrong" style={styles.total} maxFontSizeMultiplier={1.2}>{formatPkr(lineTotal(line))}</AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.strokeHairline },
  thumb: { width: 72, height: 72, borderRadius: radii.chip, overflow: 'hidden' },
  body: { flex: 1, gap: 3 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  remove: { width: spacing.minTouchTarget, height: spacing.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  total: { fontVariant: ['tabular-nums'], textAlign: 'right', minWidth: 72 },
});
