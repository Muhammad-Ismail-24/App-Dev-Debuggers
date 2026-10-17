import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import type { EventBody, ScoreLogEntry } from '../api/audit';
import { canScoreMatches } from '../auth';
import { AppText } from '../components/AppText';
import { GlassButton, PrimaryButton, TextButton } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { SkeletonBlock } from '../components/LoadingState';
import { PressableScale } from '../components/PressableScale';
import { QueueStatusChip } from '../components/QueueStatusChip';
import { StackHeader } from '../components/StackHeader';
import { TextField } from '../components/TextField';
import { useLoad } from '../hooks/useLoad';
import { useSession } from '../hooks/useSession';
import { useSync } from '../hooks/useSync';
import type { RootStackScreenProps } from '../navigation/types';
import { humanize, isCorrectable, loadScoreWithCache, loadSportConfig, pendingForMatch, type LoadedScore } from '../services/scoring';
import type { SubmitOutcome } from '../services/submitAction';
import { explainErrorCode } from '../sync/errorMessages';
import { colors, radii, spacing } from '../theme';
import { newId } from '../utils/ids';

type Side = 'home' | 'away';
interface Notice { tone: 'ok' | 'pending' | 'error'; text: string }

const noticeFor = (o: SubmitOutcome<unknown>, what: string): Notice => {
  switch (o.kind) {
    case 'sent': return { tone: 'ok', text: `${what} recorded. Confirmed by the server.` };
    case 'queued': return { tone: 'pending', text: `${what} saved on this device and marked Pending. It will be sent when the server can be reached.` };
    case 'rejected': return { tone: 'error', text: o.message };
    case 'storage_error': return { tone: 'error', text: `Couldn't save this on the device (${o.message}). Nothing was queued.` };
  }
};

export function ScoringEntryScreen({ navigation, route }: RootStackScreenProps<'ScoringEntry'>) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const sync = useSync();
  const { matchId } = route.params;

  const load = useCallback(async (): Promise<LoadedScore> => {
    try {
      return await loadScoreWithCache(sync.store, matchId);
    } catch (e) {
      throw new Error(e instanceof ApiError ? (e.status === 0 ? "Couldn't reach the server and there is no saved copy of this match." : explainErrorCode(e.code)) : 'Could not load this match.');
    }
  }, [sync.store, matchId]);
  const { state, refreshing, refresh, retry } = useLoad<LoadedScore>(load);

  const allowed = session ? canScoreMatches(session.role) : false; // visibility only; the server enforces

  return (
    <View style={styles.root} testID="scoring-entry-screen">
      <StackHeader title="Scoring" onBack={() => navigation.goBack()} onConnectivityPress={() => navigation.navigate('SyncStatus')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textPrimary} />}
        >
          {!allowed ? <EmptyState icon="lock" title="Scoring isn't available for your role" message="Only league organizers and administrators can enter scores." testID="scoring-forbidden" /> : null}
          {allowed && state.status === 'loading' ? (
            <View style={styles.stack} testID="scoring-loading" accessible accessibilityRole="progressbar" accessibilityLabel="Loading match" accessibilityState={{ busy: true }}>
              <SkeletonBlock height={110} radius={radii.card} /><SkeletonBlock height={56} /><SkeletonBlock height={56} />
            </View>
          ) : null}
          {allowed && state.status === 'error' ? <ErrorState message={state.message} onRetry={retry} /> : null}
          {allowed && state.status === 'ready' ? <Loaded loaded={state.data} matchId={matchId} onChanged={retry} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Loaded({ loaded, matchId, onChanged }: { loaded: LoadedScore; matchId: string; onChanged: () => void }) {
  const { projection: p, stale, fetchedAt } = loaded;
  const sync = useSync();
  const config = useMemo(() => loadSportConfig(p.sport_id), [p.sport_id]);
  const pending = pendingForMatch(sync.items, matchId);
  const hasPendingStart = pending.some((i) => (i.payload as EventBody).type === 'match_start');

  const [side, setSide] = useState<Side>('home');
  const [eventType, setEventType] = useState<string>(config?.events[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const guard = useRef(false); // synchronous: a double tap can't submit twice

  const teamId = side === 'home' ? p.home.team_id : p.away.team_id;
  const canScore = p.status === 'in_progress' || (p.status === 'upcoming' && hasPendingStart);

  const submit = async (body: EventBody, summary: string, what: string) => {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    const out = await sync.submitScoreEvent(body, summary);
    guard.current = false;
    setBusy(false);
    setNotice(noticeFor(out, what));
    void Haptics.notificationAsync(out.kind === 'rejected' || out.kind === 'storage_error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
    if (out.kind === 'sent') onChanged();
  };

  const addScore = () => {
    if (!eventType.trim()) return setNotice({ tone: 'error', text: 'Choose or enter the event type.' });
    const label = humanize(eventType.trim());
    void submit(
      { event_id: newId('evt'), match_id: matchId, type: 'score', payload: { team_id: teamId, event_type: eventType.trim() } },
      `${label} for ${teamId}`,
      label,
    );
  };

  const correct = (entry: ScoreLogEntry) => {
    if (reason.trim().length === 0) return setNotice({ tone: 'error', text: 'Add a short reason for the correction.' });
    void submit(
      { event_id: newId('evt'), match_id: matchId, type: 'compensation', payload: { compensates: entry.event_id, reason: reason.trim() } },
      `Correct event ${entry.sequence} (${reason.trim()})`,
      'Correction',
    ).then(() => {
      setCorrecting(null);
      setReason('');
    });
  };

  const history = [...p.events].reverse();

  return (
    <View style={styles.stack}>
      {stale ? (
        <View style={styles.banner} testID="scoring-stale" accessibilityRole="alert">
          <Icon name="icloud.slash" size={16} color={colors.statusOffline} />
          <AppText variant="caption" style={styles.flex}>Showing the last copy saved on this device{fetchedAt ? ` (${fetchedAt.slice(11, 16)} UTC)` : ''}. Scores shown are server-confirmed only.</AppText>
        </View>
      ) : null}

      <Card style={styles.scoreCard} testID="scoring-summary">
        <AppText variant="caption" tone="secondary">{humanize(p.sport_id)} · {humanize(p.status)}{p.league_id ? ` · ${p.league_id}` : ''}</AppText>
        <View style={styles.scoreRow}>
          <ScoreSide label={p.home.team_id} score={p.home.score} extra={p.home.overs ? `${p.home.overs} ov` : undefined} />
          <AppText variant="title" tone="secondary">–</AppText>
          <ScoreSide label={p.away.team_id} score={p.away.score} extra={p.away.overs ? `${p.away.overs} ov` : undefined} />
        </View>
        <AppText variant="caption" tone="secondary">Version {p.version}</AppText>
      </Card>

      {notice ? (
        <View style={[styles.notice, notice.tone === 'error' && styles.noticeError, notice.tone === 'pending' && styles.noticePending]} accessibilityLiveRegion="polite" testID="scoring-notice">
          <Icon name={notice.tone === 'ok' ? 'checkmark.circle.fill' : notice.tone === 'pending' ? 'clock' : 'exclamationmark.triangle.fill'} size={18} color={notice.tone === 'ok' ? colors.success : notice.tone === 'pending' ? colors.statusOffline : colors.danger} />
          <AppText variant="callout" style={styles.flex}>{notice.text}</AppText>
        </View>
      ) : null}

      {p.status !== 'completed' ? (
        <View style={styles.stack}>
          {p.status === 'upcoming' && !hasPendingStart ? (
            <GlassButton testID="match-start-button" label="Start match" icon="play.fill" loading={busy} onPress={() => void submit({ event_id: newId('evt'), match_id: matchId, type: 'match_start', payload: {} }, 'Start match', 'Match start')} />
          ) : null}

          {canScore ? (
            <>
              <AppText variant="headline" accessibilityRole="header">Add event</AppText>
              <View style={styles.sides} accessibilityRole="radiogroup" accessibilityLabel="Team">
                {(['home', 'away'] as const).map((s) => (
                  <PressableScale key={s} testID={`side-${s}`} accessibilityRole="radio" accessibilityState={{ selected: side === s }} accessibilityLabel={`${s === 'home' ? 'Home' : 'Away'} team ${s === 'home' ? p.home.team_id : p.away.team_id}`} onPress={() => setSide(s)} style={[styles.side, side === s && styles.sideOn]}>
                    {side === s ? <Icon name="checkmark" size={13} weight="bold" /> : null}
                    <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>{s === 'home' ? 'Home' : 'Away'} · {s === 'home' ? p.home.team_id : p.away.team_id}</AppText>
                  </PressableScale>
                ))}
              </View>

              {config ? (
                <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Event type">
                  {config.events.map((ev) => (
                    <PressableScale key={ev.id} testID={`event-${ev.id}`} accessibilityRole="radio" accessibilityState={{ selected: eventType === ev.id }} accessibilityLabel={`${ev.label}${ev.hint ? `, ${ev.hint}` : ''}`} onPress={() => setEventType(ev.id)} style={[styles.event, eventType === ev.id && styles.sideOn]}>
                      <AppText variant="bodyStrong">{ev.label}</AppText>
                      {ev.hint ? <AppText variant="caption" tone="secondary">{ev.hint}</AppText> : null}
                    </PressableScale>
                  ))}
                </View>
              ) : (
                <TextField testID="event-type-input" label="Event type" helper="This sport's event list isn't available in the app yet. Enter the event type exactly as configured on the server." value={eventType} onChangeText={setEventType} autoCapitalize="none" autoCorrect={false} />
              )}

              <PrimaryButton testID="add-event-button" label="Add event" icon="plus" loading={busy} onPress={addScore} />
            </>
          ) : null}

          {p.status === 'in_progress' ? (
            <GlassButton testID="match-end-button" label="End match" icon="flag.checkered" loading={busy} onPress={() => void submit({ event_id: newId('evt'), match_id: matchId, type: 'match_end', payload: {} }, 'End match', 'Match end')} />
          ) : null}
        </View>
      ) : (
        <AppText variant="callout" tone="secondary">This match is finished. You can still correct earlier events below.</AppText>
      )}

      <View>
        <AppText variant="headline" accessibilityRole="header">History</AppText>
        {pending.map((i) => (
          <View key={i.actionId} style={styles.hrow} testID={`history-pending-${i.dedupeKey}`}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{i.summary}</AppText>
              <AppText variant="caption" tone="secondary">{i.status === 'rejected' ? 'Rejected by the server' : 'Not confirmed by the server yet'}</AppText>
            </View>
            <QueueStatusChip status={i.status} />
          </View>
        ))}
        {history.length === 0 && pending.length === 0 ? <EmptyState icon="clock" title="No events yet" testID="history-empty" /> : null}
        {history.map((e) => (
          <View key={e.event_id} style={styles.hrow} testID={`history-${e.event_id}`}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" style={e.compensated ? styles.struck : undefined}>
                #{e.sequence} {humanize(e.type)}{typeof e.payload.event_type === 'string' ? ` · ${humanize(e.payload.event_type)}` : ''}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {typeof e.payload.team_id === 'string' ? `${e.payload.team_id} · ` : ''}{e.compensated ? `Corrected by ${e.compensated_by}` : e.type === 'compensation' ? `Correction: ${String(e.payload.reason ?? '')}` : 'Confirmed'}
              </AppText>
              {correcting === e.event_id ? (
                <View style={styles.correct}>
                  <TextField testID="correction-reason-input" label="Reason for correction" value={reason} onChangeText={setReason} returnKeyType="done" />
                  <View style={styles.row}>
                    <PrimaryButton testID="correction-submit" label="Append correction" loading={busy} onPress={() => correct(e)} style={styles.flex} />
                    <TextButton label="Cancel" onPress={() => { setCorrecting(null); setReason(''); }} />
                  </View>
                  <AppText variant="caption" tone="secondary">The original event stays in the log; a new correcting event is added.</AppText>
                </View>
              ) : null}
            </View>
            {isCorrectable(e) && correcting !== e.event_id ? <TextButton testID={`correct-${e.event_id}`} label="Correct" tone="accent" onPress={() => { setCorrecting(e.event_id); setNotice(null); }} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function ScoreSide({ label, score, extra }: { label: string; score: number; extra?: string }) {
  return (
    <View style={styles.sideScore}>
      <AppText variant="caption" tone="secondary" numberOfLines={1}>{label}</AppText>
      <AppText variant="displayScore" numberOfLines={1} adjustsFontSizeToFit style={styles.bigScore}>{score}</AppText>
      {extra ? <AppText variant="caption" tone="secondary">{extra}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  stack: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.card, borderWidth: 1, borderColor: colors.statusOffline, backgroundColor: 'rgba(245,181,68,0.08)' },
  scoreCard: { backgroundColor: colors.bgRaised, gap: spacing.sm, alignItems: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, alignSelf: 'stretch', justifyContent: 'space-around' },
  sideScore: { alignItems: 'center', flex: 1 },
  bigScore: { fontSize: 44, lineHeight: 50 },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radii.card, borderWidth: 1, borderColor: colors.success, backgroundColor: 'rgba(61,214,140,0.08)' },
  noticeError: { borderColor: colors.danger, backgroundColor: 'rgba(255,107,107,0.08)' },
  noticePending: { borderColor: colors.statusOffline, backgroundColor: 'rgba(245,181,68,0.08)' },
  sides: { gap: spacing.sm },
  side: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: spacing.minTouchTarget + 4, paddingHorizontal: spacing.lg, borderRadius: radii.button - 4, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline },
  sideOn: { backgroundColor: colors.bgSelected, borderColor: 'rgba(255,255,255,0.5)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  event: { minWidth: '47%', flexGrow: 1, minHeight: spacing.minTouchTarget + 8, padding: spacing.md, borderRadius: radii.button - 4, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeHairline, justifyContent: 'center' },
  hrow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.strokeHairline },
  struck: { textDecorationLine: 'line-through', opacity: 0.6 },
  correct: { gap: spacing.sm, marginTop: spacing.sm },
});
