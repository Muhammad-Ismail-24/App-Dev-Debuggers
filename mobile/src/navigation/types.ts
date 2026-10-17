import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RosterChange } from '../api/audit';
import type { OrderReceipt } from '../types/store';

// Tab roots. Order = dock order; Store (3rd of 5) is the raised center tab.
export type TabParamList = {
  Home: undefined;
  Fixtures: undefined;
  Store: undefined;
  Standings: undefined;
  Profile: undefined;
};

// Detail screens live on the root stack so a push covers the dock entirely
// (the reference hides its dock on Match Detail). More are added per phase.
export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  MatchDetail: { matchId: string };
  // Clubs is reached from Home (and later match/fixture screens), not from the dock.
  Clubs: undefined;
  ClubProfile: { clubId: string };
  ProductDetail: { productId: string };
  Cart: undefined;
  ScoringEntry: { matchId: string };
  RosterManagement: { clubId: string };
  RosterAction: { clubId: string; playerId: string; action: RosterChange };
  SyncStatus: undefined;
  Checkout: undefined;
  // Whole receipt travels in params (plain JSON) so the screen needs no store lookup.
  Receipt: { receipt: OrderReceipt };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
