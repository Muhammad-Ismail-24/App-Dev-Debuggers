import { ApiError } from '../api/client';
import { explainErrorCode } from '../sync/errorMessages';
import type { QueueItem } from '../storage/offlineQueueRepository';

// What happened to a user action. "sent" is the only outcome that means the server confirmed it.
export type SubmitOutcome<R> =
  | { kind: 'sent'; response: R }
  | { kind: 'queued'; item: QueueItem; reason: 'offline' | 'unreachable' }
  | { kind: 'rejected'; code: string; message: string }
  | { kind: 'storage_error'; message: string };

interface Args<R> {
  online: boolean;
  send: () => Promise<R>;
  enqueue: () => Promise<QueueItem>;
}

// Online: try the real route first. If the server can't be reached (offline, timeout, 5xx) the
// action is saved to the persistent queue instead — safe because ids are client-chosen and the
// server replays identical requests idempotently. A genuine 4xx is shown to the user and NOT queued.
export async function submitAction<R>({ online, send, enqueue }: Args<R>): Promise<SubmitOutcome<R>> {
  const queue = async (reason: 'offline' | 'unreachable'): Promise<SubmitOutcome<R>> => {
    try {
      return { kind: 'queued', item: await enqueue(), reason };
    } catch (e) {
      return { kind: 'storage_error', message: e instanceof Error ? e.message : 'Offline storage is unavailable.' };
    }
  };
  if (!online) return queue('offline');
  try {
    return { kind: 'sent', response: await send() };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 0 || e.status >= 500) return queue('unreachable');
      return { kind: 'rejected', code: e.code, message: explainErrorCode(e.code) };
    }
    return queue('unreachable');
  }
}
