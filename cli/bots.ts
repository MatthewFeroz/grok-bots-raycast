import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  lstatSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Bot = { name: string; url: string; key: string; chatUrl?: string };
export type Receipt = {
  requestId: string;
  bot: string;
  createdAt: string;
  status: "unknown" | "accepted" | "rejected";
  httpStatus?: number;
  chatUrl?: string;
  note: string;
};
type Config = { version: 1; bots: Record<string, Bot> };
const validName = /^[a-z0-9][a-z0-9-]{0,47}$/;
const validId = /^[a-zA-Z0-9_-]{1,80}$/;
const NOTE =
  "Delivery accepted. The Bot runs asynchronously; this is not its answer. Check its Grok Bot chat.";

export function validateBot(value: Bot): Bot {
  if (
    !value ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 100 ||
    [...value.name].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new Error("Enter a bot display name (1–100 characters).");
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    throw new Error("Invalid webhook URL.");
  }
  // Support the documented Grok Bot routine endpoint, not arbitrary destinations.
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api2.cursor.sh" ||
    url.port ||
    url.username ||
    url.password ||
    !/^\/automations\/webhook\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use the Grok Bot routine's https://api2.cursor.sh/automations/webhook/… URL.",
    );
  if (
    typeof value.key !== "string" ||
    !value.key ||
    /\s/.test(value.key) ||
    [...value.key].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    value.key.length > 4096
  )
    throw new Error("Enter the webhook key only, without the Bearer prefix.");
  if (value.chatUrl) {
    let chat: URL;
    try {
      chat = new URL(value.chatUrl);
    } catch {
      throw new Error("Invalid bot chat link.");
    }
    if (
      chat.protocol !== "https:" ||
      !["x.ai", "grok.com", "cursor.com"].includes(chat.hostname) ||
      chat.username ||
      chat.password ||
      chat.port
    )
      throw new Error(
        "Use an HTTPS bot chat link from x.ai, grok.com, or cursor.com.",
      );
  }
  return {
    name: value.name.trim(),
    url: url.href,
    key: value.key,
    ...(value.chatUrl ? { chatUrl: value.chatUrl } : {}),
  };
}

export class Bots {
  readonly root: string;
  constructor(root = join(homedir(), ".config", "grok-bots")) {
    this.root = root;
  }

  private privateDir(path: string): void {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    const stat = lstatSync(path);
    if (
      !stat.isDirectory() ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error(
        "Grok bot storage must be an owned private directory (0700).",
      );
  }

  private read<T>(path: string): T {
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error(
        "Grok bot files must be owned private regular files (0600).",
      );
    return JSON.parse(readFileSync(path, "utf8")) as T;
  }

  private config(): Config {
    this.privateDir(this.root);
    let value: Config;
    try {
      value = this.read<Config>(join(this.root, "config.json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1, bots: {} };
      throw new Error(
        "Cannot read private bot configuration. Check its JSON and permissions.",
      );
    }
    if (
      value.version !== 1 ||
      !value.bots ||
      typeof value.bots !== "object" ||
      Array.isArray(value.bots)
    )
      throw new Error("Invalid bot configuration.");
    return value;
  }

  list(): Array<{ alias: string; name: string; chatUrl?: string }> {
    return Object.entries(this.config().bots).map(([alias, bot]) => ({
      alias,
      name: bot.name,
      ...(bot.chatUrl ? { chatUrl: bot.chatUrl } : {}),
    }));
  }

  add(alias: string, value: Bot): void {
    if (!validName.test(alias))
      throw new Error("Use a lowercase bot alias, such as chief-of-staff.");
    this.privateDir(this.root);
    const lock = join(this.root, ".setup.lock");
    let handle: number;
    try {
      handle = openSync(lock, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error(
          "Bot setup is already running or was interrupted. Check .setup.lock before retrying; no configuration changed.",
        );
      throw new Error(
        "Cannot lock private bot configuration. No configuration changed.",
      );
    }
    try {
      writeFileSync(handle, String(process.pid));
      const config = this.config();
      if (Object.hasOwn(config.bots, alias))
        throw new Error(
          "That alias already exists. Use a new alias; credentials were not replaced.",
        );
      config.bots[alias] = validateBot(value);
      const temp = join(this.root, `.config-${randomUUID()}.json`);
      writeFileSync(temp, JSON.stringify(config), { mode: 0o600, flag: "wx" });
      renameSync(temp, join(this.root, "config.json"));
    } finally {
      closeSync(handle);
      unlinkSync(lock);
    }
  }

  receipt(requestId: string): Receipt {
    if (!validId.test(requestId)) throw new Error("Invalid request ID.");
    try {
      const value = this.read<Receipt>(
        join(this.root, "receipts", `${requestId}.json`),
      );
      if (
        !value ||
        value.requestId !== requestId ||
        typeof value.bot !== "string" ||
        !validName.test(value.bot) ||
        typeof value.createdAt !== "string" ||
        !Number.isFinite(Date.parse(value.createdAt)) ||
        !["accepted", "rejected", "unknown"].includes(value.status) ||
        typeof value.note !== "string"
      )
        throw new Error("Invalid receipt.");
      return value;
    } catch {
      throw new Error("No readable receipt for that request ID.");
    }
  }

  recent(): { receipts: Receipt[]; skipped: number } {
    this.privateDir(this.root);
    const dir = join(this.root, "receipts");
    this.privateDir(dir);
    const receipts: Receipt[] = [];
    let skipped = 0;
    for (const name of readdirSync(dir).filter((name) =>
      /^[A-Za-z0-9_-]+\.json$/.test(name),
    )) {
      try {
        receipts.push(this.receipt(name.slice(0, -5)));
      } catch {
        skipped++;
      }
    }
    return {
      receipts: receipts
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20),
      skipped,
    };
  }

  async send(
    alias: string,
    message: string,
    requestId: string = randomUUID(),
    sendFetch: typeof fetch = fetch,
  ): Promise<Receipt> {
    if (!validName.test(alias)) throw new Error("Invalid bot alias.");
    if (
      typeof message !== "string" ||
      !message.trim() ||
      Buffer.byteLength(message) > 32_000
    )
      throw new Error("Enter a message of 1–32000 UTF-8 bytes.");
    if (!validId.test(requestId)) throw new Error("Invalid request ID.");
    const config = this.config();
    if (!Object.hasOwn(config.bots, alias))
      throw new Error(
        "Unknown bot. Run grok-bots list, then add the bot privately.",
      );
    const bot = validateBot(config.bots[alias]);
    const dir = join(this.root, "receipts");
    this.privateDir(dir);
    const path = join(dir, `${requestId}.json`);
    const receipt: Receipt = {
      requestId,
      bot: alias,
      createdAt: new Date().toISOString(),
      status: "unknown",
      ...(bot.chatUrl ? { chatUrl: bot.chatUrl } : {}),
      note: "Delivery is unconfirmed. Check the Bot's chat before sending again; this sender never retries automatically.",
    };
    try {
      writeFileSync(path, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error(
          "Request ID already used. No message sent; read its receipt instead.",
        );
      throw new Error("Cannot save a private receipt. No message sent.");
    }
    try {
      const response = await sendFetch(bot.url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bot.key}`,
        },
        body: JSON.stringify({
          version: 1,
          requestId,
          message,
          source: "raycast",
        }),
      });
      receipt.httpStatus = response.status;
      if (response.status === 200 || response.status === 202) {
        receipt.status = "accepted";
        receipt.note = NOTE;
      } else if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408
      ) {
        receipt.status = "rejected";
        receipt.note =
          "Webhook rejected this delivery. Check the routine and current credentials. No automatic retry.";
      }
      // Never print upstream bodies: they can contain private data or secrets.
      await response.body?.cancel();
    } catch {
      /* Network errors can occur after acceptance. Preserve unknown. */
    }
    const temp = join(dir, `.receipt-${randomUUID()}.json`);
    writeFileSync(temp, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
    renameSync(temp, path);
    return receipt;
  }
}
