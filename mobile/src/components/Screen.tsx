import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { tabContentBottomSpace } from '../navigation/tabBarMetrics';
import { colors, spacing, useTenantTheme } from '../theme';
import { AppText } from './AppText';
import { ConnectivityPill } from './ConnectivityPill';

const COMPACT_BAR_HEIGHT = 44;
const LARGE_TITLE_HEIGHT = 56;
const HEADER_WASH_HEIGHT = 220;

export interface ScreenProps {
  title: string;
  children: ReactNode;
  // Rendered next to the connectivity pill in both header states.
  headerRight?: ReactNode;
  onConnectivityPress?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  // Tab roots reserve space for the floating dock; pushed screens don't.
  inTabs?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

// Tab-root container: tenant gradient wash + iOS-style large title that collapses into a
// blurred compact bar on scroll (MOTION_SPEC S10). The connectivity pill is visible in
// both states so Online/Offline is always on screen.
export function Screen({
  title,
  children,
  headerRight,
  onConnectivityPress,
  refreshing = false,
  onRefresh,
  inTabs = true,
  contentStyle,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const tenant = useTenantTheme();
  const reduceMotion = useReducedMotion();
  const scrollY = useSharedValue(0);
  const [collapsed, setCollapsed] = useState(false);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Only the visible header's controls receive touches.
  useAnimatedReaction(
    () => scrollY.value > LARGE_TITLE_HEIGHT - 8,
    (isCollapsed, prev) => {
      if (isCollapsed !== prev) scheduleOnRN(setCollapsed, isCollapsed);
    },
  );

  // Wash scrolls away with content but stays pinned while over-scrolling (pull-to-refresh).
  const washStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(scrollY.value, 0) }],
  }));

  // Large title grows slightly on over-scroll (iOS behaviour) and fades as it slides under the bar.
  const largeTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, LARGE_TITLE_HEIGHT - 8], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: reduceMotion ? 1 : interpolate(scrollY.value, [-120, 0], [1.08, 1], Extrapolation.CLAMP) },
    ],
  }));

  const compactBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [LARGE_TITLE_HEIGHT - 20, LARGE_TITLE_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const headerControls = (
    <View style={styles.controls}>
      {headerRight}
      <ConnectivityPill onPress={onConnectivityPress} />
    </View>
  );

  return (
    <View style={styles.root} testID={testID}>
      <Animated.View pointerEvents="none" style={[styles.wash, { height: insets.top + HEADER_WASH_HEIGHT }, washStyle]}>
        <LinearGradient
          colors={tenant.headerGradient}
          locations={tenant.headerGradientLocations}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textPrimary}
              progressViewOffset={insets.top}
            />
          ) : undefined
        }
        contentContainerStyle={[
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: inTabs ? tabContentBottomSpace(insets) : insets.bottom + spacing.xxl,
          },
        ]}
      >
        <Animated.View
          style={[styles.largeTitleRow, largeTitleStyle]}
          pointerEvents={collapsed ? 'none' : 'box-none'}
        >
          <AppText variant="titleLarge" accessibilityRole="header" numberOfLines={1} style={styles.largeTitle}>
            {title}
          </AppText>
          {headerControls}
        </Animated.View>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </Animated.ScrollView>

      <Animated.View
        pointerEvents={collapsed ? 'box-none' : 'none'}
        importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!collapsed}
        style={[styles.compactBar, { height: insets.top + COMPACT_BAR_HEIGHT }, compactBarStyle]}
      >
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.compactTint]} />
        <View style={[styles.compactRow, { marginTop: insets.top }]}>
          <AppText variant="headline" numberOfLines={1} style={styles.compactTitle}>
            {title}
          </AppText>
          <View style={styles.compactControls}>{headerControls}</View>
        </View>
        <View style={styles.compactHairline} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  wash: { position: 'absolute', top: 0, left: 0, right: 0 },
  largeTitleRow: {
    minHeight: LARGE_TITLE_HEIGHT,
    paddingHorizontal: spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    transformOrigin: 'left center',
  },
  largeTitle: { flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.sectionGap },
  compactBar: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  compactTint: { backgroundColor: 'rgba(25,27,31,0.72)' },
  compactRow: {
    height: COMPACT_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
  },
  compactTitle: { maxWidth: '40%' },
  compactControls: { position: 'absolute', right: spacing.gutter },
  compactHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.strokeHairline,
  },
});
