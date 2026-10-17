import { SymbolView, type SFSymbol } from 'expo-symbols';
import { colors } from '../theme';

export interface IconProps {
  name: SFSymbol;
  size?: number;
  color?: string;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}

// SF Symbols, matching the reference's thin outline glyphs. Decorative by default:
// the surrounding control carries the accessibility label.
export function Icon({ name, size = 20, color = colors.textPrimary, weight = 'regular' }: IconProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
