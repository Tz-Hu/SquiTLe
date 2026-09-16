import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultAppearance,restoreAppearance,restoreCategories,migrateCategoryCatalog,categoryDefaults,WORK_TYPE_CATALOG_VERSION,taskBounds,layoutTokens} from '../lib/appearance.ts';
import {migrateTablePalettes,defaultTablePalettes} from '../lib/table-colors.ts';

test('task height and both connection edges share a fixed row center',()=>{
  for(const height of [20,24,28,32]){
    const {top,bottom}=taskBounds(height);
    assert.equal(bottom-top,height);
    assert.equal((top+bottom)/2,layoutTokens.rowHeight/2);
    assert.ok(top-layoutTokens.routeClearance>0);
    assert.ok(bottom+layoutTokens.routeClearance<layoutTokens.rowHeight);
  }
});
test('settings restore defaults and clamp invalid saved values',()=>{
  assert.deepEqual(restoreAppearance(null),defaultAppearance);
  const restored=restoreAppearance({barHeight:500,barFill:NaN,lineOpacity:-10,weekends:false});
  assert.equal(restored.barHeight,32);assert.equal(restored.barFill,16);assert.equal(restored.lineOpacity,8);assert.equal(restored.weekends,false);
  assert.equal(restoreAppearance({barRadius:3,completedOpacity:67}).barRadius,4);
  assert.equal(restoreAppearance({barRadius:3,completedOpacity:67}).completedOpacity,55);
  assert.deepEqual(restoreCategories({论文:'bad'}),categoryDefaults);
  assert.equal(restoreCategories({论文:'#123456'}).论文,'#123456');
  assert.deepEqual(Object.keys(migrateCategoryCatalog({论文:'#123456',工程:'#334455'},1)),['论文','实验','工程']);
  assert.equal(migrateCategoryCatalog({论文:'#123456',工程:'#334455'},WORK_TYPE_CATALOG_VERSION).实验,undefined);
});
test('palette upgrade changes old defaults and retains custom colors',()=>{
  const upgraded=migrateTablePalettes({dark:{canvas:'#243248',task:'#123456',grid:'#35445c'}},undefined);
  assert.equal(upgraded.dark.canvas,defaultTablePalettes.dark.canvas);
  assert.equal(upgraded.dark.grid,defaultTablePalettes.dark.grid);
  assert.equal(upgraded.dark.task,'#123456');
  assert.equal(migrateTablePalettes({dark:{canvas:'#243248'}},2).dark.canvas,'#243248');
});
