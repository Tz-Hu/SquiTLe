import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horizontalWheelDelta, panViewport, wheelBoundaryPan, windowScrollLimit } from '../lib/presentation/pan.ts';

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
  assert.equal(horizontalWheelDelta(2,30,false,0,800),2);
  assert.equal(horizontalWheelDelta(0,30,false,0,800),0);
  assert.equal(horizontalWheelDelta(2,3,true,0,800),2);
  assert.equal(horizontalWheelDelta(0,3,true,0,800),3);
  assert.equal(horizontalWheelDelta(0,3,true,1,800),48);
  assert.equal(horizontalWheelDelta(0,3,true,2,800),2400);
});

test('ordinary and diagonal wheel motion stays native, including inertia-sized deltas',()=>{
  for(const delta of [-100,-2,-.25,0,.25,2,100]){
    assert.equal(wheelBoundaryPan(400,delta,1000,54),null);
  }
  assert.equal(wheelBoundaryPan(0,20,1000,54),null);
  assert.equal(wheelBoundaryPan(1000,-20,1000,54),null);
  assert.equal(wheelBoundaryPan(0,0,1000,54),null);
});

test('wheel overshoot preserves subpixel dates and refills the scrolling buffer',()=>{
  for(const width of [6,54,82])for(const [left,delta] of [[0,-.25],[0,-2000],[1000,.25],[1000,2000],[998,4]]){
    const next=wheelBoundaryPan(left,delta,1000,width)!;
    assert.ok(next);
    assert.equal(next.columns*width+next.scrollLeft,left+delta);
    assert.ok(Math.abs(next.scrollLeft-500)<width);
    assert.equal(wheelBoundaryPan(next.scrollLeft,Math.sign(delta)*.25,1000,width),null);
  }
});

test('native scroll and boundary rebasing preserve position through repeated reversals',()=>{
  for(const width of [6,54,82]){
    let origin=0,left=0,expected=0;
    for(const direction of [-1,1,-1,1])for(let i=0;i<300;i++){
      const delta=direction*(i%7===0?.25:23.5);
      const next=wheelBoundaryPan(left,delta,1000,width);
      if(next){origin+=next.columns*width;left=next.scrollLeft;}else left+=delta;
      expected+=delta;
      assert.equal(origin+left,expected);
      assert.ok(left>=0&&left<=1000);
    }
    assert.equal(origin+left,0);
  }
});
