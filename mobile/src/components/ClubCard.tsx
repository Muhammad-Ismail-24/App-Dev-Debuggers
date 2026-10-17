import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import { clubColor } from '../theme/clubColor';
import type { ClubSummary } from '../types/league';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { SkeletonBlock } from './LoadingState';
import { Crest } from './TeamIdentity';

export const CLUB_CARD_WIDTH = 132;

// Club tile: crest over a club-color glow (the reference's club-tinted spotlight, miniaturised).
export function ClubCard({ club, onPress, testID }: { club: ClubSummary; onPress: (id: string) => void; testID?: string }) {
  const color = clubColor(club.id, club.color);
  return (
    <PressableScale
      testID={testID}
      onPress={() => onPress(club.id)}
      accessibilityLabel={`${club.name}${club.venue ? `, ${club.venue}` : ''}`}
      accessibilityHint="Opens club profile"
      style={styles.card}
    >
      <LinearGradient colors={[`${color}66`, 'rgba(25,27,31,0)']} style={styles.glow} />
      <Crest team={{ id: club.id, shortName: club.shortName, color: club.color, logoUri: club.logoUri }} size={52} />
      <AppText variant="bodyStrong" align="center" numberOfLines={2} style={styles.name} maxFontSizeMultiplier={1.2}>{club.name}</AppText>
      {club.venue ? <AppText variant="caption" tone="secondary" align="center" numberOfLines={1}>{club.venue}</AppText> : null}
    </PressableScale>
  );
}

export function ClubCardSkeleton() {
  return (
    <View style={[styles.card, { alignItems: 'center', gap: spacing.md }]}>
      <SkeletonBlock width={52} height={52} radius={26} />
      <SkeletonBlock width="70%" height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CLUB_CARD_WIDTH,
    minHeight: 148,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.strokeHairline,
    backgroundColor: colors.bgBase,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  glow: { ...StyleSheet.absoluteFill, height: 90 },
  name: { marginTop: spacing.xs },
});
