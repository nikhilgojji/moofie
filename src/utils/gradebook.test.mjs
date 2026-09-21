import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGroupGrade, groupPointTotals } from './gradebook.js';

const assignments = [1, 2, 3, 'manual'].map(id => ({ id, points: 10 }));
test('drop indicators come from the same calculation as the displayed total', () => {
  const values = { 1: 10, 2: 5, 3: 10, manual: 2 };
  const result = calculateGroupGrade(assignments, values, { dropLowest: 1 });
  assert.deepEqual(result.droppedAssignmentIds, ['manual']);
  assert.equal(result.earned, 25);
  assert.equal(result.possible, 30);
  assert.deepEqual(groupPointTotals(assignments, values, { dropLowest: 1 }), { earned: 25, possible: 30 });
  const changed = calculateGroupGrade(assignments, { ...values, manual: 10 }, { dropLowest: 1 });
  assert.deepEqual(changed.droppedAssignmentIds, [2]);
  assert.equal(changed.percent, 100);
});

test('blank, excused, omitted and never-drop assignments are not marked dropped', () => {
  const list = [...assignments, { id: 'excused', points: 10, excused: true }, { id: 'omitted', points: 10, omitted: true }];
  const result = calculateGroupGrade(list, { 1: '', 2: 5, 3: 10, manual: 2, excused: 0, omitted: 0 }, { dropLowest: 1, neverDrop: ['manual'] });
  assert.deepEqual(result.droppedAssignmentIds, [2]);
  assert.equal(result.earned, 12);
  assert.equal(result.possible, 20);
  assert.deepEqual(calculateGroupGrade(assignments, { 1: 5 }, { dropLowest: 1 }).droppedAssignmentIds, []);
  assert.deepEqual(calculateGroupGrade(assignments, { 1: 5, 2: 10 }).droppedAssignmentIds, []);
});

test('highest and multiple drops expose every excluded score', () => {
  assert.deepEqual(calculateGroupGrade(assignments, { 1: 9, 2: 5, 3: 10, manual: 2 }, { dropLowest: 1, dropHighest: 1 }).droppedAssignmentIds, ['manual', 3]);
});
