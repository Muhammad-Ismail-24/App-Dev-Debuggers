import type { TextStyle } from 'react-native';

// SF Pro (system font) scale — DESIGN_SYSTEM.md §2. Minimum 13pt except tab labels.
export const typography = {
  displayScore: { fontSize: 48, lineHeight: 52, fontWeight: '800', fontVariant: ['tabular-nums'] },
  titleLarge: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  tab: { fontSize: 11, lineHeight: 13, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
