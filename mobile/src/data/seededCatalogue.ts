// The ONLY catalogue the spec guarantees: Part I §5.5 seeds product prod-jersey-001 with variants
// var-jersey-001-M and var-jersey-001-L at price_minor 450000 PKR. No catalogue read route is
// documented, so the backend repository shows this seed product and overlays live stock from
// GET /audit/v1/inventory/{variant_id}. Names, description and imagery are presentation only.
import type { Product } from '../types/store';

export const SEEDED_PRODUCT_ID = 'prod-jersey-001';

export const seededCatalogue: Product[] = [
  {
    id: SEEDED_PRODUCT_ID,
    name: 'Club Jersey',
    description: 'Official match jersey.',
    category: 'Jerseys',
    priceMinor: 450000,
    images: [{ tint: '#C98A1B' }],
    variants: [
      { id: 'var-jersey-001-M', label: 'M', stock: 0 },
      { id: 'var-jersey-001-L', label: 'L', stock: 0 },
    ],
  },
];
