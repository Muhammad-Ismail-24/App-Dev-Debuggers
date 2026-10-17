import { useNavigation } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ROLE_LABELS } from '../auth';
import { useSession } from '../hooks/useSession';
import { useCart } from '../hooks/useCart';
import { useSync } from '../hooks/useSync';
import { getApiBaseUrl, getHealth, setApiBaseUrl } from '../api/client';
import { describeHealthError } from '../api/connectionMessages';
import { AppText } from '../components/AppText';
import { GlassButton, PrimaryButton } from '../components/Button';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { TextField } from '../components/TextField';
import { colors, spacing } from '../theme';

type HealthState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

// Profile tab root: account + sign-out, sync status entry, and the in-app server address
// required by PDF §8.1.
export function SettingsScreen() {
  const { session, signOut } = useSession();
  const navigation = useNavigation();
  const { unsyncedCount } = useSync();
  const { dispatch: cartDispatch } = useCart();
  const [baseUrl, setBaseUrl] = useState(getApiBaseUrl());
  const [health, setHealth] = useState<HealthState>({ kind: 'idle' });

  const checkHealth = useCallback(async () => {
    setApiBaseUrl(baseUrl);
    setHealth({ kind: 'checking' });
    try {
      const res = await getHealth();
      setHealth(res.status === 'ok' ? { kind: 'ok' } : { kind: 'error', message: describeHealthError(null) });
    } catch (e) {
      setHealth({ kind: 'error', message: describeHealthError(e) });
    }
  }, [baseUrl]);

  return (
    <Screen title="Profile" testID="settings-screen">
      <View style={styles.section}>
        <SectionHeader title="Offline & sync" />
        <GlassButton
          testID="open-sync-status"
          label={unsyncedCount > 0 ? `Sync status (${unsyncedCount} waiting)` : 'Sync status'}
          icon="arrow.triangle.2.circlepath"
          onPress={() => navigation.navigate('SyncStatus' as never)}
        />
      </View>
      {session ? (
        <View style={styles.section}>
          <SectionHeader title="Account" />
          <Card style={styles.card}>
            <AppText variant="bodyStrong">{session.displayName}</AppText>
            <AppText variant="callout" tone="secondary">{session.email}</AppText>
            <AppText variant="callout" testID="profile-role">{ROLE_LABELS[session.role]}</AppText>
            {session.source === 'dev-simulated' ? (
              <AppText variant="caption" tone="secondary">Simulated development session. Not verified by the backend.</AppText>
            ) : null}
            <GlassButton
              testID="sign-out-button"
              label="Sign out"
              icon="rectangle.portrait.and.arrow.right"
              onPress={() =>
                Alert.alert(
                  'Sign out?',
                  unsyncedCount > 0
                    ? `${unsyncedCount} change${unsyncedCount === 1 ? ' hasn' : 's haven'}'t been confirmed by the server yet. They stay saved on this device and will sync later. Your cart will be emptied.`
                    : 'Your cart will be emptied and you will need to sign in again.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Sign out',
                      style: 'destructive',
                      onPress: () => {
                        cartDispatch({ type: 'clear' });
                        signOut();
                      },
                    },
                  ],
                )
              }
            />
          </Card>
        </View>
      ) : null}
      <View style={styles.section}>
        <SectionHeader title="Server connection" />
        <Card style={styles.card}>
          <TextField
            testID="api-base-url-input"
            label="Server address"
            helper="Example: http://192.168.1.20:8080"
            value={baseUrl}
            onChangeText={setBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={checkHealth}
          />
          <PrimaryButton
            testID="health-check-button"
            label="Test connection"
            onPress={checkHealth}
            loading={health.kind === 'checking'}
          />
          <HealthResult state={health} />
        </Card>
      </View>
    </Screen>
  );
}

function HealthResult({ state }: { state: HealthState }) {
  if (state.kind === 'idle' || state.kind === 'checking') {
    return (
      <AppText testID="health-status" variant="callout" tone="secondary" accessibilityLiveRegion="polite">
        {state.kind === 'idle' ? 'Not tested yet.' : 'Contacting the server…'}
      </AppText>
    );
  }
  const ok = state.kind === 'ok';
  return (
    <View style={styles.result} accessibilityLiveRegion="polite">
      <Icon
        name={ok ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'}
        size={18}
        color={ok ? colors.success : colors.danger}
      />
      <AppText testID="health-status" variant="callout" tone={ok ? 'success' : 'primary'} style={styles.resultText}>
        {ok ? 'Connected to the NaSCon server.' : state.message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { gap: spacing.lg, padding: spacing.lg },
  result: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  resultText: { flex: 1 },
});
