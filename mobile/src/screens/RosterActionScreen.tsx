import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RosterChange, TransferBody } from '../api/audit';
import { canManageRoster } from '../auth';
import { AppText } from '../components/AppText';
import { PrimaryButton, TextButton } from '../components/Button';
import { ChipRail } from '../components/ChipRail';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { SkeletonBlock } from '../components/LoadingState';
import { TextField } from '../components/TextField';
import { devSportsRepository } from '../data/devSportsRepository';
import type { SportsRepository } from '../data/sportsRepository';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import { useSync } from '../hooks/useSync';
import type { RootStackScreenProps } from '../navigation/types';
import { validateRosterDraft } from '../roster/validation';
import type { SubmitOutcome } from '../services/submitAction';
import { colors, radii, spacing } from '../theme';
import type { ClubProfileData } from '../types/league';
import { newId } from '../utils/ids';

const TITLE = { transfer: 'Transfer player', loan: 'Loan player', release: 'Release player' } as const;
const today = () => new Date().toISOString().slice(0, 10);

type Result = { tone: 'ok' | 'pending' | 'error'; text: string; done: boolean };

// Presented as a modal sheet. Sends POST /audit/v1/roster/transfer when the server is reachable;
// otherwise the same body is saved to the persistent queue. Local checks run in the spec's order;
// the server's decision is final.
export function RosterActionScreen({ navigation, route, repository = devSportsRepository }: RootStackScreenProps<'RosterAction'> & { repository?: SportsRepository }) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { clubId, playerId, action } = route.params as { clubId: string; playerId: string; action: RosterChange };
  const load = useCallback(() => repository.loadClub(session!, clubId), [repository, session, clubId]);
  const { state, retry } = useLoad<ClubProfileData>(load);
  const allowed = session ? canManageRoster(session.role) : false;

  return (
    <View style={styles.root} testID="roster-action-screen">
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">{TITLE[action]}</AppText>
        <TextButton testID="roster-action-close" label="Close" tone="accent" onPress={() => navigation.goBack()} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
          {!allowed ? <EmptyState icon="lock" title="Not available for your role" message="Only club managers and administrators can change a roster." /> : null}
          {allowed && state.status === 'loading' ? <SkeletonBlock height={200} radius={radii.card} /> : null}
          {allowed && state.status === 'error' ? <ErrorState message={state.message} onRetry={retry} /> : null}
          {allowed && state.status === 'ready' ? <Form data={state.data} playerId={playerId} action={action} onDone={() => navigation.goBack()} onOpenQueue={() => navigation.replace('SyncStatus')} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Form({ data, playerId, action, onDone, onOpenQueue }: { data: ClubProfileData; playerId: string; action: 'transfer' | 'loan' | 'release'; onDone: () => void; onOpenQueue: () => void }) {
  const { session } = useSession();
  const sync = useSync();
  const player = data.roster.find((p) => p.id === playerId);
  const ctx = data.rosterContext;

  const [toSquadId, setToSquadId] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [loanEndDate, setLoanEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<{ field?: string; message: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const guard = useRef(false);
  const idRef = useRef<{ key: string; id: string } | null>(null);

  if (!player || !ctx) return <EmptyState icon="person.crop.circle" title="Player not found" message="Go back and refresh the roster." />;

  const destName = ctx.otherSquads.find((s) => s.squadId === toSquadId)?.name;

  const submit = async () => {
    if (guard.current || result?.done) return;
    const draft = { type: action, fromSquadId: ctx.squadId, toSquadId: action === 'release' ? null : toSquadId, effectiveDate: effectiveDate.trim(), loanEndDate: action === 'loan' ? loanEndDate.trim() : null, reason };
    const positionCounts = data.roster.reduce<Record<string, number>>((m, p) => ({ ...m, [p.position]: (m[p.position] ?? 0) + 1 }), {});
    const problem = validateRosterDraft(draft, {
      player: { squadId: player.squadId ?? ctx.squadId, position: player.position, onLoan: player.onLoan },
      transferWindow: ctx.transferWindow,
      destinationCount: ctx.otherSquads.find((s) => s.squadId === toSquadId)?.playerCount,
      maxSquadSize: ctx.maxSquadSize,
      fromSquadPositionCounts: positionCounts,
      requiredPositions: ctx.requiredPositions,
    });
    if (problem) {
      setIssue({ field: problem.field, message: problem.message });
      setResult(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setIssue(null);

    // Same form contents → same request_id, so a retry replays instead of duplicating.
    const key = JSON.stringify(draft);
    if (idRef.current?.key !== key) idRef.current = { key, id: newId('tr') };
    const body: TransferBody = {
      request_id: idRef.current.id, league_id: ctx.leagueId, player_id: player.id, type: action,
      from_squad_id: ctx.squadId, to_squad_id: draft.toSquadId, effective_date: draft.effectiveDate,
      loan_end_date: draft.loanEndDate, reason: reason.trim(), requested_by: session!.userId,
    };
    const summary = `${action === 'transfer' ? 'Transfer' : action === 'loan' ? 'Loan' : 'Release'} ${player.name}${destName ? ` to ${destName}` : ''}`;

    guard.current = true;
    setBusy(true);
    const out: SubmitOutcome<unknown> = await sync.submitRosterTransfer(body, summary);
    guard.current = false;
    setBusy(false);

    if (out.kind === 'sent') {
      const r = out.response as { state?: string; blocking_match_id?: string | null };
      setResult({ tone: 'ok', done: true, text: r.state === 'deferred_until_match_end' ? `Accepted by the server. It takes effect when match ${r.blocking_match_id} ends; ${player.name} stays eligible for it.` : 'Done. Confirmed by the server.' });
    } else if (out.kind === 'queued') {
      setResult({ tone: 'pending', done: true, text: `Saved on this device and marked Pending. It will be sent when the server can be reached, and the server may still reject it. Nothing is confirmed yet.` });
    } else if (out.kind === 'rejected') {
      setResult({ tone: 'error', done: false, text: out.message });
    } else {
      setResult({ tone: 'error', done: false, text: `Couldn't save this on the device (${out.message}). Nothing was queued.` });
    }
    void Haptics.notificationAsync(out.kind === 'sent' || out.kind === 'queued' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
  };

  const fieldErr = (f: string) => (issue?.field === f ? issue.message : undefined);

  return (
    <View style={styles.stack}>
      <View>
        <AppText variant="bodyStrong">{player.name}</AppText>
        <AppText variant="caption" tone="secondary">{player.position} · {data.club.name}</AppText>
      </View>

      {action !== 'release' ? (
        <View style={styles.field}>
          <AppText variant="caption" tone="secondary">Destination squad</AppText>
          {ctx.otherSquads.length > 0 ? (
            <ChipRail label="Destination squad" selectedId={toSquadId ?? ''} onSelect={setToSquadId} options={ctx.otherSquads.map((s) => ({ id: s.squadId, label: s.name }))} />
          ) : (
            <AppText variant="callout" tone="secondary">No other squads are listed for this league.</AppText>
          )}
          {fieldErr('toSquadId') ? <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">{fieldErr('toSquadId')}</AppText> : null}
        </View>
      ) : (
        <AppText variant="callout" tone="secondary">The player will leave the league. This can't be done for a player who is on loan.</AppText>
      )}

      <TextField testID="roster-effective-date" label="Effective date" helper="YYYY-MM-DD" value={effectiveDate} onChangeText={setEffectiveDate} error={fieldErr('effectiveDate')} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" editable={!busy} />
      {action === 'loan' ? <TextField testID="roster-loan-end" label="Loan ends" helper="YYYY-MM-DD, after the effective date" value={loanEndDate} onChangeText={setLoanEndDate} error={fieldErr('loanEndDate')} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" editable={!busy} /> : null}
      <TextField testID="roster-reason" label="Reason" value={reason} onChangeText={setReason} error={fieldErr('reason')} returnKeyType="done" editable={!busy} />

      {ctx.transferWindow && action !== 'release' ? <AppText variant="caption" tone="secondary">Transfer window: {ctx.transferWindow.open} to {ctx.transferWindow.close}</AppText> : null}

      {result ? (
        <View style={[styles.notice, result.tone === 'error' && styles.err, result.tone === 'pending' && styles.pend]} accessibilityLiveRegion="polite" testID="roster-result">
          <Icon name={result.tone === 'ok' ? 'checkmark.circle.fill' : result.tone === 'pending' ? 'clock' : 'exclamationmark.triangle.fill'} size={18} color={result.tone === 'ok' ? colors.success : result.tone === 'pending' ? colors.statusOffline : colors.danger} />
          <AppText variant="callout" style={styles.flex}>{result.text}</AppText>
        </View>
      ) : null}

      {result?.done ? (
        <>
          <PrimaryButton testID="roster-done" label="Done" onPress={onDone} />
          {result.tone === 'pending' ? <TextButton testID="roster-view-queue" label="View sync queue" tone="accent" onPress={onOpenQueue} /> : null}
        </>
      ) : (
        <PrimaryButton testID="roster-submit" label={action === 'release' ? 'Release player' : action === 'loan' ? 'Confirm loan' : 'Confirm transfer'} loading={busy} onPress={submit} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.gutter, paddingRight: spacing.sm, paddingTop: spacing.sm },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  stack: { gap: spacing.lg },
  field: { gap: spacing.sm },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radii.card, borderWidth: 1, borderColor: colors.success, backgroundColor: 'rgba(61,214,140,0.08)' },
  err: { borderColor: colors.danger, backgroundColor: 'rgba(255,107,107,0.08)' },
  pend: { borderColor: colors.statusOffline, backgroundColor: 'rgba(245,181,68,0.08)' },
});
