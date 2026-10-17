import { Text, type TextProps } from 'react-native';
import { colors, typography, type TypographyVariant } from '../theme';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'success' | 'onCta';

const toneColor: Record<Tone, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  accent: colors.accent,
  danger: colors.danger,
  success: colors.success,
  onCta: colors.ctaFg,
};

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: Tone;
  align?: 'left' | 'center' | 'right';
}

// Single text primitive so every screen shares one type scale. Dynamic Type stays on,
// capped so dense layouts survive the largest accessibility sizes.
export function AppText({
  variant = 'body',
  tone = 'primary',
  align,
  style,
  maxFontSizeMultiplier = 1.4,
  ...rest
}: AppTextProps) {
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typography[variant], { color: toneColor[tone] }, align && { textAlign: align }, style]}
      {...rest}
    />
  );
}
