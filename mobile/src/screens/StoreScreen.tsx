import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { CartButton } from '../components/CartButton';
import { ChipRail } from '../components/ChipRail';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { Screen } from '../components/Screen';
import { defaultStoreRepository } from '../data';
import type { StoreRepository } from '../data/storeRepository';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import type { TabScreenProps } from '../navigation/types';
import { spacing } from '../theme';
import type { Product } from '../types/store';

const ALL = 'all';

// Store tab: category filter + two-column product grid. Product → detail is a native push; the
// bag button opens the cart sheet.
export function StoreScreen({ navigation, repository = defaultStoreRepository }: TabScreenProps<'Store'> & { repository?: StoreRepository }) {
  const { session } = useSession();
  const load = useCallback(() => repository.loadCatalog(session!), [repository, session]);
  const { state, refreshing, refresh, retry } = useLoad<Product[]>(load);
  const [category, setCategory] = useState(ALL);

  return (
    <Screen
      title="Store"
      testID="store-screen"
      refreshing={refreshing}
      onRefresh={refresh}
      headerRight={<CartButton onPress={() => navigation.navigate('Cart')} />}
    >
      {state.status === 'loading' ? (
        <View style={styles.grid} accessible accessibilityRole="progressbar" accessibilityLabel="Loading store" accessibilityState={{ busy: true }}>
          {Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}
        </View>
      ) : null}
      {state.status === 'error' ? <ErrorState message={`${state.message} Check your connection and try again.`} onRetry={retry} /> : null}
      {state.status === 'ready' ? (
        <Loaded products={state.data} category={category} onCategory={setCategory} onOpen={(productId) => navigation.navigate('ProductDetail', { productId })} />
      ) : null}
    </Screen>
  );
}

function Loaded({ products, category, onCategory, onOpen }: { products: Product[]; category: string; onCategory: (c: string) => void; onOpen: (id: string) => void }) {
  const railIn = useEnterAnimation(0);
  const gridIn = useEnterAnimation(1);
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);
  const visible = category === ALL ? products : products.filter((p) => p.category === category);

  if (products.length === 0) {
    return <EmptyState icon="bag" title="The store is empty" message="Merchandise will appear here once it's published. Pull down to refresh." />;
  }
  return (
    <>
      {categories.length > 1 ? (
        <Animated.View entering={railIn}>
          <ChipRail label="Category" selectedId={category} onSelect={onCategory} options={[{ id: ALL, label: 'All' }, ...categories.map((c) => ({ id: c, label: c }))]} />
        </Animated.View>
      ) : null}
      {/* Keyed by category so switching filters crossfades the new grid in. */}
      <Animated.View key={category} entering={gridIn} style={styles.grid}>
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} onPress={onOpen} testID={`product-card-${p.id}`} />
        ))}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, rowGap: spacing.xl } });
