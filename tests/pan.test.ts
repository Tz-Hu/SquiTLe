import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panViewport } from '../lib/pan.ts';

test('leftward drag advances time; rightward drag reverses it smoothly', () => {
  assert.deepEqual(panViewport(200,-30.5,1000,54),{columns:0,scrollLeft:230.5});
  assert.deepEqual(panViewport(200,30.5,1000,54),{columns:0,scrollLeft:169.5});
});
test('rebasing at either edge preserves the exact visible date coordinate', () => {
  for (const width of [54,82]) for (const position of [0,400,1000]) for (const delta of [-3000,-.5,.5,3000]) {
    const next = panViewport(position,delta,1000,width);
    assert.ok(next.scrollLeft>=0&&next.scrollLeft<=1000);
    assert.equal(next.columns*width+next.scrollLeft,position-delta);
  }
});
