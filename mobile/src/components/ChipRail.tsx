import { ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radii, spacing } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

export interface ChipOption {
  id: string;
  label: string;
}

// Single-select pill rail (competition selector). Selected = lighter fill + checkmark + white
// text, so selection never relies on color alone.
export function ChipRail({ options, selectedId, onSelect, label }: { options: ChipOption[]; selectedId: string; onSelect: (id: string) => void; label: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.rail}
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const selected = o.id === selectedId;
        return (
          <PressableScale
            key={o.id}
            testID={`chip-${o.id}`}
            onPress={() => {
              if (!selected) {
                void Haptics.selectionAsync();
                onSelect(o.id);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            {selected ? <Icon name="checkmark" size={13} weight="bold" /> : null}
            <AppText variant="callout" tone={selected ? 'primary' : 'secondary'} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {o.label}
            </AppText>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { marginHorizontal: -spacing.gutter, flexGrow: 0 },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: spacing.minTouchTarget - 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.strokeHairline,
  },
  chipSelected: { backgroundColor: colors.bgSelected, borderColor: 'rgba(255,255,255,0.4)' },
});
