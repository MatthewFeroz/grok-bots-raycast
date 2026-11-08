import { Bot } from "./sender";

// This only prepares a draft. Transmission still requires the composer submit.
export function parseComposeQuery(
  query: string,
  bots: Bot[],
): { bot: Bot; message: string } | undefined {
  const match = /^(\S+)\s+([\s\S]*)$/.exec(query.trimStart());
  if (!match || !match[2].trim()) return;
  const bot = bots.find((bot) => bot.alias === match[1].toLowerCase());
  if (bot) return { bot, message: match[2] };
}
