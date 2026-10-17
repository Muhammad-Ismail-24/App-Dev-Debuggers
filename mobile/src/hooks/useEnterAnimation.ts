import { Easing, FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';

// Staggered section entrance (inferred, see MOTION_SPEC): 12pt rise + fade, 60ms stagger.
// Reduce Motion → plain 150ms crossfade, no movement.
export function useEnterAnimation(index = 0) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return FadeIn.duration(150);
  return FadeInDown.delay(Math.min(index, 8) * 60)
    .duration(350)
    .easing(Easing.bezier(0.2, 0, 0, 1))
    .withInitialValues({ transform: [{ translateY: 12 }] });
}
