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
  onUpdate,
}: {
  bots: Bot[];
  onUpdate: () => Promise<void>;
}) {
  const { push } = useNavigation();
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
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
      await onUpdate();
      // This form stays locked after a send. Back cannot accidentally send it twice.
      push(<ReceiptView initial={receipt} onUpdate={onUpdate} />);
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "Send stopped — inspect history",
        message: `Request ${pending.requestId}. Check its receipt before another message.`,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Form
      navigationTitle="Message Grok Bot"
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send Message Once"
            icon={Icon.ArrowUp}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Private Mac sender"
        text="Send to an existing hosted Bot. Credentials stay in the Mac sender. A delivery receipt is not the Bot’s answer."
      />
      <Form.Dropdown id="bot" title="Bot" defaultValue={bots[0]?.alias}>
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
        placeholder="What would you like to tell your Bot?"
        error={error}
        onChange={() => setError(undefined)}
      />
      <Form.Separator />
      <Form.Description
        title="Send once"
        text="No automatic retries. If delivery is unknown, keep the request ID and check Grok Bot before sending again."
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
  const reloadHistory = async () => setHistory(await loadHistory(storage));
  async function load() {
    setBusy(true);
    setError(undefined);
    try {
      await reloadHistory();
      setBots(await sender.list());
    } catch {
      setBots([]);
      setError(
        "Check the existing Mac sender and delivery history in your terminal. Private diagnostics are hidden.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <List
      isLoading={busy}
      navigationTitle="Grok Bots"
      searchBarPlaceholder="Find a Bot or delivery receipt…"
    >
      <List.Section
        title="Compose"
        subtitle="Existing hosted Bots · private Mac sender"
      >
        {bots.length > 0 && (
          <List.Item
            title="New Message"
            subtitle={bots.map((bot) => bot.name).join(" · ")}
            icon={{ source: Icon.ArrowUp, tintColor: Color.Blue }}
            actions={
              <ActionPanel>
                <Action
                  title="Compose Message"
                  onAction={() =>
                    push(<Compose bots={bots} onUpdate={reloadHistory} />)
                  }
                />
                <Action
                  title="Reload Bots"
                  icon={Icon.ArrowClockwise}
                  onAction={load}
                />
              </ActionPanel>
            }
          />
        )}
      </List.Section>
      <List.Section
        title="Delivery history"
        subtitle="Receipts only · answers appear in Grok Bot"
      >
        {history.map((receipt) => (
          <List.Item
            key={receipt.requestId}
            title={states[receipt.status].title}
            subtitle={receipt.bot}
            keywords={[receipt.requestId]}
            icon={{
              source: states[receipt.status].icon,
              tintColor: states[receipt.status].color,
            }}
            accessories={[{ date: new Date(receipt.createdAt) }]}
            actions={
              <ActionPanel>
                <Action
                  title="Inspect Receipt"
                  onAction={() =>
                    push(
                      <ReceiptView
                        initial={receipt}
                        onUpdate={reloadHistory}
                      />,
                    )
                  }
                />
                <Action.CopyToClipboard
                  title="Copy Request ID"
                  content={receipt.requestId}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {bots.length === 0 && (
        <List.EmptyView
          title={error ? "Mac sender unavailable" : "No Bots configured"}
          description={
            error ??
            "Configure aliases privately with grok-bots in your terminal, then reload."
          }
          icon={Icon.Message}
          actions={
            <ActionPanel>
              <Action
                title="Reload"
                onAction={load}
                icon={Icon.ArrowClockwise}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
