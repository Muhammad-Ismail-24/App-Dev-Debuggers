import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SFSymbol } from 'expo-symbols';
import { useNavigation } from '@react-navigation/native';
import { useSync } from '../hooks/useSync';
import { useConnectivity, type ConnectivityStatus } from '../sync/connectivity';
import { colors, radii, spacing } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

const config: Record<ConnectivityStatus, { label: string; color: string; icon: SFSymbol }> = {
  checking: { label: 'Checking', color: colors.textSecondary, icon: 'antenna.radiowaves.left.and.right' },
  online: { label: 'Online', color: colors.statusOnline, icon: 'checkmark.icloud' },
  offline: { label: 'Offline', color: colors.statusOffline, icon: 'icloud.slash' },
  syncing: { label: 'Syncing', color: colors.statusSyncing, icon: 'arrow.triangle.2.circlepath' },
};

interface ConnectivityPillProps {
  onPress?: () => void;
  // Overrides the live NetInfo status (used by the sync manager to show 'syncing').
  status?: ConnectivityStatus;
}

// Always-visible Online / Offline / Syncing indicator (PDF §8.2, MOTION_SPEC N1).
// State is conveyed by text + icon + color, never color alone.
export function ConnectivityPill({ onPress, status: override }: ConnectivityPillProps) {
  const live = useConnectivity();
  const { syncing, unsyncedCount } = useSync();
  const navigation = useNavigation();
  const status = override ?? (syncing ? 'syncing' : live);
  const { label: base, color, icon } = config[status];
  // Unconfirmed work stays visible next to the status: "Offline · 2".
  const label = unsyncedCount > 0 ? `${base} · ${unsyncedCount}` : base;
  const handlePress = onPress ?? (() => navigation.navigate('SyncStatus' as never));
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (status === 'syncing' && !reduceMotion) {
      rotation.value = 0;
      rotation.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(rotation);
      rotation.value = 0;
    }
  }, [status, reduceMotion, rotation]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Pressable
      testID="connectivity-pill"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Connection status: ${base}${unsyncedCount > 0 ? `, ${unsyncedCount} changes waiting to sync` : ''}`}
      accessibilityHint="Opens sync status"
      accessibilityLiveRegion="polite"
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Animated.View key={status} entering={reduceMotion ? undefined : FadeIn.duration(150)} style={styles.row}>
        <Animated.View style={iconStyle}>
          <Icon name={icon} size={13} color={color} weight="semibold" />
        </Animated.View>
        <AppText variant="caption" style={styles.label} maxFontSizeMultiplier={1.2}>
          {label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 30,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(8,7,12,0.55)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontWeight: '600' },
});
