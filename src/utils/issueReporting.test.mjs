import test from 'node:test';
import assert from 'node:assert/strict';
import { createIssueReporter, sanitizeIssue, classifyIssue, setIssueReporter } from './issueReporting.js';
import { recoverCanvasRead, resetCanvasSync } from './canvasSync.js';

test('reports contain only enum categories, even when errors contain private data', () => {
  const secret = 'Student name, grade 97, https://canvas.example/files/123?token=secret';
  assert.deepEqual(sanitizeIssue({ area: secret, code: secret, kind: secret, message: secret, courseId: 123 }, 375), {
    area: 'app', code: 'unknown', kind: 'none', device: 'mobile',
  });
  assert.equal(classifyIssue({ message: `Failed to fetch ${secret}` }), 'network');
  assert.equal(classifyIssue({ status: 403 }), 'access');
});

function setup(send) {
  let clock = 0;
  const tasks = new Map(); let nextId = 0;
  const reporter = createIssueReporter({ send, now: () => clock, schedule: fn => { tasks.set(++nextId, fn); return nextId; }, cancel: id => tasks.delete(id) });
  reporter.session(true);
  return { reporter, tasks, advance: ms => { clock += ms; } };
}
test('deduplicates failures, batches and caps volume, resets after ten minutes', async () => {
  const sent = [];
  const { reporter, advance } = setup(async batch => sent.push(...batch));
  for (let n = 0; n < 50; n++) reporter.report({ area: 'preview', code: 'render' });
  await reporter.flush(); assert.equal(sent.length, 1);
  for (const area of ['app','preview','dashboard','course_file','course_page']) for (const code of ['network','timeout','partial','render','unknown']) reporter.report({ area, code });
  await reporter.flush(); await reporter.flush(); assert.equal(sent.length, 20);
  advance(600_001); reporter.report({ area: 'preview', code: 'render' });
  await reporter.flush(); assert.equal(sent.length, 21);
  reporter.dispose();
});
test('report transport retries only once and sign out drops pending reports', async () => {
  let calls = 0;
  const { reporter } = setup(async () => { calls++; throw Error('offline'); });
  reporter.report({ area: 'app', code: 'render' });
  await reporter.flush(); await reporter.flush(); await reporter.flush();
  assert.equal(calls, 2);
  reporter.report({ area: 'preview', kind: 'pdf', code: 'render' });
  reporter.session(false); await reporter.flush(); assert.equal(calls, 2);
});
test('account change while sending does not retry the previous account report', async () => {
  let rejectSend, calls = 0;
  const { reporter } = setup(() => { calls++; return new Promise((_resolve, reject) => { rejectSend = reject; }); });
  reporter.report({ area: 'course_file', code: 'network' });
  const flushing = reporter.flush();
  reporter.session(false); reporter.session(true); rejectSend(Error('network'));
  await flushing; await reporter.flush(); assert.equal(calls, 1);
  reporter.dispose();
});
test('Canvas recovery reports exhausted failures and partial loads, not successful retries or mutations', async () => {
  const reports = []; setIssueReporter({ report: value => reports.push(value) }); resetCanvasSync();
  const options = { sleep: async () => {}, random: () => 0 };
  let tries = 0;
  try {
    await recoverCanvasRead('dashboard', {}, async () => { if (++tries < 3) throw Error('network'); return {}; }, options);
    assert.equal(reports.length, 0);
    await assert.rejects(recoverCanvasRead('dashboard', {}, async () => { throw Error('network private URL'); }, options));
    await recoverCanvasRead('dashboard', {}, async () => ({ _sync: { partial: true } }), options);
    await assert.rejects(recoverCanvasRead('connect', {}, async () => { throw Error('network'); }, options));
    assert.deepEqual(reports, [{ area: 'dashboard', code: 'network' }, { area: 'dashboard', code: 'partial' }]);
  } finally { setIssueReporter(undefined); resetCanvasSync(); }
});
