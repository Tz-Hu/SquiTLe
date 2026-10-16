import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const tag = process.argv[2];
const expectedTag = `v${version}`;

if (process.argv.length !== 3 || tag !== expectedTag) {
  console.error(
    `Release version mismatch: expected ${expectedTag} from package.json, received ${JSON.stringify(tag) ?? "(missing)"}.\nUsage: pnpm check:version v<version>`,
  );
  process.exit(1);
}

console.log(`Release version verified: ${tag} matches package.json ${version}.`);
