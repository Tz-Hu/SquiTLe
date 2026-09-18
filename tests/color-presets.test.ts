import {test} from 'node:test';
import assert from 'node:assert/strict';
import {builtInColorPresets,nextCustomPresetName,restoreCustomColorPresets} from '../lib/color-presets.ts';
import {defaultTablePalettes} from '../lib/table-colors.ts';

test('built-in presets contain the requested day and night themes',()=>{
  assert.deepEqual(builtInColorPresets.filter(item=>item.mode==='light').map(item=>item.id),['default-light','nailong','dpsk','morandi','mondrian','macaron','memphis','rococo','dunhuang']);
  assert.deepEqual(builtInColorPresets.filter(item=>item.mode==='dark').map(item=>item.id),['default-dark','planhub','deep-ocean','dark-pine','deep-forest','burgundy']);
  assert.deepEqual(builtInColorPresets.filter(item=>['morandi','mondrian','macaron','memphis','rococo','dunhuang'].includes(item.id)).map(item=>item.name),['莫兰迪','蒙德里安','马卡龙','孟菲斯','洛可可','敦煌']);
  for(const item of builtInColorPresets){assert.match(item.primary,/^#[0-9a-f]{6}$/i);assert.equal(Object.keys(item.categories).length,6);assert.equal(Object.keys(item.table).length,8);}
});
test('custom preset restoration rejects incomplete or invalid palettes',()=>{
  const valid={id:'mine',name:'  My colors  ',mode:'dark',categories:{论文:'#112233',实验:'#223344',工程:'#334455',其他:'#445566'},table:{project:'#111111',task:'#121212',month:'#131313',date:'#141414',canvas:'#151515',add:'#161616',grid:'#171717',projectLine:'#181818'}};
  assert.deepEqual(restoreCustomColorPresets([valid])[0]?.name,'My colors');
  assert.equal(restoreCustomColorPresets([valid])[0]?.primary,'#112233');
  assert.equal(Object.keys(restoreCustomColorPresets([valid])[0]?.categories??{}).length,6);
  assert.equal(restoreCustomColorPresets([{...valid,primary:'#abcdef'}])[0]?.primary,'#abcdef');
  assert.deepEqual(restoreCustomColorPresets([{...valid,table:{}}]),[]);
});
test('legacy custom presets gain the default project separator color',()=>{
  const legacy={id:'legacy',name:'Legacy',mode:'dark',categories:{论文:'#112233'},table:{project:'#111111',task:'#121212',month:'#131313',date:'#141414',canvas:'#151515',add:'#161616',grid:'#171717'}};
  assert.equal(restoreCustomColorPresets([legacy])[0].table.projectLine,defaultTablePalettes.dark.projectLine);
});
test('unnamed presets receive the first available automatic number',()=>{
  assert.equal(nextCustomPresetName([]),'自定义#1');
  assert.equal(nextCustomPresetName([{name:'自定义#1'},{name:'Custom#3'}]),'自定义#2');
  assert.equal(nextCustomPresetName([{name:'自定义#1'}],'Custom'),'Custom#2');
});
