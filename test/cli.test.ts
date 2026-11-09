import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  statSync,
  chmodSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bots, validateBot } from "../cli/bots";

const bot = {
  name: "Test Bot",
  url: "https://api2.cursor.sh/automations/webhook/test-id",
  key: "test-secret",
};
function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "grok-bots-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bots = new Bots(root);
  bots.add("test", bot);
  return { root, bots };
}

test("only configured Grok routine destinations are accepted", () => {
  for (const url of [
    "http://api2.cursor.sh/automations/webhook/a",
    "https://api2.cursor.sh.evil.test/automations/webhook/a",
    "https://user:pass@api2.cursor.sh/automations/webhook/a",
    "https://api2.cursor.sh/other/a",
    "https://127.0.0.1/automations/webhook/a",
    bot.url + "?key=secret",
  ])
    assert.throws(() => validateBot({ ...bot, url }));
  assert.throws(() => validateBot({ ...bot, key: "x\r\nInjection" }));
});

test("private configuration and list never disclose capabilities or keys", (t) => {
  const { root, bots } = fixture(t);
  assert.equal(statSync(root).mode & 0o777, 0o700);
  assert.equal(statSync(join(root, "config.json")).mode & 0o777, 0o600);
  assert.deepEqual(bots.list(), [{ alias: "test", name: "Test Bot" }]);
  chmodSync(join(root, "config.json"), 0o644);
  assert.throws(() => bots.list(), /permissions/);
});

test("accepted sends use private bearer auth, stop redirects, and redact receipts", async (t) => {
  const { root, bots } = fixture(t);
  let count = 0;
  const receipt = await bots.send(
    "test",
    "private message",
    "request-1",
    (async (url, init) => {
      count++;
      assert.equal(url, bot.url);
      assert.equal(init?.redirect, "error");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer test-secret",
      );
      assert.deepEqual(JSON.parse(init?.body as string), {
        version: 1,
        requestId: "request-1",
        message: "private message",
        source: "raycast",
      });
      return new Response("untrusted response with test-secret", {
        status: 200,
      });
    }) as typeof fetch,
  );
  assert.equal(count, 1);
  assert.equal(receipt.status, "accepted");
  const stored = readFileSync(join(root, "receipts", "request-1.json"), "utf8");
  assert.doesNotMatch(stored, /private message|test-secret|api2/);
  assert.equal(
    statSync(join(root, "receipts", "request-1.json")).mode & 0o777,
    0o600,
  );
});

test("uncertain delivery is recorded once and cannot be resent under its ID", async (t) => {
  const { bots } = fixture(t);
  let count = 0;
  const send = (async () => {
    count++;
    throw new Error("timeout containing secret");
  }) as typeof fetch;
  const receipt = await bots.send("test", "hello", "uncertain", send);
  assert.equal(receipt.status, "unknown");
  await assert.rejects(
    bots.send("test", "hello", "uncertain", send),
    /already used/,
  );
  assert.equal(count, 1);
  assert.equal(bots.receipt("uncertain").status, "unknown");
});

test("HTTP rejection differs from transient or ambiguous failures", async (t) => {
  const { bots } = fixture(t);
  for (const [code, expected] of [
    [401, "rejected"],
    [429, "rejected"],
    [500, "unknown"],
    [408, "unknown"],
    [302, "unknown"],
    [202, "accepted"],
  ] as const) {
    const receipt = await bots.send(
      "test",
      "hello",
      `http-${code}`,
      (async () =>
        new Response("secret upstream text", { status: code })) as typeof fetch,
    );
    assert.equal(receipt.status, expected);
    assert.doesNotMatch(JSON.stringify(receipt), /secret upstream/);
  }
});

test("input and unknown-recipient errors perform no network call or receipt write", async (t) => {
  const { bots, root } = fixture(t);
  let count = 0;
  const send = (async () => {
    count++;
    return new Response();
  }) as typeof fetch;
  await assert.rejects(bots.send("missing", "hello", "x", send));
  await assert.rejects(bots.send("test", " ", "x", send));
  await assert.rejects(bots.send("test", "hello", "../unsafe", send));
  await assert.rejects(bots.send("test", "😀".repeat(9000), "x", send));
  assert.equal(count, 0);
  assert.deepEqual(readdirSync(root), ["config.json"]);
});

test("receipt listing keeps readable entries and counts damaged or nonprivate files", async (t) => {
  const { root, bots } = fixture(t);
  await bots.send(
    "test",
    "hello",
    "good",
    (async () => new Response("", { status: 200 })) as typeof fetch,
  );
  const dir = join(root, "receipts");
  writeFileSync(join(dir, "invalid-json.json"), "{", { mode: 0o600 });
  writeFileSync(
    join(dir, "no-date.json"),
    JSON.stringify({ requestId: "no-date", status: "unknown" }),
    { mode: 0o600 },
  );
  writeFileSync(
    join(dir, "nonprivate.json"),
    readFileSync(join(dir, "good.json")),
    { mode: 0o644 },
  );
  const result = bots.recent();
  assert.equal(result.skipped, 3);
  assert.deepEqual(
    result.receipts.map((receipt) => receipt.requestId),
    ["good"],
  );
  assert.throws(() => bots.receipt("no-date"), /No readable receipt/);
  assert.throws(() => bots.receipt("nonprivate"), /No readable receipt/);
});

test("setup lock refuses overlap and is released after validation failure", (t) => {
  const { root, bots } = fixture(t);
  writeFileSync(join(root, ".setup.lock"), "999999", { mode: 0o600 });
  assert.throws(() => bots.add("second", bot), /already running/);
  assert.deepEqual(
    bots.list().map((bot) => bot.alias),
    ["test"],
  );
  unlinkSync(join(root, ".setup.lock"));
  assert.throws(() => bots.add("second", { ...bot, key: "bad key" }));
  bots.add("second", bot);
  assert.deepEqual(
    bots.list().map((bot) => bot.alias),
    ["test", "second"],
  );
});

test("concurrent setup successes retain every alias; same-alias overwrite is refused", async (t) => {
  const { root } = fixture(t);
  const add = (alias: string) =>
    new Promise<{ alias: string; code: number | null; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(
          process.execPath,
          [join(__dirname, "../cli/grok-bots.ts"), "add", alias, "--stdin"],
          {
            env: { ...process.env, HOME: root },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        let stderr = "";
        child.stdout.resume();
        child.stderr.on("data", (data) => {
          stderr += data;
        });
        child.on("error", reject);
        child.on("exit", (code) => resolve({ alias, code, stderr }));
        child.stdin.end(JSON.stringify(bot));
      },
    );
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => add(`bot-${i}`)),
  );
  const saved = new Bots(join(root, ".config", "grok-bots"))
    .list()
    .map((bot) => bot.alias)
    .sort();
  assert.deepEqual(
    saved,
    results
      .filter((result) => result.code === 0)
      .map((result) => result.alias)
      .sort(),
  );
  for (const failure of results.filter((result) => result.code !== 0))
    assert.match(failure.stderr, /already running/);
  const same = await Promise.all([add("same"), add("same")]);
  assert.equal(same.filter((result) => result.code === 0).length, 1);
  assert.match(
    same.find((result) => result.code !== 0)!.stderr,
    /already running|already exists/,
  );
});

test("terminal setup cannot recall hidden credentials via history or kill ring", (t) => {
  const { root } = fixture(t);
  const script = `import os,pty,select,subprocess,sys,time,json
master,slave=pty.openpty()
env=dict(os.environ,HOME=sys.argv[3])
p=subprocess.Popen([sys.argv[1],sys.argv[2],'add','interactive'],stdin=slave,stdout=slave,stderr=slave,env=env)
os.close(slave)
transcript=b''
def until(marker):
 global transcript
 deadline=time.monotonic()+5
 while marker not in transcript:
  if time.monotonic()>deadline: raise RuntimeError('prompt timeout')
  if select.select([master],[],[],0.1)[0]:
   data=os.read(master,65536)
   if not data: raise RuntimeError('terminal closed')
   transcript+=data
try:
 until(b'Bot display name: ')
 os.write(master,b'Terminal test\\n')
 until(b'Webhook URL (hidden): ')
 os.write(master,b'https://api2.cursor.sh/automations/webhook/hidden-test-id\\n')
 until(b'Webhook key (hidden): ')
 os.write(master,b'hidden-credential-test-key\\x15hidden-credential-test-key\\n')
 until(b'Bot chat HTTPS link (optional): ')
 os.write(master,b'\\x1b[A\\x19\\n')
 until(b'Saved interactive.')
 code=p.wait(timeout=5)
 print(json.dumps({'code':code,'transcript':transcript.decode(errors='replace')}))
finally:
 if p.poll() is None: p.kill();p.wait()
 os.close(master)
`;
  const result = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        script,
        process.execPath,
        join(__dirname, "../cli/grok-bots.ts"),
        root,
      ],
      { encoding: "utf8", timeout: 15000 },
    ),
  );
  assert.equal(result.code, 0);
  assert.doesNotMatch(
    result.transcript,
    /hidden-credential-test-key|hidden-test-id/,
  );
});
