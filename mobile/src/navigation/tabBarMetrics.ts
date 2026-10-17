import type { EdgeInsets } from 'react-native-safe-area-context';

// Floating dock proportions measured from the reference (393pt-wide frames):
// inset ≈10pt from the screen edges, ≈58pt tall, radius ≈28, center button ≈52pt
// protruding above the dock. Center button bumped to 56pt for a comfortable target and
// lifted 20pt so it clears its own label.
export const tabBarMetrics = {
  dockHeight: 58,
  dockSideInset: 10,
  centerSize: 56,
  centerLift: 20,
} as const;

// The dock straddles the home-indicator area like the reference, but never closer
// than 8pt to the bottom edge (12pt on devices without a home indicator).
export function dockBottomOffset(insets: EdgeInsets): number {
  return insets.bottom > 0 ? Math.max(insets.bottom - 14, 8) : 12;
}

// Bottom padding scrollable tab content needs so its last item clears the dock.
export function tabContentBottomSpace(insets: EdgeInsets): number {
  return dockBottomOffset(insets) + tabBarMetrics.dockHeight + 24;
}
