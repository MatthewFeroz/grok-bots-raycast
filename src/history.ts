import { readReceipt, Receipt } from "./sender";

export interface Storage {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<void>;
}
const key = "delivery-receipts-v1";
let writes: Promise<void> = Promise.resolve();

export async function loadHistory(storage: Storage): Promise<Receipt[]> {
  const raw = await storage.getItem(key);
  if (!raw) return [];
  // A corrupt journal must not silently become empty and lose uncertain IDs.
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error("Cannot read delivery history.");
  const receipts = rows.map((row) => readReceipt(row));
  if (receipts.some((row) => !row))
    throw new Error("Cannot read delivery history.");
  return (receipts as Receipt[]).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export function saveReceipt(storage: Storage, receipt: Receipt): Promise<void> {
  // A delayed refresh must not overwrite a newer pending ID.
  const write = writes.then(async () => {
    const history = await loadHistory(storage);
    const next = [
      receipt,
      ...history.filter((row) => row.requestId !== receipt.requestId),
    ];
    await storage.setItem(key, JSON.stringify(next));
  });
  writes = write.catch(() => {});
  return write;
}

// Journal first. Failure here must prevent transmission entirely.
export async function deliver(
  storage: Storage,
  pending: Receipt,
  message: string,
  send: (pending: Receipt, message: string) => Promise<Receipt>,
): Promise<Receipt> {
  await saveReceipt(storage, pending);
  const receipt = await send(pending, message);
  try {
    await saveReceipt(storage, receipt);
  } catch {
    /* Original unknown ID remains available for inspection. */
  }
  return receipt;
}
