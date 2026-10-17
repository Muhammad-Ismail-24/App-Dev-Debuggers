import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, radii, spacing, spring } from '../theme';
import type { ProductVariant } from '../types/store';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

function Underline({ selected, tint }: { selected: boolean; tint: string }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, spring.smooth);
  }, [selected, reduce, p]);
  // Glowing underline (reference crest-picker) grows in under the selected option.
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scaleX: 0.3 + 0.7 * p.value }] }));
  return <Animated.View style={[styles.underline, { backgroundColor: tint, shadowColor: tint }, style]} />;
}

// Size / variant picker. Sold-out options stay visible but disabled and say so in text.
export function VariantStrip({ variants, selectedId, onSelect, tint = colors.accent }: { variants: ProductVariant[]; selectedId?: string; onSelect: (id: string) => void; tint?: string }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Size">
      {variants.map((v) => {
        const out = v.stock <= 0;
        const selected = v.id === selectedId;
        return (
          <PressableScale
            key={v.id}
            testID={`variant-${v.id}`}
            disabled={out}
            onPress={() => {
              void Haptics.selectionAsync();
              onSelect(v.id);
            }}
            accessibilityRole="radio"
            accessibilityLabel={`${v.label}${out ? ', out of stock' : v.stock <= 3 ? `, only ${v.stock} left` : ''}`}
            accessibilityState={{ selected, disabled: out }}
            style={[styles.option, selected && styles.selected, out && styles.out]}
          >
            <AppText variant="bodyStrong" tone={out ? 'tertiary' : 'primary'} style={out && styles.strike} maxFontSizeMultiplier={1.2}>{v.label}</AppText>
            {out ? <AppText variant="caption" tone="tertiary" maxFontSizeMultiplier={1.1}>Sold out</AppText> : null}
            <Underline selected={selected} tint={tint} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minWidth: 60, minHeight: spacing.minTouchTarget + 4, paddingHorizontal: spacing.lg, borderRadius: radii.button - 4, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline, overflow: 'visible' },
  selected: { backgroundColor: colors.bgSelected, borderColor: 'rgba(255,255,255,0.5)' },
  out: { opacity: 0.6 },
  strike: { textDecorationLine: 'line-through' },
  underline: { position: 'absolute', bottom: -1, left: 12, right: 12, height: 3, borderRadius: 2, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
});
