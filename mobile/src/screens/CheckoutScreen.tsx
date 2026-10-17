import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Button';
import { Card } from '../components/Card';
import { CartLineRow } from '../components/CartLineRow';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PriceBreakdown } from '../components/PriceBreakdown';
import { SectionHeader } from '../components/SectionHeader';
import { StackHeader } from '../components/StackHeader';
import { TextField } from '../components/TextField';
import { defaultStoreRepository } from '../data';
import { OrderError, orderErrorMessage, type StoreRepository } from '../data/storeRepository';
import { useCart } from '../hooks/useCart';
import { useSession } from '../hooks/useSession';
import type { RootStackScreenProps } from '../navigation/types';
import { cartFingerprint } from '../store/cartReducer';
import { normalizeDiscountCode, validateOrderLines } from '../store/checkoutValidation';
import { DEFAULT_MOCK_PAYMENT_TOKEN } from '../store/mockPayment';
import { getDevPaymentToken } from '../dev/paymentTokenChoice';
import { formatPkr } from '../store/money';
import { resolveOrderId, type OrderIdentity } from '../store/orderId';
import { colors, radii, spacing } from '../theme';

// Dev-only outcome picker is required lazily so release bundles don't carry it.
const DevPaymentOutcome = __DEV__ ? (require('../dev/DevPaymentOutcome') as typeof import('../dev/DevPaymentOutcome')).DevPaymentOutcome : null;

type Phase = 'idle' | 'submitting' | 'success';

export function CheckoutScreen({ navigation, repository = defaultStoreRepository }: RootStackScreenProps<'Checkout'> & { repository?: StoreRepository }) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { session } = useSession();
  const { lines, subtotalMinor, dispatch } = useCart();

  const [discountCode, setDiscountCode] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | undefined>();

  const submitting = useRef(false); // synchronous guard: a double tap can't start two requests
  const orderIdRef = useRef<OrderIdentity | null>(null);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const fail = (message: string) => {
    setPhase('idle');
    setError(message);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (!reduce) shake.value = withSequence(withTiming(-8, { duration: 60 }), withTiming(8, { duration: 60 }), withTiming(-6, { duration: 60 }), withTiming(0, { duration: 60 }));
  };

  const submit = async () => {
    if (submitting.current || phase !== 'idle' || !session) return;
    const problem = validateOrderLines(lines);
    if (problem) return fail(problem);

    // Documented body only. In debug builds the picker may choose another documented mock token;
    // otherwise the spec's success token is used. No card data exists anywhere in this flow.
    const paymentToken = __DEV__ ? getDevPaymentToken() : DEFAULT_MOCK_PAYMENT_TOKEN;
    const code = normalizeDiscountCode(discountCode);
    const draftBase = { customerId: session.userId, items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), discountCode: code, paymentToken };

    // Identical request → identical order_id (a retry replays). Any change to the body → a new id,
    // because the server answers 409 DUPLICATE_ORDER_ID for the same id with a different body.
    orderIdRef.current = resolveOrderId(orderIdRef.current, draftBase);

    const labels = Object.fromEntries(lines.map((l) => [l.variantId, { name: l.productName, variantLabel: l.variantLabel }]));

    submitting.current = true;
    setPhase('submitting');
    setError(undefined);
    try {
      const receipt = await repository.placeOrder(session, { orderId: orderIdRef.current.id, ...draftBase }, labels);
      setPhase('success');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await new Promise((resolve) => setTimeout(resolve, reduce ? 250 : 600));
      dispatch({ type: 'clear' });
      navigation.replace('Receipt', { receipt });
    } catch (e) {
      const sold = e instanceof OrderError && e.code === 'OUT_OF_STOCK' ? lines.find((l) => l.variantId === e.variantId) : undefined;
      fail(sold ? `Someone just bought the last ${sold.productName} (${sold.variantLabel}). Remove it or pick another size in your cart, then try again.` : orderErrorMessage(e));
    } finally {
      submitting.current = false;
    }
  };

  if (lines.length === 0 && phase !== 'success') {
    return (
      <View style={styles.root} testID="checkout-screen">
        <StackHeader title="Checkout" onBack={() => navigation.goBack()} />
        <EmptyState icon="bag" title="Nothing to check out" message="Your cart is empty." actionLabel="Back to store" onAction={() => navigation.navigate('Tabs', { screen: 'Store' })} />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="checkout-screen">
      <StackHeader title="Checkout" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
          <View style={styles.section}>
            <SectionHeader title="Order summary" />
            <Card padded={false} style={styles.summary}>
              <View style={styles.summaryInner}>
                {lines.map((l) => <CartLineRow key={l.variantId} line={l} readOnly />)}
              </View>
            </Card>
          </View>

          <Animated.View style={[styles.section, shakeStyle]}>
            <SectionHeader title="Discount" />
            <TextField testID="checkout-discount-input" label="Discount code (optional)" value={discountCode} onChangeText={(v) => { setDiscountCode(v); if (error) setError(undefined); }} autoCapitalize="characters" autoCorrect={false} returnKeyType="done" editable={phase === 'idle'} />
            <AppText variant="caption" tone="secondary">Ordering as {session?.displayName}. The server prices the order and applies any valid code.</AppText>
          </Animated.View>

          <View style={styles.section}>
            <SectionHeader title="Payment" />
            <View style={styles.payment}>
              <Icon name="creditcard" size={20} color={colors.textSecondary} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">Mock payment</AppText>
                <AppText variant="caption" tone="secondary">Simulated gateway. No real charge and no card details are collected.</AppText>
              </View>
            </View>
            {DevPaymentOutcome ? <DevPaymentOutcome /> : null}
          </View>

          <PriceBreakdown subtotalMinor={subtotalMinor} discountPending={normalizeDiscountCode(discountCode) !== null} />

          {error ? (
            <View style={styles.error} accessibilityLiveRegion="assertive" testID="checkout-error">
              <Icon name="exclamationmark.triangle.fill" size={18} color={colors.danger} />
              <AppText variant="callout" style={styles.flex}>{error}</AppText>
            </View>
          ) : null}

          <PrimaryButton
            testID="checkout-submit-button"
            label={phase === 'success' ? 'Order placed' : `Pay ${formatPkr(subtotalMinor)}`}
            icon={phase === 'success' ? 'checkmark.circle.fill' : 'lock'}
            loading={phase === 'submitting'}
            onPress={submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.sectionGap },
  section: { gap: spacing.md },
  summary: { backgroundColor: colors.bgRaised },
  summaryInner: { paddingHorizontal: spacing.md },
  payment: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.md, borderRadius: radii.card, backgroundColor: colors.bgRaised, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline },
  error: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radii.card, borderWidth: 1, borderColor: colors.danger, backgroundColor: 'rgba(255,107,107,0.08)' },
});
