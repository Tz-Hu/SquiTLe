import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horizontalWheelDelta, panViewport, windowScrollLimit } from '../lib/presentation/pan.ts';

test('leftward drag advances time; rightward drag reverses it smoothly', () => {
  assert.deepEqual(panViewport(200,-30.5,1000,54),{columns:0,scrollLeft:230.5});
  assert.deepEqual(panViewport(200,30.5,1000,54),{columns:0,scrollLeft:169.5});
});
test('rebasing at either edge preserves the exact visible date coordinate', () => {
  for (const width of [6,54,82]) for (const position of [0,400,1000]) for (const delta of [-3000,-.5,.5,3000]) {
    const next = panViewport(position,delta,1000,width);
    assert.ok(next.scrollLeft>=0&&next.scrollLeft<=1000);
    assert.equal(next.columns*width+next.scrollLeft,position-delta);
  }
});

test('long past-to-future round trips stay inside the rendered window', () => {
  for (const width of [6,54,82]) {
    const count=Math.max(35,Math.ceil(1200/width)+14);
    const max=windowScrollLimit(count*width,1200);
    let origin=0,offset=0,expected=0;
    for (const direction of [1,-1,1,-1]) for(let i=0;i<1000;i++) {
      const movement=direction*123.5;
      const next=panViewport(offset,movement,max,width);
      origin+=next.columns*width;offset=next.scrollLeft;expected-=movement;
      assert.equal(origin+offset,expected);
      assert.ok(offset>=0&&offset<=max);
      assert.ok(offset+1200-420<=count*width);
    }
    assert.equal(origin+offset,0);
  }
});

test('scroll limit follows a resized frozen column area', () => {
  assert.equal(windowScrollLimit(1000,1200,360),160);
  assert.equal(windowScrollLimit(1000,1200,520),320);
});

test('trackpad and shifted wheel gestures produce horizontal timeline motion',()=>{
  assert.equal(horizontalWheelDelta(42,3,false,0,800),42);
  assert.equal(horizontalWheelDelta(2,30,false,0,800),0);
  assert.equal(horizontalWheelDelta(2,3,true,0,800),3);
  assert.equal(horizontalWheelDelta(2,3,true,1,800),48);
  assert.equal(horizontalWheelDelta(2,3,true,2,800),2400);
});
