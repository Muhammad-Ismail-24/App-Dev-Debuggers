import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authErrorMessage, SIMULATED_AUTH_ENABLED } from '../auth';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Button';
import { ServerAddressRow } from '../components/ServerAddressRow';
import { TextField } from '../components/TextField';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { useSession } from '../hooks/useSession';
import { colors, radii, spacing, useTenantTheme } from '../theme';

// Demo-role chips are required lazily so builds without simulated auth don't carry them.
const DevDemoChips = SIMULATED_AUTH_ENABLED ? (require('../dev/DevDemoChips') as typeof import('../dev/DevDemoChips')).DevDemoChips : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Phase = 'idle' | 'verifying' | 'success';

// Structure follows SCREEN_MAP "Login": dark full-bleed stage with a tenant gradient wash,
// brand + headline, then a native dark form and a single opaque white primary pill.
export function LoginScreen({ onSignedIn }: { onSignedIn?: () => void }) {
  const insets = useSafeAreaInsets();
  const tenant = useTenantTheme();
  const reduceMotion = useReducedMotion();
  const { verifyCredentials, establishSession, adapter } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [phase, setPhase] = useState<Phase>('idle');
  const [formError, setFormError] = useState<string | undefined>();
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const shake = useSharedValue(0);

  const emailError = touched.email && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : undefined;
  const passwordError = touched.password && password.length === 0 ? 'Enter your password.' : undefined;
  const valid = EMAIL_RE.test(email.trim()) && password.length > 0;

  const brandIn = useEnterAnimation(0);
  const formIn = useEnterAnimation(2);
  const footIn = useEnterAnimation(4);

  const formStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const submit = async () => {
    if (phase !== 'idle') return;
    setTouched({ email: true, password: true });
    if (!valid) return;
    setFormError(undefined);
    setPhase('verifying');
    try {
      const session = await verifyCredentials(email.trim(), password);
      // Loading → success: the button turns into "Signed in ✓" for a beat before the app swaps.
      setPhase('success');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 250 : 550));
      establishSession(session);
      onSignedIn?.();
    } catch (e) {
      setPhase('idle');
      setFormError(authErrorMessage(e));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // MOTION N7-style shake (3 × 60ms). Reduce Motion: message only.
      if (!reduceMotion) {
        shake.value = withSequence(
          withTiming(-8, { duration: 60 }),
          withTiming(8, { duration: 60 }),
          withTiming(-6, { duration: 60 }),
          withTiming(0, { duration: 60 }),
        );
      }
    }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <LinearGradient
        pointerEvents="none"
        colors={tenant.headerGradient}
        locations={tenant.headerGradientLocations}
        style={[styles.wash, { height: insets.top + 380 }]}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}
        >
          <Animated.View entering={brandIn} style={styles.brand}>
            <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AppText variant="title" style={styles.markText}>N</AppText>
            </View>
            <AppText variant="titleLarge" align="center" accessibilityRole="header" style={styles.headline}>
              Every match.{'\n'}Every club.
            </AppText>
            <AppText variant="body" tone="secondary" align="center">
              Sign in to follow fixtures, standings and clubs on {tenant.name}.
            </AppText>
          </Animated.View>

          <Animated.View entering={formIn}>
            <Animated.View style={[styles.form, formStyle]}>
              <TextField
                testID="login-email-input"
                label="Email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (formError) setFormError(undefined);
                }}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={emailError}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={phase === 'idle'}
              />
              <TextField
                ref={passwordRef}
                testID="login-password-input"
                label="Password"
                secure
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (formError) setFormError(undefined);
                }}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                error={passwordError}
                placeholder="Your password"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
                editable={phase === 'idle'}
              />

              {formError ? (
                <View style={styles.formError} accessibilityLiveRegion="assertive" testID="login-error">
                  <AppText variant="callout" tone="danger">{formError}</AppText>
                </View>
              ) : null}

              <PrimaryButton
                testID="login-submit-button"
                label={phase === 'success' ? 'Signed in' : 'Sign in'}
                icon={phase === 'success' ? 'checkmark.circle.fill' : undefined}
                loading={phase === 'verifying'}
                disabled={!valid && phase === 'idle'}
                onPress={submit}
                style={styles.submit}
              />
            </Animated.View>
          </Animated.View>

          <Animated.View entering={footIn}>
            <ServerAddressRow />
          </Animated.View>

          {adapter.kind === 'dev-simulated' && DevDemoChips ? (
            <Animated.View entering={footIn} style={styles.dev}>
              <AppText variant="caption" tone="secondary">
                Simulated sign-in (not connected to the backend). Tap a role to fill the email.
              </AppText>
              <DevDemoChips selectedEmail={email} onPick={(v) => { setEmail(v); setFormError(undefined); }} />
            </Animated.View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.85 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.gutter + 4, gap: spacing.xxxl },
  brand: { alignItems: 'center', gap: spacing.md },
  mark: { width: 64, height: 64, borderRadius: radii.card + 4, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 30, lineHeight: 36, fontWeight: '800' },
  headline: { fontSize: 32, lineHeight: 38 },
  form: { gap: spacing.lg },
  formError: { paddingVertical: spacing.xs },
  submit: { marginTop: spacing.xs },
  dev: { gap: spacing.sm },
});
