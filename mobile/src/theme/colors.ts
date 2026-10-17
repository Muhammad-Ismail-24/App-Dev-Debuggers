// Floodlight palette — see DESIGN_SYSTEM.md §1. Values marked † were pixel-sampled
// from the MLS iOS reference; the rest are tuned for WCAG contrast on bgBase.
export const colors = {
  bgBase: '#191B1F', // †
  bgSunken: '#08070C', // † tab dock
  bgRaised: '#232529',
  bgSelected: '#2B2C30', // †
  strokeHairline: '#36383C', // †

  textPrimary: '#FFFFFF',
  textSecondary: '#9A9FA6', // † ≈6.4:1 on bgBase
  textTertiary: '#858A93', // ≈5.0:1 on bgBase (MLS #5A5C69 fails contrast)

  glassFill: 'rgba(255,255,255,0.14)',
  glassFillPressed: 'rgba(255,255,255,0.24)',
  ctaBg: '#FFFDFE', // †
  ctaBgPressed: '#E6E6E8',
  ctaBgDisabled: '#D0D0D0',
  ctaFg: '#111214',
  scrim: 'rgba(0,0,0,0.35)',

  accent: '#4FAEFF', // †
  accentIndicator: '#65B0F9', // †

  statusOnline: '#3DD68C',
  statusOffline: '#F5B544',
  statusSyncing: '#4FAEFF',
  success: '#3DD68C',
  danger: '#FF6B6B',
  live: '#FF3B5C',
} as const;

export type ColorToken = keyof typeof colors;
