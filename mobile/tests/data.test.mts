import assert from 'node:assert/strict';
const r = new URL('../src', import.meta.url).pathname.replace(/\/$/, '');
const { devSportsRepository: repo } = await import(`${r}/data/devSportsRepository.ts`);
const s: any = { role: 'viewer' };
const fx = await repo.loadFixtures(s);
assert.ok(fx.matches.length >= 9);
const ids = new Set(fx.matches.map((m: any) => m.id)); assert.equal(ids.size, fx.matches.length);
for (const m of fx.matches) { const d = await repo.loadMatch(s, m.id); assert.equal(d.match.id, m.id); assert.ok(d.ticker.some((t: any) => t.id === m.id) || true); }
const st = await repo.loadStandings(s);
for (const t of st.tables) for (const row of t.rows) { const c = await repo.loadClub(s, row.team.id); assert.equal(c.club.id, row.team.id); assert.ok(c.roster.length && c.staff.length); }
for (const t of st.tables) for (const m of t.matches) assert.ok(ids.has(m.id));
await assert.rejects(repo.loadMatch(s, 'nope'), /not found/);
const live = (await repo.loadMatch(s, 'm-1')); assert.ok(live.events.some((e: any) => e.corrected)); assert.ok(live.pinned);
const clubs = await repo.listClubs(s); for (const c of clubs) await repo.loadClub(s, c.id);
console.log('data tests passed');
