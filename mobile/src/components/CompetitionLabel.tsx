import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme';
import { AppText } from './AppText';

// "Premier League · Football" — grey metadata line used on every match card.
export function CompetitionLabel({ name, sport, numberOfLines = 1 }: { name: string; sport?: string; numberOfLines?: number }) {
  return (
    <View style={styles.wrap}>
      <AppText variant="caption" tone="secondary" numberOfLines={numberOfLines} maxFontSizeMultiplier={1.3}>
        {sport ? `${name} · ${sport}` : name}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flexShrink: 1, paddingRight: spacing.sm } });
