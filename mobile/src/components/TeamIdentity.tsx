import { Image, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { clubColor } from '../theme/clubColor';
import type { TeamRef } from '../types/league';
import { AppText } from './AppText';

export function Crest({ team, size = 24 }: { team: Pick<TeamRef, 'id' | 'shortName' | 'color' | 'logoUri'>; size?: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (team.logoUri) {
    return <Image source={{ uri: team.logoUri }} style={[styles.logo, box]} accessibilityIgnoresInvertColors />;
  }
  // Missing logo → club-colored disc with initials.
  return (
    <View style={[styles.disc, box, { backgroundColor: clubColor(team.id, team.color) }]}>
      <AppText
        variant="caption"
        style={{ fontSize: Math.max(10, size * 0.38), lineHeight: size, fontWeight: '800' }}
        maxFontSizeMultiplier={1}
        numberOfLines={1}
      >
        {team.shortName.slice(0, 2).toUpperCase()}
      </AppText>
    </View>
  );
}

interface TeamIdentityProps {
  team: TeamRef;
  layout?: 'row' | 'stacked';
  size?: number;
  // 'short' = abbreviation (compact cards), 'full' = name that truncates safely.
  label?: 'short' | 'full';
  align?: 'left' | 'center';
}

export function TeamIdentity({ team, layout = 'row', size = 24, label = 'full', align = 'left' }: TeamIdentityProps) {
  const text = label === 'short' ? team.shortName : team.name;
  if (layout === 'stacked') {
    return (
      <View style={styles.stacked}>
        <Crest team={team} size={size} />
        <AppText variant="bodyStrong" numberOfLines={2} align="center" style={styles.stackedLabel}>
          {text}
        </AppText>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Crest team={team} size={size} />
      <AppText variant="bodyStrong" numberOfLines={1} style={[styles.rowLabel, align === 'center' && { textAlign: 'center' }]}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(255,255,255,0.18)' },
  logo: { backgroundColor: colors.bgRaised },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  rowLabel: { flexShrink: 1 },
  stacked: { alignItems: 'center', gap: spacing.sm, flex: 1 },
  stackedLabel: { maxWidth: '100%' },
});
