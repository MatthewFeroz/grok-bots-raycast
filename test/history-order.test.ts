import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHistory, saveReceipt, Storage } from "../src/history";
import { Receipt } from "../src/sender";

test("checking an older delivery does not displace a newer one in recent history", async () => {
  const data = new Map<string, string>();
  const storage: Storage = {
    getItem: async (key) => data.get(key),
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
  const older: Receipt = {
    requestId: "older-delivery",
    bot: "fleet",
    status: "unknown",
    createdAt: "2026-11-08T00:00:00.000Z",
  };
  const newer: Receipt = {
    ...older,
    requestId: "newer-delivery",
    status: "accepted",
    createdAt: "2026-11-08T01:00:00.000Z",
  };
  await saveReceipt(storage, older);
  await saveReceipt(storage, newer);
  await saveReceipt(storage, { ...older, status: "accepted" });
  assert.deepEqual(
    (await loadHistory(storage)).map((receipt) => receipt.requestId),
    [newer.requestId, older.requestId],
  );
});
