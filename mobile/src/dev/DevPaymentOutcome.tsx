// DEVELOPMENT ONLY — outcome picker shown on Checkout in __DEV__ builds.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { ChipRail } from '../components/ChipRail';
import { spacing } from '../theme';
import { getDevPaymentToken, setDevPaymentToken } from './paymentTokenChoice';
import type { MockPaymentToken } from '../store/mockPayment';

export function DevPaymentOutcome() {
  const [token, setToken] = useState<MockPaymentToken>(getDevPaymentToken());
  return (
    <View style={styles.wrap}>
      <AppText variant="caption" tone="secondary">Development only · simulated payment outcome</AppText>
      <ChipRail
        label="Simulated payment outcome"
        selectedId={token}
        onSelect={(id) => {
          setDevPaymentToken(id as MockPaymentToken);
          setToken(id as MockPaymentToken);
        }}
        options={[
          { id: 'tok_success', label: 'Succeeds' },
          { id: 'tok_declined', label: 'Declined' },
          { id: 'tok_capture_fail', label: 'Capture fails' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.sm } });
