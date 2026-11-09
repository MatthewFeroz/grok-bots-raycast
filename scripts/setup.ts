import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { installSender } from "./install-sender.ts";

try {
  if (process.platform !== "darwin")
    throw new Error(
      "Raycast setup requires macOS. Development checks also run on Linux.",
    );
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 11))
    throw new Error(
      "Install Node.js 24.11 or newer, then run npm run setup again.",
    );
  const cli = resolve(dirname(process.argv[1]), "../cli/grok-bots.ts");
  const { executable, installed } = installSender(
    homedir(),
    process.execPath,
    cli,
  );
  console.log(
    installed
      ? "Installed the local sender."
      : "Kept your existing sender unchanged.",
  );
  let count: number;
  try {
    const result: unknown = JSON.parse(
      execFileSync(executable, ["list"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 30_000,
      }),
    );
    if (!Array.isArray(result)) throw new Error();
    count = result.length;
  } catch {
    throw new Error(
      "Sender check failed. Run ~/.local/bin/grok-bots list in your terminal. Private diagnostics were hidden; no existing sender or credentials were replaced.",
    );
  }
  console.log(`${count} configured Bot${count === 1 ? "" : "s"}.`);
  if (!count)
    console.log(
      "Next: npm run bots -- add fleet (paste credentials into the hidden prompts). ",
    );
  console.log("Then: npm run dev. Open Raycast and choose Message Grok Bot.");
  console.log(
    "Keep this checkout and Node.js in place; the sender uses their absolute paths.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Setup failed.");
  process.exitCode = 1;
}
