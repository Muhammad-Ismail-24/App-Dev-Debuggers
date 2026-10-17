// DEVELOPMENT ONLY — one-tap email fill for the five demo roles (SCREEN_MAP.md Login).
// Fills the email only; the password is never autofilled.
import { ScrollView, StyleSheet } from 'react-native';
import { AppText } from '../components/AppText';
import { PressableScale } from '../components/PressableScale';
import { colors, radii, spacing } from '../theme';
import { DEMO_ACCOUNTS } from './demoAccounts';

export function DevDemoChips({ selectedEmail, onPick }: { selectedEmail: string; onPick: (email: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
      {DEMO_ACCOUNTS.map((a) => {
        const selected = a.email === selectedEmail.trim().toLowerCase();
        return (
          <PressableScale
            key={a.role}
            testID={`demo-chip-${a.role}`}
            onPress={() => onPick(a.email)}
            accessibilityLabel={`Use ${a.chipLabel} demo email`}
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.selected]}
          >
            <AppText variant="callout" tone={selected ? 'primary' : 'secondary'}>{a.chipLabel}</AppText>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radii.pill, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline },
  selected: { backgroundColor: colors.bgSelected, borderColor: 'rgba(255,255,255,0.4)' },
});
