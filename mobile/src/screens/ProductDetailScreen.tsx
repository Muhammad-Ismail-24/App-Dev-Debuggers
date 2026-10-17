import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Button';
import { CartButton } from '../components/CartButton';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { SkeletonBlock } from '../components/LoadingState';
import { PageDots } from '../components/PageDots';
import { ProductImage } from '../components/ProductImage';
import { QuantityStepper } from '../components/QuantityStepper';
import { StockBadge } from '../components/StockBadge';
import { VariantStrip } from '../components/VariantStrip';
import { defaultStoreRepository } from '../data';
import type { StoreRepository } from '../data/storeRepository';
import { useCart } from '../hooks/useCart';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import type { RootStackScreenProps } from '../navigation/types';
import { MAX_LINE_QUANTITY } from '../store/cartReducer';
import { formatPkr } from '../store/money';
import { colors, spacing } from '../theme';
import type { Product } from '../types/store';

export function ProductDetailScreen({ navigation, route, repository = defaultStoreRepository }: RootStackScreenProps<'ProductDetail'> & { repository?: StoreRepository }) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { productId } = route.params;
  const load = useCallback(() => repository.loadProduct(session!, productId), [repository, session, productId]);
  const { state, refreshing, refresh, retry } = useLoad<Product>(load);

  return (
    <View style={styles.root} testID="product-detail-screen">
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable testID="header-back-button" onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => [styles.back, { opacity: pressed ? 0.5 : 1 }]}>
          <Icon name="chevron.left" size={20} weight="semibold" />
        </Pressable>
        <View style={styles.cart}><CartButton onPress={() => navigation.navigate('Cart')} /></View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textPrimary} />}
      >
        {state.status === 'loading' ? (
          <View style={styles.pad} testID="product-loading" accessible accessibilityRole="progressbar" accessibilityLabel="Loading product" accessibilityState={{ busy: true }}>
            <SkeletonBlock height={300} radius={28} />
            <SkeletonBlock width="70%" height={22} />
            <SkeletonBlock width="30%" height={18} />
            <SkeletonBlock height={52} />
          </View>
        ) : null}
        {state.status === 'error' ? <ErrorState message={`${state.message} Check your connection and try again.`} onRetry={retry} /> : null}
        {state.status === 'ready' ? <Loaded product={state.data} onOpenCart={() => navigation.navigate('Cart')} /> : null}
      </ScrollView>
    </View>
  );
}

function Loaded({ product, onOpenCart }: { product: Product; onOpenCart: () => void }) {
  const { dispatch } = useCart();
  const [variantId, setVariantId] = useState<string | undefined>(product.variants.length === 1 ? product.variants[0].id : undefined);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const variant = product.variants.find((v) => v.id === variantId);
  const stock = variant ? variant.stock : product.variants.reduce((s, v) => s + Math.max(0, v.stock), 0);
  const maxQty = Math.max(1, Math.min(variant?.stock ?? 1, MAX_LINE_QUANTITY));
  const tint = product.images[0]?.tint ?? colors.accent;
  const soldOut = product.variants.every((v) => v.stock <= 0);

  const label = soldOut ? 'Out of stock' : !variant ? 'Select a size' : added ? 'Added to cart' : `Add to cart · ${formatPkr(product.priceMinor * quantity)}`;

  const add = () => {
    if (!variant || variant.stock <= 0) return;
    dispatch({
      type: 'add',
      quantity,
      line: { variantId: variant.id, productId: product.id, productName: product.name, variantLabel: variant.label, unitMinor: product.priceMinor, maxQuantity: variant.stock, tint },
    });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1500);
  };

  return (
    <View style={styles.stack}>
      <ImageCarousel product={product} tint={tint} />
      <View style={[styles.pad, styles.stack]}>
        <View style={styles.titleBlock}>
          <AppText variant="title" accessibilityRole="header">{product.name}</AppText>
          <AppText variant="headline" testID="product-price">{formatPkr(product.priceMinor)}</AppText>
          <StockBadge stock={stock} />
        </View>
        <AppText variant="body" tone="secondary">{product.description}</AppText>

        {product.variants.length > 1 || (product.variants.length === 1 && product.variants[0].label !== 'One size') ? (
          <Section title="Size">
            <VariantStrip variants={product.variants} selectedId={variantId} tint={tint} onSelect={(id) => { setVariantId(id); setQuantity(1); }} />
          </Section>
        ) : null}

        {variant && variant.stock > 0 ? (
          <Section title="Quantity">
            <QuantityStepper testID="product-qty" value={Math.min(quantity, maxQty)} max={maxQty} itemName={product.name} onChange={setQuantity} />
          </Section>
        ) : null}

        <PrimaryButton testID="add-to-cart-button" label={label} icon={added ? 'checkmark.circle.fill' : undefined} disabled={soldOut || !variant} onPress={add} />
        {added ? (
          <Pressable testID="view-cart-link" onPress={onOpenCart} accessibilityRole="button" accessibilityLabel="View cart" style={styles.viewCart}>
            <AppText variant="callout" tone="accent">View cart</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="headline" accessibilityRole="header">{title}</AppText>
      {children}
    </View>
  );
}

// Paging image rail over a product-tinted spotlight. Neighbours shrink and dim with distance
// (MOTION S5, inferred); dots follow the same scroll offset.
function ImageCarousel({ product, tint }: { product: Product; tint: string }) {
  const { width } = useWindowDimensions();
  const height = Math.min(width, 380);
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });
  const images = product.images.length > 0 ? product.images : [{ tint }];

  return (
    <View style={styles.carousel}>
      <LinearGradient colors={[`${tint}88`, `${tint}22`, colors.bgBase]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <Animated.ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} testID="product-carousel" accessibilityLabel={`${product.name}, ${images.length} images`}>
        {images.map((img, i) => (
          <CarouselPage key={i} index={i} width={width} height={height} scrollX={scrollX}>
            <ProductImage image={img} iconSize={72} />
          </CarouselPage>
        ))}
      </Animated.ScrollView>
      <PageDots count={images.length} scrollX={scrollX} step={width} />
    </View>
  );
}

function CarouselPage({ index, width, height, scrollX, children }: { index: number; width: number; height: number; scrollX: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scrollX.value / width - index);
    return { opacity: interpolate(d, [0, 1], [1, 0.45], Extrapolation.CLAMP), transform: [{ scale: interpolate(d, [0, 1], [1, 0.82], Extrapolation.CLAMP) }] };
  });
  return (
    <View style={{ width, height, padding: spacing.xl }}>
      <Animated.View style={[styles.page, style]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs, zIndex: 10 },
  back: { width: spacing.minTouchTarget, height: spacing.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  cart: { paddingRight: spacing.md },
  pad: { paddingHorizontal: spacing.gutter },
  stack: { gap: spacing.lg },
  titleBlock: { gap: spacing.xs },
  section: { gap: spacing.sm },
  carousel: { paddingBottom: spacing.sm, gap: spacing.sm },
  page: { flex: 1, borderRadius: 28, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline },
  viewCart: { minHeight: spacing.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
