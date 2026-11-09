#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { Bots } from "./bots.ts";

const HELP = `grok-bots — message your existing Grok Bots

  list                         Show configured bots, without credentials
  add <alias>                  Private interactive setup in your terminal
  add <alias> --stdin           Read {name,url,key,chatUrl?} JSON from stdin
  send <alias> [--id <id>]      Read a message from stdin and send it once
  compose <alias>               Write a message interactively
  status [request-id]           Show delivery receipts (not Bot answers)

Replies appear in Grok Bot. Webhook acceptance is not completion.
Credentials stay in ~/.config/grok-bots (0700/0600).
Never put keys or webhook URLs in command arguments or chat.`;

async function main() {
  const [command, alias, ...args] = process.argv.slice(2);
  const bots = new Bots();
  if (!command || command === "--help") {
    console.log(HELP);
    return;
  }
  if (command === "list") {
    console.log(JSON.stringify(bots.list(), null, 2));
    return;
  }
  if (command === "status") {
    console.log(
      JSON.stringify(alias ? bots.receipt(alias) : bots.recent(), null, 2),
    );
    return;
  }
  if (command === "add" && alias) {
    if (args.length === 1 && args[0] === "--stdin") {
      let value;
      try {
        value = JSON.parse(readFileSync(0, "utf8"));
      } catch {
        throw new Error("Expected private bot JSON on stdin.");
      }
      bots.add(alias, value);
    } else if (args.length === 0 && process.stdin.isTTY) {
      // A fresh interface per field prevents both history and readline's kill
      // ring from carrying hidden text into a later visible prompt.
      const ask = async (prompt: string, hidden = false) => {
        const output = new Writable({
          write(chunk, _encoding, callback) {
            if (!hidden) process.stderr.write(chunk);
            callback();
          },
        });
        const input = createInterface({
          input: process.stdin,
          output,
          terminal: true,
          historySize: 0,
        });
        if (hidden) process.stderr.write(prompt);
        try {
          return await input.question(hidden ? "" : prompt);
        } finally {
          input.close();
          if (hidden) process.stderr.write("\n");
        }
      };
      const name = await ask("Bot display name: ");
      const url = await ask("Webhook URL (hidden): ", true);
      const key = await ask("Webhook key (hidden): ", true);
      const chatUrl = await ask("Bot chat HTTPS link (optional): ");
      bots.add(alias, { name, url, key, ...(chatUrl ? { chatUrl } : {}) });
    } else
      throw new Error(
        "Run add in your own terminal, or supply private JSON with --stdin.",
      );
    console.log(`Saved ${alias}. Credentials were not printed.`);
    return;
  }
  if ((command === "send" || command === "compose") && alias) {
    let message: string;
    if (command === "compose") {
      if (!process.stdin.isTTY || args.length)
        throw new Error("Use compose in your own terminal.");
      const input = createInterface({
        input: process.stdin,
        output: process.stderr,
      });
      try {
        message = await input.question(`Message to ${alias}: `);
      } finally {
        input.close();
      }
    } else message = readFileSync(0, "utf8");
    if (args.length && !(args.length === 2 && args[0] === "--id"))
      throw new Error("Usage: send <alias> [--id <request-id>]");
    const receipt = await bots.send(alias, message, args[1]);
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.status !== "accepted") process.exitCode = 2;
    return;
  }
  throw new Error("Unknown command. Run grok-bots --help.");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Grok bot command failed.",
  );
  process.exitCode = 1;
});
