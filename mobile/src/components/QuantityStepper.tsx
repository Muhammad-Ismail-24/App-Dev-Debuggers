import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

// − / + with 48pt targets. `onDecrement` at 1 may mean "remove" — the caller decides.
export function QuantityStepper({ value, max, min = 1, onChange, itemName, testID }: { value: number; max: number; min?: number; onChange: (next: number) => void; itemName: string; testID?: string }) {
  const canInc = value < max;
  const canDec = value > min;
  const press = (next: number) => {
    void Haptics.selectionAsync();
    onChange(next);
  };
  return (
    <View
      testID={testID}
      style={styles.wrap}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Quantity of ${itemName}`}
      accessibilityValue={{ min, max, now: value, text: `${value}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && canInc) press(value + 1);
        if (e.nativeEvent.actionName === 'decrement' && canDec) press(value - 1);
      }}
    >
      <Pressable testID={testID ? `${testID}-dec` : undefined} accessibilityElementsHidden importantForAccessibility="no" disabled={!canDec} onPress={() => press(value - 1)} style={({ pressed }) => [styles.btn, { opacity: !canDec ? 0.35 : pressed ? 0.6 : 1 }]}>
        <Icon name="minus" size={16} weight="semibold" />
      </Pressable>
      <AppText variant="bodyStrong" style={styles.value} maxFontSizeMultiplier={1.2}>{value}</AppText>
      <Pressable testID={testID ? `${testID}-inc` : undefined} accessibilityElementsHidden importantForAccessibility="no" disabled={!canInc} onPress={() => press(value + 1)} style={({ pressed }) => [styles.btn, { opacity: !canInc ? 0.35 : pressed ? 0.6 : 1 }]}>
        <Icon name="plus" size={16} weight="semibold" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline },
  btn: { width: spacing.minTouchTarget, height: spacing.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
