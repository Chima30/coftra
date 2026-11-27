import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFENCES } from "./security";

const TEST_DIR = path.resolve(__dirname, "../../../../contracts/test");

describe("security page", () => {
  it("only cites Foundry tests that exist, in the file it names", () => {
    for (const d of DEFENCES) {
      expect(d.tests.length).toBeGreaterThan(0);
      for (const t of d.tests) {
        const src = fs.readFileSync(path.join(TEST_DIR, t.file), "utf8");
        expect(src, `${t.name} in ${t.file}`).toContain(`function ${t.name}(`);
      }
    }
  });
});
