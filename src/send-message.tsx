import {
  Action,
  ActionPanel,
  Color,
  closeMainWindow,
  Detail,
  Form,
  Icon,
  List,
  LocalStorage,
  Toast,
  open,
  showToast,
  useNavigation,
} from "@raycast/api";
import { homedir } from "node:os";
import { join } from "node:path";
import { useEffect, useRef, useState } from "react";
import { deliver, loadHistory, saveReceipt, Storage } from "./history";
import { Bot, createRequest, Receipt, Sender, validateMessage } from "./sender";

async function openBot() {
  try {
    await open(join(homedir(), "Applications", "Grok Bot.app"));
    await closeMainWindow();
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not open Grok Bot",
      message: "Open the installed app from your Applications folder.",
    });
  }
}

const sender = new Sender();
const storage: Storage = {
  getItem: (key) => LocalStorage.getItem<string>(key),
  setItem: (key, value) => LocalStorage.setItem(key, value),
};
const states = {
  accepted: {
    title: "Delivery accepted",
    color: Color.Green,
    icon: Icon.CheckCircle,
    text: "The webhook accepted your message. This is a delivery receipt. Read the Bot’s answer in its Grok Bot conversation.",
  },
  rejected: {
    title: "Delivery rejected",
    color: Color.Red,
    icon: Icon.XMarkCircle,
    text: "The webhook rejected this request. Check the existing sender setup in your terminal. No automatic retry was made.",
  },
  unknown: {
    title: "Delivery unknown",
    color: Color.Orange,
    icon: Icon.QuestionMarkCircle,
    text: "The sender may have delivered this message. Keep this request ID and check the actual Bot conversation before composing another message. Refresh only checks the receipt; it never resends.",
  },
};

function ReceiptView({
  initial,
  onUpdate,
}: {
  initial: Receipt;
  onUpdate: () => Promise<void>;
}) {
  const [receipt, setReceipt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const state = states[receipt.status];
  async function refresh() {
    setBusy(true);
    try {
      const next = await sender.status(receipt);
      await saveReceipt(storage, next);
      setReceipt(next);
      await onUpdate();
      await showToast({
        style: Toast.Style.Success,
        title: "Receipt checked",
        message: "No message was sent.",
      });
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "Receipt unavailable",
        message: "Last known state kept. No message was resent.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Detail
      navigationTitle="Delivery receipt"
      isLoading={busy}
      markdown={`# ${state.title}\n\n${state.text}\n\n---\n\n**Request ID**\n\n\`${receipt.requestId}\`\n\nCredentials and message text are not stored in this extension’s history.`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Delivery">
            <Detail.Metadata.TagList.Item
              text={receipt.status}
              color={state.color}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="Bot" text={receipt.bot} />
          <Detail.Metadata.Label
            title="Created"
            text={new Date(receipt.createdAt).toLocaleString()}
          />
          {receipt.httpStatus && (
            <Detail.Metadata.Label
              title="HTTP"
              text={String(receipt.httpStatus)}
            />
          )}
          <Detail.Metadata.Label title="Bot answer" text="Read in Grok Bot" />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title="Refresh Delivery Receipt"
            icon={Icon.ArrowClockwise}
            onAction={refresh}
          />
          <Action
            title="Open Grok Bot"
            icon={Icon.Message}
            onAction={openBot}
          />
          <Action.CopyToClipboard
            title="Copy Request ID"
            content={receipt.requestId}
          />
        </ActionPanel>
      }
    />
  );
}

function Compose({
  bots,
  initialBot,
  onUpdate,
}: {
  bots: Bot[];
  initialBot: Bot;
  onUpdate: () => Promise<void>;
}) {
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [botAlias, setBotAlias] = useState(initialBot.alias);
  const [messageBytes, setMessageBytes] = useState(0);
  const [result, setResult] = useState<Receipt>();
  const selectedBot = bots.find((bot) => bot.alias === botAlias) ?? initialBot;

  async function submit(values: { bot: string; message: string }) {
    if (sending.current) return;
    const problem = validateMessage(values.message);
    if (problem) {
      setError(problem);
      return;
    }
    if (!bots.some((bot) => bot.alias === values.bot)) return;
    sending.current = true;
    setBusy(true);
    const pending = createRequest(values.bot);
    try {
      const receipt = await deliver(
        storage,
        pending,
        values.message,
        (request, message) => sender.send(request, message),
      );
      // Replace the form with its result. Back returns straight to the Bot list.
      // A summary reload must never hide the receipt or leave a spent form.
      setResult(receipt);
    } catch {
      // Keep the original ID visible even if the journal could not be read.
      setResult(pending);
    } finally {
      setBusy(false);
      await onUpdate().catch(() => {});
    }
  }

  if (result) return <ReceiptView initial={result} onUpdate={onUpdate} />;
  return (
    <Form
      navigationTitle={`Message ${selectedBot.name}`}
      isLoading={busy}
      enableDrafts={false}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={busy ? "Sending…" : `Send to ${selectedBot.name}`}
            icon={Icon.ArrowUp}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="bot"
        title="To"
        value={botAlias}
        onChange={setBotAlias}
        storeValue={false}
      >
        {bots.map((bot) => (
          <Form.Dropdown.Item
            key={bot.alias}
            value={bot.alias}
            title={bot.name}
            icon={Icon.Message}
          />
        ))}
      </Form.Dropdown>
      <Form.TextArea
        id="message"
        title="Message"
        placeholder={`What would you like to tell ${selectedBot.name}?`}
        autoFocus
        storeValue={false}
        error={error}
        onChange={(value) => {
          setError(undefined);
          setMessageBytes(Buffer.byteLength(value, "utf8"));
        }}
      />
      {messageBytes > 28_000 && (
        <Form.Description
          title="Length"
          text={`${messageBytes.toLocaleString()} / 32,000 bytes`}
        />
      )}
      <Form.Description
        text={
          busy
            ? `Sending to ${selectedBot.name}… Please wait for the delivery receipt.`
            : "Messages aren’t saved. Replies appear in Grok Bot."
        }
      />
    </Form>
  );
}

export default function Command() {
  const { push } = useNavigation();
  const [bots, setBots] = useState<Bot[]>([]);
  const [history, setHistory] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const reloadHistory = async () => setHistory(await loadHistory(storage));
  async function load() {
    setBusy(true);
    setError(undefined);
    try {
      const receipts = await loadHistory(storage);
      setHistory(receipts);
      const configured = await sender.list();
      setBots(configured);
      const attention = receipts.find(
        (receipt) => receipt.status !== "accepted",
      );
      setSelectedId(
        attention?.requestId ?? (configured[0] && `bot-${configured[0].alias}`),
      );
    } catch {
      setBots([]);
      setError(
        "Check ~/.local/bin/grok-bots and delivery history in your terminal, then reload. Private diagnostics stay hidden.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function receiptRow(receipt: Receipt) {
    const state = states[receipt.status];
    const name =
      bots.find((bot) => bot.alias === receipt.bot)?.name ?? receipt.bot;
    const label = {
      accepted: "Accepted",
      rejected: "Rejected",
      unknown: "Unknown",
    }[receipt.status];
    return (
      <List.Item
        id={receipt.requestId}
        key={receipt.requestId}
        title={name}
        subtitle={
          receipt.status === "unknown"
            ? "Check conversation before resending"
            : undefined
        }
        keywords={[
          receipt.requestId,
          receipt.bot,
          receipt.status,
          "receipt",
          "history",
        ]}
        icon={{ source: state.icon, tintColor: state.color }}
        accessories={[
          { tag: { value: label, color: state.color } },
          {
            date: new Date(receipt.createdAt),
            tooltip: `${new Date(receipt.createdAt).toLocaleString()} · ${receipt.requestId}`,
          },
        ]}
        actions={
          <ActionPanel>
            <Action
              title="View Delivery"
              icon={Icon.Document}
              onAction={() =>
                push(<ReceiptView initial={receipt} onUpdate={reloadHistory} />)
              }
            />
            <Action
              title="Open Grok Bot"
              icon={Icon.Message}
              onAction={openBot}
            />
            <Action.CopyToClipboard
              title="Copy Request ID"
              content={receipt.requestId}
            />
            <Action
              title="Reload Bots and History"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={load}
            />
          </ActionPanel>
        }
      />
    );
  }
  return (
    <List
      isLoading={busy}
      navigationTitle="Grok Bots"
      searchBarPlaceholder="Message a Bot or find a delivery…"
      selectedItemId={selectedId}
      onSelectionChange={(id) => setSelectedId(id ?? undefined)}
    >
      {error && (
        <List.Section title="Connection">
          <List.Item
            id="sender-error"
            title="Sender unavailable"
            subtitle="Reload to reconnect"
            icon={{ source: Icon.ExclamationMark, tintColor: Color.Orange }}
            actions={
              <ActionPanel>
                <Action
                  title="Reload Bots and History"
                  icon={Icon.ArrowClockwise}
                  onAction={load}
                />
                <Action
                  title="Show Setup Help"
                  icon={Icon.Info}
                  onAction={() =>
                    push(
                      <Detail
                        markdown={`# Check the Mac sender\n\n${error}`}
                      />,
                    )
                  }
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      <List.Section title="Needs attention">
        {history
          .filter((receipt) => receipt.status !== "accepted")
          .map(receiptRow)}
      </List.Section>
      <List.Section title="Message a Bot">
        {bots.map((bot) => (
          <List.Item
            id={`bot-${bot.alias}`}
            key={bot.alias}
            title={bot.name}
            subtitle="Write a message"
            keywords={[bot.alias, "new", "compose", "send"]}
            icon={{ source: Icon.Message, tintColor: Color.Blue }}
            actions={
              <ActionPanel>
                <Action
                  title={`Message ${bot.name}`}
                  icon={Icon.Pencil}
                  onAction={() =>
                    push(
                      <Compose
                        bots={bots}
                        initialBot={bot}
                        onUpdate={reloadHistory}
                      />,
                    )
                  }
                />
                <Action
                  title="Open Grok Bot"
                  icon={Icon.Message}
                  onAction={openBot}
                />
                <Action
                  title="Reload Bots and History"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={load}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section
        title="Recent deliveries"
        subtitle="Message text isn’t saved"
      >
        {history
          .filter((receipt) => receipt.status === "accepted")
          .map(receiptRow)}
      </List.Section>
      {!busy && !error && (
        <List.EmptyView
          title="No Bots configured"
          description="Add a Bot privately with grok-bots in your terminal, then reload."
          icon={Icon.Message}
          actions={
            <ActionPanel>
              <Action
                title="Reload Bots"
                icon={Icon.ArrowClockwise}
                onAction={load}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
