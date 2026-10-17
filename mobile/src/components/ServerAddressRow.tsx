import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { getApiBaseUrl, getHealth, setApiBaseUrl } from '../api/client';
import { describeHealthError } from '../api/connectionMessages';
import { colors, spacing } from '../theme';
import { AppText } from './AppText';
import { GlassButton } from './Button';
import { Icon } from './Icon';
import { TextField } from './TextField';

type Health = { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok' } | { kind: 'error'; message: string };

// Collapsible "Server address" row (PDF §8.1: the API URL must be changeable before sign-in).
// Uses the one centralized client (getApiBaseUrl / setApiBaseUrl / getHealth) — no second client.
export function ServerAddressRow() {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(getApiBaseUrl());
  const [health, setHealth] = useState<Health>({ kind: 'idle' });

  const test = async () => {
    setApiBaseUrl(url);
    setUrl(getApiBaseUrl());
    setHealth({ kind: 'checking' });
    try {
      const res = await getHealth();
      setHealth(res.status === 'ok' ? { kind: 'ok' } : { kind: 'error', message: describeHealthError(null) });
    } catch (e) {
      setHealth({ kind: 'error', message: describeHealthError(e) });
    }
  };

  return (
    <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(220)} style={styles.wrap}>
      <Pressable
        testID="server-address-toggle"
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel="Server address"
        accessibilityHint={open ? 'Hides the server address' : 'Shows the server address'}
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        <Icon name="server.rack" size={16} color={colors.textSecondary} />
        <AppText variant="callout" tone="secondary" style={styles.title}>Server address</AppText>
        <Icon name={open ? 'chevron.up' : 'chevron.down'} size={13} color={colors.textSecondary} weight="semibold" />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={styles.body}>
          <TextField
            testID="login-server-url-input"
            label="API base URL"
            helper="Example: http://192.168.1.20:8080 (the backend laptop's LAN IP)"
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setHealth({ kind: 'idle' });
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={test}
          />
          <GlassButton testID="login-test-connection" label="Test connection" loading={health.kind === 'checking'} onPress={test} />
          {health.kind === 'ok' || health.kind === 'error' ? (
            <View style={styles.result} accessibilityLiveRegion="polite">
              <Icon
                name={health.kind === 'ok' ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'}
                size={18}
                color={health.kind === 'ok' ? colors.success : colors.danger}
              />
              <AppText variant="callout" tone={health.kind === 'ok' ? 'success' : 'primary'} style={styles.title}>
                {health.kind === 'ok' ? 'Connected to the NaSCon server.' : health.message}
              </AppText>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: spacing.minTouchTarget },
  title: { flex: 1 },
  body: { gap: spacing.md },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
