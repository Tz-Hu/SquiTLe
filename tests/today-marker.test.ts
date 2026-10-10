import test from 'node:test';
import assert from 'node:assert/strict';
import {millisecondsUntilNextTodayMarker,todayMarkerFraction,TODAY_BAND_DAYS,restoreTodayMarkerStyle} from '../lib/presentation/today-marker.ts';

test('15:30 marks 15:00–17:00 and advances only at the next hour',()=>{
  const start=todayMarkerFraction(new Date(2026,9,8,15,30));
  assert.equal(start,15/24);
  assert.equal(start+TODAY_BAND_DAYS,17/24);
  assert.equal(todayMarkerFraction(new Date(2026,9,8,15,59)),start);
  assert.equal(todayMarkerFraction(new Date(2026,9,8,16)),16/24);
  for(const pixelsPerDay of [36,54,80,54/7])assert.ok(Math.abs(TODAY_BAND_DAYS*pixelsPerDay-pixelsPerDay/12)<1e-10);
});
test('marker updates at the next hour including midnight and month rollover',()=>{
  assert.equal(millisecondsUntilNextTodayMarker(new Date(2026,0,2,5,59,59,500)),500);
  assert.equal(millisecondsUntilNextTodayMarker(new Date(2026,0,2,6)),3600000);
  assert.equal(millisecondsUntilNextTodayMarker(new Date(2026,0,31,23,30)),1800000);
  assert.equal(todayMarkerFraction(new Date(2026,1,1,0)),0);
  assert.ok(todayMarkerFraction(new Date(2026,0,31,23))+TODAY_BAND_DAYS>1);
});
test('saved line mode is preserved and legacy settings use band mode',()=>{
  assert.equal(restoreTodayMarkerStyle('line'),'line');
  for(const value of ['band',undefined,null,'invalid'])assert.equal(restoreTodayMarkerStyle(value),'band');
});
