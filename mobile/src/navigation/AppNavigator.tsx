import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer, useNavigation, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CartScreen } from '../screens/CartScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { ClubProfileScreen } from '../screens/ClubProfileScreen';
import { ClubsScreen } from '../screens/ClubsScreen';
import { FixturesScreen } from '../screens/FixturesScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MatchDetailScreen } from '../screens/MatchDetailScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { ReceiptScreen } from '../screens/ReceiptScreen';
import { RosterActionScreen } from '../screens/RosterActionScreen';
import { RosterManagementScreen } from '../screens/RosterManagementScreen';
import { ScoringEntryScreen } from '../screens/ScoringEntryScreen';
import { SyncStatusScreen } from '../screens/SyncStatusScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StandingsScreen } from '../screens/StandingsScreen';
import { StoreScreen } from '../screens/StoreScreen';
import { useCart } from '../hooks/useCart';
import { useSession } from '../hooks/useSession';
import { colors } from '../theme';
import { FloatingTabBar } from './FloatingTabBar';
import type { RootStackParamList, TabParamList } from './types';

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bgBase,
    card: colors.bgBase,
    text: colors.textPrimary,
    border: colors.strokeHairline,
    notification: colors.live,
  },
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Wires Home's callbacks to routes.
function HomeTab() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <HomeScreen
      onOpenMatch={(matchId) => nav.navigate('MatchDetail', { matchId })}
      onOpenFixtures={() => nav.navigate('Tabs', { screen: 'Fixtures' })}
      onOpenStandings={() => nav.navigate('Tabs', { screen: 'Standings' })}
      onOpenClubs={() => nav.navigate('Clubs')}
      onOpenClub={(clubId) => nav.navigate('ClubProfile', { clubId })}
      onOpenProfile={() => nav.navigate('Tabs', { screen: 'Profile' })}
      onRoleAction={(action) => {
        if (action === 'store') nav.navigate('Tabs', { screen: 'Store' });
        else if (action === 'profile') nav.navigate('Tabs', { screen: 'Profile' });
        // Scoring starts from a match and roster management from a club, so send the user to the list to pick one.
        else if (action === 'score') nav.navigate('Tabs', { screen: 'Fixtures' });
        else nav.navigate('Clubs');
      }}
    />
  );
}

function Tabs() {
  const { count } = useCart();
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // iOS tab switches are instant (UITabBarController); motion lives in the dock itself.
        animation: 'none',
        sceneStyle: { backgroundColor: colors.bgBase },
      }}
    >
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Fixtures" component={FixturesScreen} />
      <Tab.Screen name="Store" component={StoreScreen} options={{ tabBarBadge: count > 0 ? count : undefined }} />
      <Tab.Screen name="Standings" component={StandingsScreen} />
      <Tab.Screen name="Profile" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// MOTION_SPEC M8/M9: pushes and sheets are UIKit-native (react-native-screens), including
// the parallax underlay and full-width interactive swipe-back.
// Auth gate: the signed-out stack is Login only; signing in swaps to the app stack and signing
// out swaps back (animated as a pop). Simulated vs backend auth is decided in src/auth/index.ts.
export function AppNavigator() {
  const { session } = useSession();
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgBase },
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        {session ? (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="MatchDetail" component={MatchDetailScreen} />
            <Stack.Screen name="Clubs" component={ClubsScreen} />
            <Stack.Screen name="ClubProfile" component={ClubProfileScreen} />
            <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
            {/* Cart is a native modal sheet (SCREEN_MAP); Checkout pushes over it. */}
            <Stack.Screen name="Cart" component={CartScreen} options={{ presentation: 'modal', gestureEnabled: true, fullScreenGestureEnabled: false }} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} />
            <Stack.Screen name="ScoringEntry" component={ScoringEntryScreen} />
            <Stack.Screen name="RosterManagement" component={RosterManagementScreen} />
            <Stack.Screen name="RosterAction" component={RosterActionScreen} options={{ presentation: 'modal', fullScreenGestureEnabled: false }} />
            <Stack.Screen name="SyncStatus" component={SyncStatusScreen} options={{ presentation: 'modal', fullScreenGestureEnabled: false }} />
            <Stack.Screen name="Receipt" component={ReceiptScreen} options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
          </>
        ) : (
          <Stack.Screen
            name="Login"
            options={{ gestureEnabled: false, animationTypeForReplace: 'pop' }}
          >
            {() => <LoginScreen />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
