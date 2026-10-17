import { Easing } from 'react-native-reanimated';

// Motion presets — MOTION_SPEC.md (all INFERRED; no reference motion was observable).
export const spring = {
  snappy: { damping: 20, stiffness: 300, mass: 0.8 },
  smooth: { damping: 26, stiffness: 180, mass: 1 },
  bouncy: { damping: 14, stiffness: 220, mass: 1 },
} as const;

const emphasized = Easing.bezier(0.2, 0, 0, 1);

export const timing = {
  fast: { duration: 150, easing: Easing.out(Easing.quad) },
  base: { duration: 250, easing: emphasized },
  slow: { duration: 450, easing: emphasized },
} as const;

export const pressScale = {
  card: 0.97,
  button: 0.98,
  centerTab: 0.92,
} as const;
