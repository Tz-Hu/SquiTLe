import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/check-release-version.mjs", import.meta.url));
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("release version check accepts the matching tag from any working directory", () => {
  const result = spawnSync(process.execPath, [script, `v${version}`], {
    cwd: fileURLToPath(new URL("../scripts/", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("release version check rejects a different release version", () => {
  const result = spawnSync(process.execPath, [script, `v${version}-mismatch`], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Release version mismatch/);
});

test("release version check rejects missing, unprefixed, or extra arguments", () => {
  for (const args of [[], [version], [`v${version}`, "extra"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: pnpm check:version/);
  }
});
