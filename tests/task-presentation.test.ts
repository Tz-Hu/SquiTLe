import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expandedInset,foldedSide,portOffset,visiblePortDays,taskBarWidth} from '../lib/presentation/task-presentation.ts';

test('handle inset follows the expanded task boundary',()=>{
  assert.equal(expandedInset(100,1),0);
  assert.ok(Math.abs(expandedInset(100,1.4)-20)<1e-9);
  assert.equal(expandedInset(24,1.5),6);
});

test('only unfinished ordinary tasks outside either viewport edge fold',()=>{
  assert.equal(foldedSide(-20,0,0,100,false,false),'past');
  assert.equal(foldedSide(100,150,0,100,false,false),'future');
  assert.equal(foldedSide(-20,20,0,100,false,false),null);
  assert.equal(foldedSide(80,150,0,100,false,false),null);
  for(const [start,end] of [[-20,0],[100,150]]){
    assert.equal(foldedSide(start,end,0,100,true,false),null);
    assert.equal(foldedSide(start,end,0,100,false,true),null);
  }
});

test('date nodes and dependency endpoints share date-center coordinates at all zooms',()=>{
  for(const pixels of [54,82/7,6]){
    const width=taskBarWidth(30,pixels);
    const days=visiblePortDays(29,0,pixels,0,width);
    assert.equal(days.length,30);
    for(const day of days){
      const x=portOffset(day,pixels,width);
      assert.ok(x>=0&&x<=width);
      assert.ok(Math.abs(x-(day+.5)*pixels)<.0001);
    }
    assert.equal(portOffset(0,pixels,28,true),14);
  }
});
test('long tasks generate only the visible dates, including partial boundary days',()=>{
  const days=visiblePortDays(100000,-54000,54,0,540);
  assert.equal(days[0],1000);assert.equal(days.at(-1),1010);
  assert.equal(days.length,11);
  assert.deepEqual(visiblePortDays(2,1000,54,0,540),[]);
});
