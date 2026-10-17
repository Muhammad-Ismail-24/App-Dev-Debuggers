import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, radii, spacing } from '../theme';
import type { MatchStatus } from '../types/league';
import { formatTime } from '../utils/dateFormat';
import { AppText } from './AppText';

interface Props {
  status: MatchStatus;
  statusDetail?: string;
  startsAt: string;
}

// Status is always text (+ a dot for LIVE) so it never depends on color alone.
export function MatchStatusBadge({ status, statusDetail, startsAt }: Props) {
  if (status === 'live') return <LiveBadge detail={statusDetail} />;
  const label =
    status === 'scheduled' ? formatTime(startsAt)
    : status === 'final' ? 'Full-time'
    : status === 'break' ? statusDetail ?? 'Break'
    : 'Postponed';
  return (
    <View style={[styles.pill, styles.neutral]} accessible accessibilityLabel={status === 'scheduled' ? `Kickoff ${label}` : label}>
      <AppText variant="caption" tone={status === 'postponed' ? 'danger' : 'primary'} maxFontSizeMultiplier={1.2} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

function LiveBadge({ detail }: { detail?: string }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    // Inferred: slow 1s pulse on the dot only; label stays static.
    pulse.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduceMotion, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View style={[styles.pill, styles.live]} accessible accessibilityLabel={detail ? `Live, ${detail}` : 'Live'}>
      <Animated.View style={[styles.dot, dotStyle]} />
      <AppText variant="caption" maxFontSizeMultiplier={1.2} style={styles.text}>
        {detail ? `LIVE · ${detail}` : 'LIVE'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, paddingHorizontal: spacing.md - 2, paddingVertical: 4, borderRadius: radii.pill },
  neutral: { backgroundColor: 'rgba(255,255,255,0.14)' },
  live: { backgroundColor: 'rgba(255,59,92,0.22)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  text: { fontWeight: '700' },
});
