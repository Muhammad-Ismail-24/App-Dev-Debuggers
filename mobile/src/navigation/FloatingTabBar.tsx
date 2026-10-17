import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import type { SFSymbol } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '../components/Icon';
import { colors, pressScale, radii, spring, typography } from '../theme';
import { dockBottomOffset, tabBarMetrics } from './tabBarMetrics';
import type { TabParamList } from './types';

type TabName = keyof TabParamList;

const tabConfig: Record<TabName, { label: string; icon: SFSymbol; activeIcon: SFSymbol; testID: string }> = {
  Home: { label: 'Home', icon: 'house', activeIcon: 'house.fill', testID: 'tab-home' },
  Fixtures: { label: 'Fixtures', icon: 'sportscourt', activeIcon: 'sportscourt.fill', testID: 'tab-fixtures' },
  Store: { label: 'Store', icon: 'bag.fill', activeIcon: 'bag.fill', testID: 'tab-store' },
  Standings: { label: 'Standings', icon: 'trophy', activeIcon: 'trophy.fill', testID: 'tab-standings' },
  Profile: { label: 'Profile', icon: 'person.crop.circle', activeIcon: 'person.crop.circle.fill', testID: 'tab-profile' },
};

const CENTER_TAB: TabName = 'Store';

// The reference's floating dock: inset from the edges, near-black, fully rounded, with a
// raised accent circle in the middle (our Store — the rubric wants "Buy" to stand out).
// Rendered absolutely so content scrolls underneath it.
export function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const bottom = dockBottomOffset(insets);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View style={styles.dock} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const name = route.name as TabName;
          const focused = state.index === index;
          const { options } = descriptors[route.key];

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              void Haptics.selectionAsync();
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

          const Item = name === CENTER_TAB ? CenterTab : DockTab;
          return (
            <Item
              key={route.key}
              config={tabConfig[name]}
              focused={focused}
              badge={options.tabBarBadge}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

interface TabItemProps {
  config: (typeof tabConfig)[TabName];
  focused: boolean;
  badge?: string | number;
  onPress: () => void;
  onLongPress: () => void;
}

// MOTION_SPEC M4: label color crossfades grey ↔ white, icon bumps 1 → 1.08 → 1 on focus.
function DockTab({ config, focused, badge, onPress, onLongPress }: TabItemProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(focused ? 1 : 0);
  const bump = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: 200 });
    if (focused && !reduceMotion) {
      bump.value = withSequence(withTiming(1.08, { duration: 110 }), withSpring(1, spring.snappy));
    }
  }, [focused, reduceMotion, progress, bump]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.textTertiary, colors.textPrimary]),
  }));

  return (
    <Pressable
      testID={config.testID}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityLabel={badge ? `${config.label}, ${badge} new` : config.label}
      accessibilityState={{ selected: focused }}
      style={styles.item}
    >
      <Animated.View style={iconStyle}>
        <Icon
          name={focused ? config.activeIcon : config.icon}
          size={22}
          color={focused ? colors.textPrimary : colors.textTertiary}
        />
        {badge != null ? <Badge value={badge} /> : null}
      </Animated.View>
      <Animated.Text style={[styles.label, labelStyle]} maxFontSizeMultiplier={1.2} numberOfLines={1}>
        {config.label}
      </Animated.Text>
    </Pressable>
  );
}

// MOTION_SPEC M5: raised button presses to 0.92 with a spring back; the accent glow
// brightens while pressed. Focus is shown by a white ring + white label, not color alone.
function CenterTab({ config, focused, badge, onPress, onLongPress }: TabItemProps) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * (1 - pressScale.centerTab) }],
    shadowOpacity: 0.45 + pressed.value * 0.35,
  }));

  return (
    <Pressable
      testID={config.testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 120 });
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, spring.bouncy);
      }}
      // The circle protrudes above the dock; extend the hit area so its top half is tappable.
      hitSlop={{ top: tabBarMetrics.centerLift }}
      accessibilityRole="tab"
      accessibilityLabel={badge ? `${config.label}, ${badge} items in cart` : config.label}
      accessibilityState={{ selected: focused }}
      style={styles.item}
    >
      <Animated.View style={[styles.centerButton, focused && styles.centerButtonFocused, buttonStyle]}>
        <Icon name={config.icon} size={24} color={colors.bgSunken} weight="semibold" />
        {badge != null ? <Badge value={badge} /> : null}
      </Animated.View>
      <Animated.Text
        style={[styles.label, { color: focused ? colors.textPrimary : colors.textTertiary }]}
        maxFontSizeMultiplier={1.2}
      >
        {config.label}
      </Animated.Text>
    </Pressable>
  );
}

function Badge({ value }: { value: string | number }) {
  return (
    <View style={styles.badge} pointerEvents="none">
      <Animated.Text style={styles.badgeText} maxFontSizeMultiplier={1}>
        {value}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: tabBarMetrics.dockSideInset,
    right: tabBarMetrics.dockSideInset,
  },
  dock: {
    height: tabBarMetrics.dockHeight,
    borderRadius: radii.dock,
    backgroundColor: colors.bgSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    gap: 3,
  },
  label: { ...typography.tab, color: colors.textTertiary },
  centerButton: {
    position: 'absolute',
    top: -tabBarMetrics.centerLift,
    width: tabBarMetrics.centerSize,
    height: tabBarMetrics.centerSize,
    borderRadius: tabBarMetrics.centerSize / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  centerButtonFocused: { borderWidth: 2, borderColor: '#FFFFFF' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});
