import test from "node:test";
import assert from "node:assert/strict";
import {clampSettingsNavWidth} from "../lib/settings-layout.ts";

test("settings navigation stays draggable while preserving usable detail width",()=>{
  assert.equal(clampSettingsNavWidth(80,900),120);
  assert.equal(clampSettingsNavWidth(220,900),220);
  assert.equal(clampSettingsNavWidth(420,900),300);
  assert.equal(clampSettingsNavWidth(300,540),212);
});
