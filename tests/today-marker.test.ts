import test from 'node:test';
import assert from 'node:assert/strict';
import {millisecondsUntilNextTodayMarker,todayMarkerFraction} from '../lib/presentation/today-marker.ts';

test('today marker advances at 0, 6, 12, and 18 o’clock', () => {
  assert.equal(todayMarkerFraction(new Date(2026,0,2,0,0)),0);
  assert.equal(todayMarkerFraction(new Date(2026,0,2,5,59)),0);
  assert.equal(todayMarkerFraction(new Date(2026,0,2,6,0)),.25);
  assert.equal(todayMarkerFraction(new Date(2026,0,2,12,0)),.5);
  assert.equal(todayMarkerFraction(new Date(2026,0,2,18,0)),.75);
  assert.equal(todayMarkerFraction(new Date(2026,0,2,23,59)),.75);
});

test('today marker schedules the next six-hour boundary', () => {
  assert.equal(millisecondsUntilNextTodayMarker(new Date(2026,0,2,5,59,59,500)),500);
  assert.equal(millisecondsUntilNextTodayMarker(new Date(2026,0,2,6,0,0,0)),6*60*60*1000);
  assert.equal(millisecondsUntilNextTodayMarker(new Date(2026,0,2,23,0,0,0)),60*60*1000);
});
