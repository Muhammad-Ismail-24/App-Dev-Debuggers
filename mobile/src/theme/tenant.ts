import { createContext, useContext } from 'react';
import { colors } from './colors';

export interface TenantTheme {
  name: string;
  // Top → bottom header wash (DESIGN_SYSTEM.md §1.3). The last stop must be bgBase.
  headerGradient: readonly [string, string, ...string[]];
  headerGradientLocations: readonly [number, number, ...number[]];
}

// Default wash = the MLS Home header stops, sampled from the reference.
// Replaced by backend tenant colors once the API exposes them.
export const defaultTenantTheme: TenantTheme = {
  name: 'NaSCon 26',
  headerGradient: ['#517DAE', '#575571', '#432C38', colors.bgBase],
  headerGradientLocations: [0, 0.38, 0.68, 1],
};

export const TenantThemeContext = createContext<TenantTheme>(defaultTenantTheme);

export function useTenantTheme(): TenantTheme {
  return useContext(TenantThemeContext);
}
