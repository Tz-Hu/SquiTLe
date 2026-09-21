import {test} from "node:test";
import assert from "node:assert/strict";
import {parseManualDate} from "../lib/domain/manual-date.ts";
test("accepts common Chinese and year-first date formats",()=>{
 for(const date of ["2026年8月6日","20260806","2026/08/06","2026-8-06","2026.08.06"])assert.equal(parseManualDate(date,"zh"),"2026-08-06");
});
test("accepts locale-aware English date formats without numeric ambiguity",()=>{
 for(const date of ["08/06/2026","Aug 6, 2026","August 6 2026","6 Aug 2026","6th August 2026"])assert.equal(parseManualDate(date,"en"),"2026-08-06");
 assert.equal(parseManualDate("08/06/2026","zh"),null);
});
test("accepts localized relative dates",()=>{
 const today=new Date(2026,7,6);
 assert.equal(parseManualDate("明天","zh",today),"2026-08-07");
 assert.equal(parseManualDate("tomorrow","en",today),"2026-08-07");
});
test("rejects calendar overflow, incomplete input and non-leap days",()=>{
 for(const date of ["20260229","2026-13-01","2026-4-31","2026-8-","invalid"])assert.equal(parseManualDate(date),null);
 assert.equal(parseManualDate("2024年2月29日"),"2024-02-29");
});
