// Single place that decides where each screen's data comes from.
//   EXPO_PUBLIC_DATA_SOURCE=backend  → documented routes where they exist
//   EXPO_PUBLIC_DATA_SOURCE=dev      → typed development fixtures (default in __DEV__)
// Only the Store (checkout + inventory) and the scoring / roster / sync write paths have documented
// routes. Home, fixtures, standings and club data have no documented read routes, so they are
// development fixtures in every mode (see IMPLEMENTATION_PLAN.md §12).
import { backendStoreRepository } from './backendStoreRepository';
import { devStoreRepository } from './devStoreRepository';
import type { StoreRepository } from './storeRepository';

export type DataSource = 'backend' | 'dev';
export const DATA_SOURCE: DataSource =
  (process.env.EXPO_PUBLIC_DATA_SOURCE as DataSource | undefined) ?? (__DEV__ ? 'dev' : 'backend');

export const defaultStoreRepository: StoreRepository = DATA_SOURCE === 'backend' ? backendStoreRepository : devStoreRepository;
