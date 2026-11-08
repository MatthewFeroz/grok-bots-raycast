import assert from "node:assert/strict";
import { test } from "node:test";
import { parseComposeQuery } from "../src/compose-query";

const bots = [
  { alias: "fleet", name: "Fleet" },
  { alias: "goji", name: "Goji" },
];

test("a Bot alias followed by a message produces an explicit composer draft", () => {
  assert.deepEqual(parseComposeQuery("fleet say hi", bots), {
    bot: bots[0],
    message: "say hi",
  });
  assert.deepEqual(
    parseComposeQuery("  GOJI Hello!\nKeep this line.  ", bots),
    {
      bot: bots[1],
      message: "Hello!\nKeep this line.  ",
    },
  );
});

test("ordinary searches and unknown aliases never become message drafts", () => {
  for (const query of [
    "",
    "fleet",
    "fleet  ",
    "fle say hi",
    "fleetish hi",
    "accepted",
    "missing hi",
  ])
    assert.equal(parseComposeQuery(query, bots), undefined);
  assert.equal(parseComposeQuery("fleet say hi", []), undefined);
});
