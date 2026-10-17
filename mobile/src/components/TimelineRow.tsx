import type { SFSymbol } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, useReducedMotion } from 'react-native-reanimated';
import { colors, spacing } from '../theme';
import type { MatchEvent, MatchSummary } from '../types/league';
import { AppText } from './AppText';
import { Icon } from './Icon';

// One timeline entry (reference scorer list, generalised): time, icon, label + actor, and the
// team's name so side is never conveyed by position/color alone. Corrected events stay visible,
// struck through at 50% with a text badge (MOTION S4, compensating-event model).
export function TimelineRow({ event, match, index }: { event: MatchEvent; match: MatchSummary; index: number }) {
  const reduce = useReducedMotion();
  const team = event.side === 'home' ? match.home.team : match.away.team;
  const entering = reduce ? FadeIn.duration(150) : FadeInLeft.delay(Math.min(index, 6) * 40).duration(300);
  return (
    <Animated.View
      entering={entering}
      style={[styles.row, event.corrected && styles.corrected]}
      accessible
      accessibilityLabel={`${event.timeLabel}, ${event.label}${event.actor ? `, ${event.actor}` : ''}, ${team.name}${event.corrected ? ', corrected' : ''}`}
    >
      <AppText variant="callout" tone="secondary" style={styles.time} maxFontSizeMultiplier={1.2}>{event.timeLabel}</AppText>
      <View style={styles.iconWrap}>
        <Icon name={(event.symbol as SFSymbol | undefined) ?? 'circle.fill'} size={event.symbol ? 18 : 8} color={colors.textPrimary} />
      </View>
      <View style={styles.body}>
        <AppText variant="bodyStrong" style={event.corrected ? styles.struck : undefined}>{event.label}{event.actor ? ` · ${event.actor}` : ''}</AppText>
        <AppText variant="caption" tone="secondary">{team.name}</AppText>
        {event.corrected ? (
          <View style={styles.badge}>
            <AppText variant="caption" tone="secondary" style={styles.badgeText}>Corrected{event.correctedBy ? ` · ${event.correctedBy}` : ''}</AppText>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.strokeHairline },
  corrected: { opacity: 0.55 },
  time: { width: 64, fontVariant: ['tabular-nums'] },
  iconWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  struck: { textDecorationLine: 'line-through' },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.strokeHairline, borderRadius: 999, paddingHorizontal: spacing.sm, marginTop: 2 },
  badgeText: { fontWeight: '600' },
});
