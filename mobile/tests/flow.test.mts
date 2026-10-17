import assert from 'node:assert/strict';
const r = new URL('../src', import.meta.url).pathname.replace(/\/$/, '');
const { validateRosterDraft, isValidDate } = await import(`${r}/roster/validation.ts`);
const { submitAction } = await import(`${r}/services/submitAction.ts`);
const { ApiError } = await import(`${r}/api/client.ts`);
const { explainErrorCode } = await import(`${r}/sync/errorMessages.ts`);
const { newId, isoSeconds } = await import(`${r}/utils/ids.ts`);
const { AUDIT_PATHS } = await import(`${r}/api/audit.ts`);

// ---- roster validation, in the spec's order ----
const ctx = { player: { squadId: 'sq-a', position: 'gk' }, transferWindow: { open: '2026-09-01', close: '2026-09-30' }, destinationCount: 3, maxSquadSize: 3, fromSquadPositionCounts: { gk: 1 }, requiredPositions: { gk: 1 } };
const base = { type: 'transfer' as const, fromSquadId: 'sq-a', toSquadId: 'sq-b', effectiveDate: '2026-09-30', loanEndDate: null, reason: 'x' };
assert.equal(validateRosterDraft({ ...base, effectiveDate: '30-09-2026' }, ctx)!.code, 'VALIDATION_ERROR');
assert.equal(validateRosterDraft({ ...base, effectiveDate: '2026-02-30' }, ctx)!.code, 'VALIDATION_ERROR');
assert.equal(validateRosterDraft({ ...base, toSquadId: null }, ctx)!.field, 'toSquadId');
assert.equal(validateRosterDraft({ ...base, type: 'loan', loanEndDate: '2026-09-30' }, ctx)!.field, 'loanEndDate');
assert.equal(validateRosterDraft({ ...base, reason: ' ' }, ctx)!.field, 'reason');
assert.equal(validateRosterDraft(base, { ...ctx, player: { ...ctx.player, squadId: 'sq-z' } })!.code, 'NOT_IN_SQUAD');
assert.equal(validateRosterDraft({ ...base, effectiveDate: '2026-10-01' }, ctx)!.code, 'TRANSFER_WINDOW_CLOSED');
assert.equal(validateRosterDraft({ ...base, effectiveDate: '2026-09-01' }, { ...ctx, destinationCount: 0, fromSquadPositionCounts: { gk: 2 } }), null, 'window is inclusive');
assert.equal(validateRosterDraft({ ...base, type: 'release', toSquadId: null, effectiveDate: '2027-01-01' }, { ...ctx, fromSquadPositionCounts: { gk: 2 } }), null, 'release allowed on any date');
assert.equal(validateRosterDraft(base, { ...ctx, player: { ...ctx.player, onLoan: true } })!.code, 'PLAYER_ON_LOAN');
assert.equal(validateRosterDraft(base, ctx)!.code, 'SQUAD_FULL');
assert.equal(validateRosterDraft(base, { ...ctx, destinationCount: 2 })!.code, 'MIN_POSITION_VIOLATION');
assert.equal(validateRosterDraft(base, { ...ctx, destinationCount: 2, fromSquadPositionCounts: { gk: 2 } }), null);
assert.ok(isValidDate('2028-02-29')); assert.ok(!isValidDate('2027-02-29'));

// ---- online/offline decision ----
const item: any = { actionId: 'a' };
let sent = 0, queued = 0;
const run = (o: any) => submitAction({ online: o.online, send: async () => { sent++; if (o.err) throw o.err; return { ok: 1 }; }, enqueue: async () => { queued++; if (o.storageFails) throw new Error('disk'); return item; } });
assert.equal((await run({ online: false })).kind, 'queued'); assert.equal(sent, 0, 'offline never calls the network');
assert.equal((await run({ online: true })).kind, 'sent');
assert.equal((await run({ online: true, err: new ApiError(0, 'NETWORK_ERROR', 'x') })).kind, 'queued');
assert.equal((await run({ online: true, err: new ApiError(503, 'HTTP_ERROR', 'x') })).kind, 'queued');
const rej: any = await run({ online: true, err: new ApiError(409, 'SQUAD_FULL', 'x') });
assert.equal(rej.kind, 'rejected'); assert.equal(rej.code, 'SQUAD_FULL'); assert.match(rej.message, /full/);
const q0 = queued; await run({ online: true, err: new ApiError(409, 'SQUAD_FULL', 'x') }); assert.equal(queued, q0, '4xx is never queued');
assert.equal((await run({ online: false, storageFails: true })).kind, 'storage_error', 'no silent in-memory fallback');

// ---- every Appendix B code has plain-language copy ----
const appendixB = 'VALIDATION_ERROR UNKNOWN_EVENT_TYPE INVALID_DISCOUNT_CODE UNAUTHENTICATED PAYMENT_DECLINED PAYMENT_CAPTURE_FAILED FORBIDDEN SPORT_NOT_FOUND MATCH_NOT_FOUND LEAGUE_NOT_FOUND EVENT_NOT_FOUND PLAYER_NOT_FOUND SQUAD_NOT_FOUND VARIANT_NOT_FOUND SPORT_EXISTS LEAGUE_EXISTS MATCH_EXISTS DUPLICATE_EVENT_ID DUPLICATE_ORDER_ID ILLEGAL_TRANSITION MATCH_NOT_IN_PROGRESS TIE_NOT_ALLOWED INNINGS_COMPLETE SERIES_ALREADY_DECIDED INVALID_COMPENSATION NO_VALID_PAIRING OUT_OF_STOCK CROSS_TENANT_TRANSFER NOT_IN_SQUAD TRANSFER_WINDOW_CLOSED PLAYER_ON_LOAN SQUAD_FULL MIN_POSITION_VIOLATION INVALID_BASE_VERSION PAYLOAD_TOO_LARGE RATE_LIMITED'.split(' ');
const generic = explainErrorCode('SOMETHING_UNKNOWN');
for (const c of appendixB) assert.notEqual(explainErrorCode(c), generic, `copy for ${c}`);

// ---- ids / timestamps / paths ----
assert.match(newId('evt'), /^[A-Za-z0-9_.:-]{1,64}$/); assert.ok(!newId('evt').includes('|'));
assert.match(isoSeconds(), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
assert.equal(AUDIT_PATHS.score('m 1'), '/audit/v1/score/m%201'); assert.equal(AUDIT_PATHS.offlineSync, '/audit/v1/offline-sync');
console.log('flow tests passed');
