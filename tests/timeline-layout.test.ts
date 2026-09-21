import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampTaskColumnWidth,
  collapsedSummaryBounds,
  COLLAPSED_PROJECT_HEIGHT,
  TASK_COLUMN_MAX,
  TASK_COLUMN_MIN,
} from '../lib/presentation/timeline-layout.ts';

test('task column width respects its normal limits', () => {
  assert.equal(clampTaskColumnWidth(100,1400),TASK_COLUMN_MIN);
  assert.equal(clampTaskColumnWidth(280,1400),280);
  assert.equal(clampTaskColumnWidth(900,1400),TASK_COLUMN_MAX);
});

test('task column leaves usable room for the timeline', () => {
  assert.equal(clampTaskColumnWidth(420,760),280);
  assert.equal(clampTaskColumnWidth(420,600),TASK_COLUMN_MIN);
});

test('collapsed projects keep one readable text line while staying compact', () => {
  assert.equal(COLLAPSED_PROJECT_HEIGHT,22);
  assert.ok(COLLAPSED_PROJECT_HEIGHT<=64/2);
  assert.deepEqual(collapsedSummaryBounds(32),{top:2,bottom:20,height:18});
});
