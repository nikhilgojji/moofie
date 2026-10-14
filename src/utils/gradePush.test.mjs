import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { isExcludedCourse, numericScore, submissionScore } from '../../supabase/functions/_shared/gradeData.js';
import { gradeSnapshots, gradeChanged, gradeKey, notificationFor } from '../../supabase/functions/_shared/gradeNotifications.js';

function worker({ failPush = false, failRead = false, firstRun = false } = {}) {
  const course = { id: 1, name: 'PHYS 009', grade: 80, letter: 'B', assignments: [{ id: 2, title: 'Quiz', points: 10, earned: 8, grade: '8', gradedAt: '2026-10-01T12:00:00Z' }] };
  const tables = {
    canvas_connections: [{ user_id: 'A', canvas_url: 'https://canvas.example' }],
    grade_notification_state: firstRun ? [] : gradeSnapshots([course], 'A'),
    grade_notification_runs: firstRun ? [] : [{ user_id: 'A', last_checked_at: '2026-10-01', snapshot_version: 2 }],
    push_subscriptions: [{ user_id: 'A', endpoint: 'https://push.example/test', p256dh: 'test', auth: 'test' }],
  };
  const actions = [];
  const admin = { rpc: async () => ({ data: true }), from(table) {
    let operation = 'read', values, single = false, range;
    const query = {
      select() { return query; }, order() { return query; }, eq() { return query; },
      range(start, end) { range = [start, end]; return query; },
      maybeSingle() { single = true; return query; },
      upsert(rows) { operation = 'write'; values = Array.isArray(rows) ? rows : [rows]; return query; },
      delete() { operation = 'delete'; return query; },
      then(resolve, reject) {
        if (failRead && table === 'grade_notification_state' && operation === 'read') return Promise.resolve({ error: Error('Read failed') }).then(resolve, reject);
        if (operation !== 'read') { actions.push(`${operation}:${table}`); tables[table] = values || []; }
        const data = range ? tables[table].slice(range[0], range[1] + 1) : tables[table];
        return Promise.resolve({ data: single ? data[0] || null : data }).then(resolve, reject);
      },
    };
    return query;
  } };
  const webpush = { setVapidDetails() {}, async sendNotification(_subscription, payload) {
    actions.push('push');
    if (failPush) throw Error('Temporary push failure');
    actions.push(JSON.parse(payload));
  } };
  let handler;
  const Deno = { env: { get: () => 'test' }, serve: callback => { handler = callback; } };
  let source = readFileSync(new URL('../../supabase/functions/grade-notifications/index.ts', import.meta.url), 'utf8');
  source = source.slice(source.indexOf('type Connection'));
  // Isolate credential decryption; execute the real Canvas mapping and handler.
  source = source.replace(/async function decryptToken[\s\S]*?function nextPageUrl/, 'async function decryptToken() { return "test-only"; }\nfunction nextPageUrl');
  const fetch = async url => Response.json(String(url).includes('/assignment_groups')
    ? [{ assignments: [
      { id: 2, name: 'Quiz', points_possible: 10, submission: { score: 9, grade: '9', workflow_state: 'graded', graded_at: '2026-10-01T12:00:00Z' } },
      { id: 3, name: 'New pending assignment', points_possible: 20, submission: { score: 0, workflow_state: 'pending_review' } },
    ] }]
    : [{ id: 1, name: 'PHYS 009', workflow_state: 'available', enrollments: [{ type: 'student', computed_current_score: 90, computed_current_grade: 'A' }] }]);
  new Function('createClient', 'webpush', 'Deno', 'isExcludedCourse', 'numericScore', 'submissionScore', 'gradeSnapshots', 'gradeChanged', 'gradeKey', 'notificationFor', 'fetch', stripTypeScriptTypes(source))(
    () => admin, webpush, Deno, isExcludedCourse, numericScore, submissionScore, gradeSnapshots, gradeChanged, gradeKey, notificationFor, fetch,
  );
  return { actions, tables, run: () => handler(new Request('https://moofie.example/push', { method: 'POST' })) };
}

test('push worker sends new grade values before checkpointing, then deduplicates', async () => {
  const job = worker();
  const result = await (await job.run()).json();
  assert.equal(result.notificationsSent, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(job.actions[0], 'push');
  assert.equal(job.actions[1].title, '2 grade updates');
  assert.equal(job.tables.grade_notification_state.find(row => row.assignment_id === 3).score, null);
  assert.equal((await (await job.run()).json()).notificationsSent, 0);
});
test('push failure keeps prior snapshots for retry; failed state reads never manufacture notifications', async () => {
  for (const options of [{ failPush: true }, { failRead: true }]) {
    const job = worker(options);
    assert.equal((await (await job.run()).json()).failures.length, 1);
    assert.ok(!job.actions.some(action => typeof action === 'string' && action.startsWith('write:')));
    assert.equal(job.tables.grade_notification_state[0].score, 80);
  }
});
test('first background check establishes a baseline without flooding old grades', async () => {
  const job = worker({ firstRun: true });
  assert.equal((await (await job.run()).json()).notificationsSent, 0);
  assert.equal(job.tables.grade_notification_runs[0].snapshot_version, 2);
});
