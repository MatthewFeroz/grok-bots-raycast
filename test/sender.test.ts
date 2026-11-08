import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRequest,
  readReceipt,
  Receipt,
  runCli,
  Sender,
  validateMessage,
} from "../src/sender";
import { deliver, loadHistory, saveReceipt, Storage } from "../src/history";

const pending: Receipt = {
  requestId: "raycast-test-01",
  bot: "fleet",
  createdAt: "2026-11-08T00:00:00.000Z",
  status: "unknown",
};
const accepted = { ...pending, status: "accepted", httpStatus: 200 };
const secret = "SYNTHETIC_PRIVATE_KEY_DO_NOT_DISPLAY";
function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key),
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
}

test("list allowlists metadata and refuses secret-bearing diagnostic output", async () => {
  const sender = new Sender(async (args) => {
    assert.deepEqual(args, ["list"]);
    return {
      code: 0,
      stdout: JSON.stringify([
        {
          alias: "fleet",
          name: "Fleet",
          key: secret,
          url: secret,
          chatUrl: secret,
        },
        { alias: "../bad", name: "Bad" },
      ]),
    };
  });
  assert.deepEqual(await sender.list(), [{ alias: "fleet", name: "Fleet" }]);
  await assert.rejects(
    new Sender(async () => ({ code: 1, stdout: secret })).list(),
    (error: Error) => !error.message.includes(secret),
  );
});

test("receipts discard raw notes, URLs and bodies and require matching identity", () => {
  const receipt = readReceipt(
    { ...accepted, note: secret, chatUrl: secret, body: secret, key: secret },
    pending.requestId,
    "fleet",
  );
  assert.deepEqual(receipt, accepted);
  assert.equal(readReceipt(accepted, "another-id", "fleet"), undefined);
  assert.equal(readReceipt(accepted, pending.requestId, "goji"), undefined);
  assert.equal(readReceipt({ ...accepted, status: "done" }), undefined);
  assert.equal(readReceipt({ ...accepted, status: ["accepted"] }), undefined);
  assert.equal(readReceipt({ ...accepted, requestId: "../../bad" }), undefined);
  assert.equal(readReceipt({ ...accepted, createdAt: secret }), undefined);
});

test("send uses stable ID, argument array and exact stdin; accepted is delivery only", async () => {
  const message =
    "Hello Fleet; $(touch /tmp/should-never-exist) `echo no`\nAcknowledgment only.";
  const calls: string[][] = [];
  const sender = new Sender(async (args, input) => {
    calls.push(args);
    assert.equal(input, message);
    return { code: 0, stdout: JSON.stringify({ ...accepted, note: secret }) };
  });
  assert.deepEqual(await sender.send(pending, message), accepted);
  assert.deepEqual(calls, [["send", "fleet", "--id", pending.requestId]]);
});

test("rejected and unknown receipts survive exit 2 without retry", async () => {
  for (const status of ["rejected", "unknown"] as const) {
    let calls = 0;
    const receipt = {
      ...pending,
      status,
      httpStatus: status === "rejected" ? 401 : 503,
    };
    const sender = new Sender(async () => {
      calls++;
      return { code: 2, stdout: JSON.stringify(receipt) };
    });
    assert.deepEqual(
      await sender.send(pending, "Acknowledgment only"),
      receipt,
    );
    assert.equal(calls, 1);
  }
});

test("failed, truncated, duplicate, thrown, or mismatched send only reads same ID", async () => {
  for (const failure of [
    "error",
    "truncated",
    "duplicate",
    "throw",
    "mismatch",
  ]) {
    const calls: string[][] = [];
    const sender = new Sender(async (args) => {
      calls.push(args);
      if (args[0] === "status")
        return { code: 0, stdout: JSON.stringify(accepted) };
      if (failure === "throw") throw new Error(secret);
      return {
        code: failure === "duplicate" ? 1 : failure === "error" ? null : 0,
        stdout:
          failure === "mismatch"
            ? JSON.stringify({ ...accepted, requestId: "wrong" })
            : secret,
      };
    });
    assert.deepEqual(
      await sender.send(pending, "Acknowledgment only"),
      accepted,
    );
    assert.deepEqual(calls, [
      ["send", "fleet", "--id", pending.requestId],
      ["status", pending.requestId],
    ]);
  }
});

test("unreadable status keeps uncertain ID and never transmits again", async () => {
  const calls: string[][] = [];
  const sender = new Sender(async (args) => {
    calls.push(args);
    return { code: null, stdout: secret };
  });
  assert.deepEqual(await sender.send(pending, "Hello"), pending);
  await assert.rejects(
    sender.status(pending),
    (error: Error) => !error.message.includes(secret),
  );
  assert.equal(calls.filter((args) => args[0] === "send").length, 1);
  assert.ok(calls.every((args) => args.includes(pending.requestId)));
});

test("validation prevents blank or oversized messages and invalid identities", async () => {
  assert.ok(validateMessage(" \n"));
  assert.ok(validateMessage("é".repeat(16001)));
  assert.equal(validateMessage("é".repeat(16000)), undefined);
  const sender = new Sender(async () => {
    assert.fail("must not spawn");
  });
  await assert.rejects(sender.send(pending, " "));
  await assert.rejects(sender.send({ ...pending, bot: "--help" }, "Hello"));
  await assert.rejects(
    sender.send({ ...pending, requestId: "$(echo nope)" }, "Hello"),
  );
  const ids = new Set(
    Array.from({ length: 100 }, () => createRequest("fleet").requestId),
  );
  assert.equal(ids.size, 100);
  assert.ok([...ids].every((id) => /^[A-Za-z0-9_-]{1,80}$/.test(id)));
});

test("journal saves unknown before sending, stores no body, and survives interrupted final save", async () => {
  const storage = memory();
  const result = await deliver(
    storage,
    pending,
    "PRIVATE_MESSAGE",
    async () => {
      assert.deepEqual(await loadHistory(storage), [pending]);
      storage.setItem = async () => {
        throw new Error("disk full");
      };
      return accepted as Receipt;
    },
  );
  assert.deepEqual(result, accepted);
  assert.deepEqual(await loadHistory(storage), [pending]);
  assert.ok(!JSON.stringify([...storage.data]).includes("PRIVATE_MESSAGE"));
});

test("journal failure or corruption prevents send and retains prior IDs", async () => {
  const storage = memory();
  storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(
    deliver(storage, pending, "Hello", async () => {
      assert.fail("must not send");
    }),
  );
  const corrupt = memory();
  corrupt.data.set("delivery-receipts-v1", "bad JSON");
  await assert.rejects(
    deliver(corrupt, pending, "Hello", async () => {
      assert.fail("must not send");
    }),
  );
  const good = memory();
  await saveReceipt(good, pending);
  await saveReceipt(good, { ...pending, requestId: "raycast-test-02" });
  await saveReceipt(good, accepted as Receipt);
  assert.equal((await loadHistory(good)).length, 2);
});

test("concurrent receipt refresh and new journal write retain both IDs", async () => {
  const storage = memory();
  const next = { ...pending, requestId: "raycast-new-pending" };
  await saveReceipt(storage, pending);
  await Promise.all([
    saveReceipt(storage, next),
    saveReceipt(storage, accepted as Receipt),
  ]);
  assert.deepEqual(await loadHistory(storage), [accepted, next]);
});

test("real subprocess ignores stderr and treats shell metacharacters as inert stdin", async () => {
  const dir = await mkdtemp(join(tmpdir(), "raycast-grok-test-"));
  try {
    const executable = join(dir, "sender");
    const sentinel = join(dir, "must-not-exist");
    await writeFile(
      executable,
      `#!${process.execPath}\nlet body='';process.stdin.on('data',x=>body+=x);process.stdin.on('end',()=>{process.stderr.write('${secret}');process.stdout.write(JSON.stringify({args:process.argv.slice(2),body}));});\n`,
    );
    await chmod(executable, 0o700);
    const body = `$(touch ${sentinel}); \`touch ${sentinel}\`\nHello é`;
    const result = await runCli(
      ["send", "fleet", "--id", pending.requestId],
      body,
      executable,
    );
    assert.equal(result.code, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      args: ["send", "fleet", "--id", pending.requestId],
      body,
    });
    assert.ok(!result.stdout.includes(secret));
    await assert.rejects(readFile(sentinel), { code: "ENOENT" });
    const missing = await runCli([], undefined, join(dir, "missing"));
    assert.deepEqual(missing, { code: null, stdout: "" });
    await writeFile(
      executable,
      `#!${process.execPath}\nprocess.stdout.write('x'.repeat(200000));\n`,
    );
    assert.deepEqual(await runCli([], undefined, executable), {
      code: null,
      stdout: "",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
