// DEVELOPMENT FIXTURES — invented catalogue. Ids for the jersey and its two variants follow the
// spec's baseline seed (prod-jersey-001, var-jersey-001-M stock 1, var-jersey-001-L stock 5);
// everything else is made up. Replace by implementing StoreRepository against the backend.
import type { Product } from '../types/store';

const v = (id: string, label: string, stock: number) => ({ id, label, stock });

export const devProducts: Product[] = [
  {
    id: 'prod-jersey-001', name: 'Islamabad Lions Home Jersey', category: 'Jerseys', priceMinor: 450000,
    description: 'Official home shirt in breathable match fabric. Embroidered crest and sponsor print.',
    images: [{ tint: '#C98A1B' }, { tint: '#8A5E10' }, { tint: '#E0A93B' }],
    variants: [v('var-jersey-001-M', 'M', 1), v('var-jersey-001-L', 'L', 5)],
  },
  {
    id: 'prod-jersey-002', name: 'Lahore Falcons Away Jersey', category: 'Jerseys', priceMinor: 420000,
    description: 'Away shirt in deep blue with contrast collar.',
    images: [{ tint: '#1F4E9C' }, { tint: '#173A75' }],
    variants: [v('var-jersey-002-S', 'S', 3), v('var-jersey-002-M', 'M', 0), v('var-jersey-002-L', 'L', 2)],
  },
  {
    id: 'prod-hoodie-001', name: 'Karachi Titans Training Hoodie', category: 'Apparel', priceMinor: 680000,
    description: 'Heavyweight fleece hoodie for the walk to the ground.',
    images: [{ tint: '#7A2E8E' }, { tint: '#5B2169' }],
    variants: [v('var-hoodie-001-M', 'M', 4), v('var-hoodie-001-L', 'L', 4), v('var-hoodie-001-XL', 'XL', 2)],
  },
  {
    id: 'prod-scarf-001', name: 'Matchday Scarf', category: 'Accessories', priceMinor: 120000,
    description: 'Double-knit scarf. One size.',
    images: [{ tint: '#1E7A4F' }],
    variants: [v('var-scarf-001-OS', 'One size', 25)],
  },
  {
    id: 'prod-cap-001', name: 'Quetta Sharks Cap', category: 'Accessories', priceMinor: 95050,
    description: 'Adjustable cotton cap with embroidered fin.',
    images: [{ tint: '#127C9A' }, { tint: '#0D5F77' }],
    variants: [v('var-cap-001-OS', 'One size', 0)],
  },
];
