import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Button';
import { Card, Divider } from '../components/Card';
import { Icon } from '../components/Icon';
import { PriceBreakdown } from '../components/PriceBreakdown';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import type { RootStackScreenProps } from '../navigation/types';
import { formatPkr, formatPkrExact } from '../store/money';
import { colors, radii, spacing, spring } from '../theme';

// Confirmation. A 'dev-simulated' receipt carries a prominent notice and a different status word,
// so it cannot be mistaken for a real order. Swipe-back is disabled; "Back to store" resets the stack.
export function ReceiptScreen({ navigation, route }: RootStackScreenProps<'Receipt'>) {
  const { receipt } = route.params;
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const simulated = receipt.source === 'dev-simulated';
  const pop = useSharedValue(reduce ? 1 : 0.4);
  const bodyIn = useEnterAnimation(1);

  useEffect(() => {
    pop.value = reduce ? 1 : withSpring(1, spring.bouncy); // success badge is the one place bouncy is allowed
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [reduce, pop]);
  const badge = useAnimatedStyle(() => ({ opacity: reduce ? 1 : pop.value, transform: [{ scale: pop.value }] }));

  return (
    <View style={styles.root} testID="receipt-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.hero}>
          <Animated.View style={badge}>
            <Icon name="checkmark.circle.fill" size={72} color={colors.success} />
          </Animated.View>
          <AppText variant="titleLarge" align="center" accessibilityRole="header">{simulated ? 'Simulated order' : 'Order confirmed'}</AppText>
          <AppText variant="body" tone="secondary" align="center">{formatPkrExact(receipt.totalMinor)}</AppText>
        </View>

        <Animated.View entering={bodyIn} style={styles.stack}>
          {simulated ? (
            <View style={styles.notice} testID="receipt-simulated-notice" accessibilityRole="alert">
              <Icon name="info.circle.fill" size={18} color={colors.statusOffline} />
              <AppText variant="callout" style={styles.flex}>This is a development simulation. No order was placed with the server and nothing was charged.</AppText>
            </View>
          ) : null}

          <Card style={styles.card}>
            <Meta label="Order ID" value={receipt.orderId} selectable testID="receipt-order-id" />
            <Meta label="Status" value={receipt.status} testID="receipt-status" />
            <Meta label="Placed" value={new Date(receipt.createdAt).toLocaleString()} />
            {receipt.signature ? <Meta label="Server signature" value={`${receipt.signature.slice(0, 8)}…${receipt.signature.slice(-6)}`} /> : null}
          </Card>

          <Card style={styles.card} testID="receipt-lines">
            {receipt.lines.map((l, i) => (
              <View key={l.variantId}>
                {i > 0 ? <Divider style={styles.divider} /> : null}
                <View style={styles.line}>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" numberOfLines={2}>{l.name}</AppText>
                    <AppText variant="caption" tone="secondary">{l.variantLabel ? `Size ${l.variantLabel} · ` : ''}{l.quantity} × {formatPkr(l.unitMinor)}</AppText>
                  </View>
                  <AppText variant="bodyStrong" style={styles.num}>{formatPkr(l.lineMinor)}</AppText>
                </View>
              </View>
            ))}
          </Card>

          <PriceBreakdown subtotalMinor={receipt.subtotalMinor} discountMinor={receipt.discountMinor} totalMinor={receipt.totalMinor} />

          <PrimaryButton
            testID="receipt-back-to-store"
            label="Back to store"
            icon="bag"
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Store' } }] })}
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function Meta({ label, value, selectable, testID }: { label: string; value: string; selectable?: boolean; testID?: string }) {
  return (
    <View style={styles.meta}>
      <AppText variant="callout" tone="secondary">{label}</AppText>
      <AppText testID={testID} variant="callout" selectable={selectable} style={styles.metaValue}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.xxl },
  hero: { alignItems: 'center', gap: spacing.sm },
  stack: { gap: spacing.lg },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radii.card, borderWidth: 1, borderColor: colors.statusOffline, backgroundColor: 'rgba(245,181,68,0.08)' },
  card: { backgroundColor: colors.bgRaised, gap: spacing.sm },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  metaValue: { flexShrink: 1, textAlign: 'right' },
  line: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  divider: { marginVertical: spacing.sm },
  num: { fontVariant: ['tabular-nums'] },
});
