import {test} from "node:test";
import assert from "node:assert/strict";
import {extractMemoLinks} from "../lib/memo-links.ts";

test("memo links include web URLs and full-line local paths",()=>{
  const links=extractMemoLinks("Read https://example.com/paper.\n/Users/me/Papers/draft.pdf\nC:\\Data\\result.csv");
  assert.deepEqual(links.map(link=>[link.local,link.label]),[
    [false,"https://example.com/paper"],
    [true,"/Users/me/Papers/draft.pdf"],
    [true,"C:\\Data\\result.csv"],
  ]);
});
