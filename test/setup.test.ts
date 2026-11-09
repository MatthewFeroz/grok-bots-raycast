import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  cpSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSender } from "../scripts/install-sender";

test("setup installs a working sender under paths with spaces and quotes, and never replaces it", (t) => {
  const root = mkdtempSync(join(tmpdir(), "grok setup '"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const checkout = join(root, "checkout's cli");
  cpSync(join(__dirname, "../cli"), checkout, { recursive: true });
  const cli = join(checkout, "grok-bots.ts");
  const nodePath = join(root, "node's binary");
  symlinkSync(process.execPath, nodePath);
  const first = installSender(root, nodePath, cli);
  const original = readFileSync(first.executable, "utf8");
  assert.equal(first.installed, true);
  assert.equal(statSync(first.executable).mode & 0o777, 0o700);
  const output = execFileSync(first.executable, ["list"], {
    env: { ...process.env, HOME: root },
    encoding: "utf8",
  });
  assert.deepEqual(JSON.parse(output), []);
  assert.equal(
    installSender(root, "/changed/node", "/changed/cli").installed,
    false,
  );
  assert.equal(readFileSync(first.executable, "utf8"), original);
});

test("setup preserves an existing symlink, including a broken one", (t) => {
  const root = mkdtempSync(join(tmpdir(), "grok-setup-link-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, ".local/bin");
  mkdirSync(directory, { recursive: true });
  symlinkSync(join(root, "missing"), join(directory, "grok-bots"));
  assert.equal(
    installSender(root, process.execPath, "/unused").installed,
    false,
  );
});
