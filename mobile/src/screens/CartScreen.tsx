import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { PrimaryButton, TextButton } from '../components/Button';
import { CartLineRow } from '../components/CartLineRow';
import { EmptyState } from '../components/EmptyState';
import { PriceBreakdown } from '../components/PriceBreakdown';
import { useCart } from '../hooks/useCart';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme';

// Presented as a native modal sheet (SCREEN_MAP: Cart is a sheet). Swipe down or "Close" dismisses.
export function CartScreen({ navigation }: RootStackScreenProps<'Cart'>) {
  const insets = useSafeAreaInsets();
  const { lines, count, subtotalMinor, dispatch } = useCart();

  return (
    <View style={styles.root} testID="cart-screen">
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">Cart{count > 0 ? ` (${count})` : ''}</AppText>
        <TextButton testID="cart-close-button" label="Close" tone="accent" onPress={() => navigation.goBack()} />
      </View>

      {lines.length === 0 ? (
        <EmptyState
          icon="bag"
          title="Your cart is empty"
          message="Add a jersey or a scarf and it will show up here."
          actionLabel="Browse the store"
          onAction={() => navigation.goBack()}
          testID="cart-empty"
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {lines.map((l) => (
              <CartLineRow
                key={l.variantId}
                line={l}
                onQuantity={(n) => dispatch({ type: 'setQuantity', variantId: l.variantId, quantity: n })}
                onRemove={() => dispatch({ type: 'remove', variantId: l.variantId })}
              />
            ))}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <PriceBreakdown subtotalMinor={subtotalMinor} />
            <PrimaryButton testID="cart-checkout-button" label="Checkout" icon="lock" onPress={() => navigation.navigate('Checkout')} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.gutter, paddingRight: spacing.sm, paddingTop: spacing.sm },
  list: { paddingHorizontal: spacing.gutter },
  footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.strokeHairline },
});
