import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {english,translate} from '../lib/i18n.ts';
import {visibleMonthSegment} from '../lib/calendar-header.ts';

test('every literal translation key in the UI has English copy',()=>{
  for(const file of ['app/page.tsx','components/manual-date-field.tsx','components/inbox-panel.tsx','components/daily-agenda.tsx']){
    const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function check(n:ts.Node){
      if(ts.isCallExpression(n)&&n.expression.getText(tree)==='t'&&n.arguments[0]){
        const checkTranslationCandidates=(candidate:ts.Node)=>{
          if(ts.isStringLiteral(candidate)&&/[\u3400-\u9fff]/u.test(candidate.text))assert.ok(english[candidate.text],candidate.text);
          else ts.forEachChild(candidate,checkTranslationCandidates);
        };
        checkTranslationCandidates(n.arguments[0]);
      }
      if(ts.isJsxText(n)){
        const visible=n.text.trim();
        if(/[\u3400-\u9fff]/u.test(visible))assert.ok(['中文','2026年8月6日'].includes(visible),`Untranslated JSX text: ${visible}`);
      }
      // Translating display text must never change stored enum values or CSS status hooks.
      if(ts.isJsxAttribute(n)&&['value','data-status','key'].includes(n.name.getText(tree)))assert.ok(!n.initializer?.getText(tree).includes('t('));
      ts.forEachChild(n,check);
    }check(tree);
  }
});
test('built-in preset names have English labels',()=>{
  for(const name of ['预设1','预设2','预设3','莫兰迪','蒙德里安','马卡龙','孟菲斯','洛可可','敦煌','深海蓝','暗松绿','深林绿','酒红'])assert.ok(english[name],name);
});
test('translations retain user-authored names and interpolate counts',()=>{
  assert.equal(translate('en','{0}，早于当前视图','我的实验'),'我的实验, before the visible dates');
  assert.equal(translate('en','{0} 项 · {1} 行',4,3),'4 tasks · 3 rows');
  assert.equal(translate('zh','状态'),'状态');
  assert.equal(translate('en','状态'),'Status');
});
test('month labels center in the visible merged-header region',()=>{
  assert.deepEqual(visibleMonthSegment(0,1000,0,600),{left:0,width:600});
  assert.deepEqual(visibleMonthSegment(0,1000,400,600),{left:400,width:600});
  assert.deepEqual(visibleMonthSegment(0,1000,900,600),{left:900,width:100});
  assert.deepEqual(visibleMonthSegment(1000,900,900,600),{left:0,width:500});
  assert.equal(visibleMonthSegment(2000,900,0,600).width,0);
});
