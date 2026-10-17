import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CartProvider } from './src/hooks/useCart';
import { SyncProvider } from './src/hooks/useSync';
import { SessionProvider } from './src/hooks/useSession';
import { AppNavigator } from './src/navigation/AppNavigator';
import { colors, defaultTenantTheme, TenantThemeContext } from './src/theme';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider style={styles.root}>
        <TenantThemeContext.Provider value={defaultTenantTheme}>
          <SessionProvider>
            <SyncProvider>
              <CartProvider>
                <AppNavigator />
              </CartProvider>
            </SyncProvider>
          </SessionProvider>
          <StatusBar style="light" />
        </TenantThemeContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
});
