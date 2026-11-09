import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function installSender(home: string, nodePath: string, cliPath: string) {
  const directory = join(home, ".local", "bin");
  const executable = join(directory, "grok-bots");
  mkdirSync(directory, { recursive: true });
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  try {
    writeFileSync(
      executable,
      `#!/bin/sh\nexec ${quote(nodePath)} ${quote(cliPath)} "$@"\n`,
      { flag: "wx", mode: 0o700 },
    );
    return { executable, installed: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      return { executable, installed: false };
    throw error;
  }
}
