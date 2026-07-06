import React from "react";
import { createRoot } from "react-dom/client";
import type {
  ActivitySummary,
  ArtifactSummary,
  BootstrapPayload,
  MemberSummary,
  MessageSummary,
  RoomSummary,
  ThreadStateSummary,
  ThreadStatus,
  WorkspaceEvent
} from "../shared/types";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

type ContextMode = "thread" | "roster" | "activity";
type SendState = "idle" | "sending" | "failed";

interface ThreadSummary {
  id: string;
  parent: MessageSummary;
  replies: MessageSummary[];
  status: ThreadStatus;
  label: string;
}

function useBootstrap(): {
  data: BootstrapPayload | null;
  error: string | null;
} {
  const [data, setData] = React.useState<BootstrapPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    fetch("/api/bootstrap")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Bootstrap failed with ${response.status}`);
        }
        return response.json() as Promise<BootstrapPayload>;
      })
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Bootstrap failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}

function App() {
  const { data, error } = useBootstrap();
  const [selectedRoomId, setSelectedRoomId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<MessageSummary[]>([]);
  const [artifacts, setArtifacts] = React.useState<ArtifactSummary[]>([]);
  const [eventState, setEventState] = React.useState("connecting");
  const [contextMode, setContextMode] = React.useState<ContextMode>("roster");
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
  const [mobileTab, setMobileTab] = React.useState<"chats" | "activity" | "roster">("chats");
  const [announce, setAnnounce] = React.useState("");

  React.useEffect(() => {
    if (!data) {
      return;
    }
    setSelectedRoomId((current) => current ?? data.rooms[0]?.id ?? null);
    setMessages(data.messages);
    setArtifacts(data.artifacts);
  }, [data]);

  React.useEffect(() => {
    if (!data) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/workspaces/${data.workspace.id}/events/ws?token=${data.eventToken}`
    );

    socket.addEventListener("message", (event) => {
      const parsed = JSON.parse(String(event.data)) as WorkspaceEvent;
      setEventState(parsed.type === "connection.ready" ? "live" : `${parsed.type} #${parsed.sequence}`);
      applyWorkspaceEvent(parsed, setMessages, setArtifacts);
      if (parsed.type === "message.created") {
        const message = parsed.payload.message as MessageSummary | undefined;
        setAnnounce(message ? `New message: ${message.body}` : "New message received");
      }
      if (parsed.type === "artifact.created") {
        const artifact = parsed.payload.artifact as ArtifactSummary | undefined;
        setAnnounce(artifact ? `New artifact: ${artifact.title}` : "New artifact received");
      }
    });
    socket.addEventListener("open", () => setEventState("live"));
    socket.addEventListener("close", () => setEventState("reconnecting"));
    socket.addEventListener("error", () => setEventState("offline"));

    return () => socket.close();
  }, [data]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement ||
        target?.isContentEditable;
      if (isTyping) {
        return;
      }
      if (event.key.toLowerCase() === "c") {
        document.querySelector<HTMLInputElement>("[data-composer-input]")?.focus();
      }
      if (event.key.toLowerCase() === "t") {
        const firstThread = selectedRoomId
          ? getThreads(messages, data?.threadStates ?? []).find((thread) => thread.parent.roomId === selectedRoomId)
          : null;
        if (firstThread) {
          openThread(firstThread.id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data, messages, selectedRoomId]);

  if (error) {
    return <div className="loading">Could not load workspace: {error}</div>;
  }

  if (!data) {
    return <div className="loading">Loading workspace...</div>;
  }

  const currentMember = data.members.find((member) => member.kind === "human") ?? data.members[0];
  const workspaceId = data.workspace.id;
  const selectedRoom = data.rooms.find((room) => room.id === selectedRoomId) ?? data.rooms[0];
  const threads = getThreads(messages, data.threadStates);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const roomMessages = messages.filter(
    (message) => message.roomId === selectedRoom?.id && !message.parentMessageId && !message.deletedAt
  );

  function selectRoom(roomId: string): void {
    setSelectedRoomId(roomId);
    setSelectedThreadId(null);
    setContextMode("roster");
    setMobileTab("chats");
  }

  function openThread(threadId: string): void {
    setSelectedThreadId(threadId);
    setContextMode("thread");
  }

  async function sendMessage(roomId: string, body: string, mentions: string[], parentMessageId?: string): Promise<void> {
    if (!currentMember) {
      throw new Error("No current member available");
    }

    const sourceClientId = `ui:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const endpoint = parentMessageId ? `/api/messages/${parentMessageId}/replies` : `/api/rooms/${roomId}/messages`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        authorMemberId: currentMember.id,
        body,
        mentions,
        sourceClientId
      })
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => ({ error: "Message failed" }))) as { error?: string };
      throw new Error(detail.error ?? `Message failed with ${response.status}`);
    }

    const result = (await response.json()) as { message: MessageSummary };
    mergeMessage(setMessages, result.message);
    setAnnounce("Message sent");
  }

  async function resolveDecisionBlock(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void> {
    if (!currentMember) {
      throw new Error("No current member available");
    }
    const decisionBlockId = typeof block.id === "string" ? block.id : "";
    const expectedUpdatedAt = typeof block.updatedAt === "string" ? block.updatedAt : undefined;
    if (!decisionBlockId) {
      throw new Error("Decision block is missing its durable id");
    }

    const response = await fetch(`/api/decision-blocks/${decisionBlockId}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resolvedByMemberId: currentMember.id,
        result,
        expectedUpdatedAt
      })
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => ({ error: "Decision did not submit" }))) as { error?: string };
      throw new Error(detail.error ?? `Decision failed with ${response.status}`);
    }

    const resolved = (await response.json()) as { message: MessageSummary };
    mergeMessage(setMessages, resolved.message);
    setAnnounce("Decision submitted");
  }

  return (
    <main className="workspace-shell">
      <LeftRail
        workspaceName={data.workspace.name}
        rooms={data.rooms}
        members={data.members}
        selectedRoomId={selectedRoom?.id ?? ""}
        onSelectRoom={selectRoom}
        activity={data.activity}
        onOpenActivity={() => {
          setContextMode("activity");
          setMobileTab("activity");
        }}
        currentMemberId={currentMember?.id ?? null}
      />
      <ConversationPane
        room={selectedRoom}
        messages={roomMessages}
        artifacts={artifacts}
        members={data.members}
        eventState={eventState}
        threads={threads}
        currentMember={currentMember}
        onOpenThread={openThread}
        onToggleRoster={() => setContextMode((mode) => (mode === "roster" ? "activity" : "roster"))}
        onSendMessage={(body, mentions) => selectedRoom && sendMessage(selectedRoom.id, body, mentions)}
        onResolveDecision={resolveDecisionBlock}
      />
      <ContextPane
        mode={contextMode}
        selectedThread={selectedThread}
        artifacts={artifacts}
        members={data.members}
        activity={data.activity}
        currentMember={currentMember}
        room={selectedRoom}
        onModeChange={setContextMode}
        onJumpToRoom={selectRoom}
        onSendThreadReply={(body, mentions) => {
          if (!selectedThread) {
            throw new Error("No thread is selected");
          }
          return sendMessage(selectedThread.parent.roomId, body, mentions, selectedThread.parent.id);
        }}
        onResolveDecision={resolveDecisionBlock}
      />
      <MobileTabs
        active={mobileTab}
        actionNeeded={getActionNeededCount(data.activity, currentMember?.id ?? null)}
        onSelect={(tab) => {
          setMobileTab(tab);
          if (tab === "activity") {
            setContextMode("activity");
          }
          if (tab === "roster") {
            setContextMode("roster");
          }
        }}
      />
      <div className="sr-only" aria-live="polite">{announce}</div>
    </main>
  );
}

function applyWorkspaceEvent(
  event: WorkspaceEvent,
  setMessages: React.Dispatch<React.SetStateAction<MessageSummary[]>>,
  setArtifacts: React.Dispatch<React.SetStateAction<ArtifactSummary[]>>
): void {
  const message = event.payload.message as MessageSummary | undefined;
  if (event.type === "message.created" || event.type === "message.updated" || event.type === "message.deleted") {
    if (message) {
      mergeMessage(setMessages, message);
    }
    return;
  }
  if (event.type === "artifact.created") {
    const artifact = event.payload.artifact as ArtifactSummary | undefined;
    if (artifact) {
      mergeArtifact(setArtifacts, artifact);
    }
  }
}

function mergeMessage(
  setMessages: React.Dispatch<React.SetStateAction<MessageSummary[]>>,
  message: MessageSummary
): void {
  setMessages((current) => {
    const existingIndex = current.findIndex(
      (candidate) =>
        candidate.id === message.id ||
        (candidate.sourceClientId && message.sourceClientId && candidate.sourceClientId === message.sourceClientId)
    );
    if (existingIndex === -1) {
      return [...current, message].sort(sortByCreatedAt);
    }
    const next = [...current];
    next[existingIndex] = message;
    return next.sort(sortByCreatedAt);
  });
}

function sortByCreatedAt(left: MessageSummary, right: MessageSummary): number {
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function mergeArtifact(
  setArtifacts: React.Dispatch<React.SetStateAction<ArtifactSummary[]>>,
  artifact: ArtifactSummary
): void {
  setArtifacts((current) => {
    const existingIndex = current.findIndex((candidate) => candidate.id === artifact.id);
    if (existingIndex === -1) {
      return [...current, artifact].sort(sortArtifactsByCreatedAt);
    }
    const next = [...current];
    next[existingIndex] = artifact;
    return next.sort(sortArtifactsByCreatedAt);
  });
}

function sortArtifactsByCreatedAt(left: ArtifactSummary, right: ArtifactSummary): number {
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function getThreads(messages: MessageSummary[], threadStates: ThreadStateSummary[] = []): ThreadSummary[] {
  const parents = new Map<string, MessageSummary>();
  const repliesByParent = new Map<string, MessageSummary[]>();
  const statesByThreadId = new Map(threadStates.map((thread) => [thread.id, thread]));
  const statesByRootMessageId = new Map(
    threadStates.flatMap((thread) => (thread.rootMessageId ? [[thread.rootMessageId, thread] as const] : []))
  );

  for (const message of messages) {
    if (!message.parentMessageId) {
      parents.set(message.id, message);
      continue;
    }
    const replies = repliesByParent.get(message.parentMessageId) ?? [];
    replies.push(message);
    repliesByParent.set(message.parentMessageId, replies);
  }

  return [...repliesByParent.entries()]
    .map(([parentId, replies]) => {
      const parent = parents.get(parentId);
      if (!parent) {
        return null;
      }
      const sortedReplies = replies.filter((reply) => !reply.deletedAt).sort(sortByCreatedAt);
      const id = sortedReplies[0]?.threadId ?? parent.threadId ?? parent.id;
      const liveState = statesByThreadId.get(id) ?? statesByRootMessageId.get(parent.id);
      return {
        id,
        parent,
        replies: sortedReplies,
        status: liveState?.status ?? deriveThreadStatus(sortedReplies),
        label: deriveThreadLabel(parent)
      };
    })
    .filter((thread): thread is ThreadSummary => Boolean(thread));
}

function deriveThreadStatus(messages: MessageSummary[]): ThreadSummary["status"] {
  if (messages.some((message) => message.blocks.some((block) => block.type === "decision" && block.status !== "resolved"))) {
    return "waiting";
  }
  if (messages.some((message) => message.blocks.some((block) => block.type === "progress") && message.authorKind === "agent")) {
    return "working";
  }
  return "done";
}

function getActionNeededCount(activity: ActivitySummary[], currentMemberId: string | null): number {
  return activity.filter(
    (item) =>
      item.state === "action_needed" &&
      (!item.actionOwnerMemberId || !currentMemberId || item.actionOwnerMemberId === currentMemberId)
  ).length;
}

function deriveThreadLabel(parent: MessageSummary): string {
  const cleaned = parent.body.replace(/@\w+/g, "").replace(/[^\w\s-]/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 4);
  return words.length > 0 ? words.join(" ") : "Thread";
}

function LeftRail(props: {
  workspaceName: string;
  rooms: RoomSummary[];
  members: MemberSummary[];
  selectedRoomId: string;
  onSelectRoom(roomId: string): void;
  activity: ActivitySummary[];
  currentMemberId: string | null;
  onOpenActivity(): void;
}) {
  const channels = props.rooms.filter((room) => room.kind === "channel");
  const dms = props.rooms.filter((room) => room.kind === "dm");
  const actionsNeeded = getActionNeededCount(props.activity, props.currentMemberId);

  function onRailKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const rooms = [...channels, ...dms];
    const currentIndex = rooms.findIndex((room) => room.id === props.selectedRoomId);
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + offset + rooms.length) % rooms.length;
    props.onSelectRoom(rooms[nextIndex].id);
    event.preventDefault();
  }

  return (
    <aside className="rail" aria-label="Workspace conversations" onKeyDown={onRailKeyDown}>
      <div className="workspace-name">
        <span>{props.workspaceName}</span>
        <span className="chevron" aria-hidden="true">⌄</span>
      </div>
      <button className="activity-button" type="button" onClick={props.onOpenActivity}>
        <span>Activity</span>
        <span className="badge" aria-label={`${actionsNeeded} items need attention`}>{actionsNeeded}</span>
      </button>

      <RailSection title="Channels">
        {channels.map((room) => (
          <RoomButton
            key={room.id}
            room={room}
            selected={room.id === props.selectedRoomId}
            onSelect={() => props.onSelectRoom(room.id)}
          />
        ))}
      </RailSection>

      <RailSection title="Direct messages">
        {dms.map((room) => {
          const agent = props.members.find((member) => room.memberIds.includes(member.id) && member.kind === "agent");
          return (
            <button
              className={`rail-item ${room.id === props.selectedRoomId ? "selected" : ""}`}
              key={room.id}
              type="button"
              onClick={() => props.onSelectRoom(room.id)}
              aria-current={room.id === props.selectedRoomId ? "page" : undefined}
            >
              {agent ? <PresenceDot state={agent.presenceState} /> : null}
              <span>{room.name}</span>
              {agent ? <span className="state-word">{presenceText(agent.presenceState)}</span> : null}
              {room.unreadCount > 0 ? <span className="mini-badge">{room.unreadCount}</span> : null}
            </button>
          );
        })}
      </RailSection>

      <button className="add-agent" type="button">+ Add agent</button>
    </aside>
  );
}

function RailSection(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rail-section">
      <h2>{props.title}</h2>
      <div className="rail-items">{props.children}</div>
    </section>
  );
}

function RoomButton(props: { room: RoomSummary; selected: boolean; onSelect(): void }) {
  return (
    <button
      className={`rail-item ${props.selected ? "selected" : ""}`}
      type="button"
      onClick={props.onSelect}
      aria-current={props.selected ? "page" : undefined}
    >
      <span className="hash" aria-hidden="true">#</span>
      <span>{props.room.name}</span>
      {props.room.unreadCount > 0 ? <span className="mini-badge">{props.room.unreadCount}</span> : null}
    </button>
  );
}

function ConversationPane(props: {
  room: RoomSummary | undefined;
  messages: MessageSummary[];
  artifacts: ArtifactSummary[];
  members: MemberSummary[];
  eventState: string;
  threads: ThreadSummary[];
  currentMember: MemberSummary | undefined;
  onOpenThread(threadId: string): void;
  onToggleRoster(): void;
  onSendMessage(body: string, mentions: string[]): Promise<void>;
  onResolveDecision(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void>;
}) {
  const streamRef = React.useRef<HTMLDivElement | null>(null);
  const title = props.room?.kind === "channel" ? `# ${props.room.name}` : `DM · ${props.room?.name ?? ""}`;
  const roomMembers = props.members.filter((member) => props.room?.memberIds.includes(member.id));

  React.useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [props.messages.length, props.room?.id]);

  return (
    <section className="conversation" aria-label="Conversation">
      <header className="conversation-header">
        <div>
          <h1>{title}</h1>
          <p>{props.room?.topic ?? "Workspace conversation"}</p>
        </div>
        <div className="header-actions">
          <span className={`socket-pill ${props.eventState === "offline" ? "offline" : ""}`}>{props.eventState}</span>
          <button type="button" aria-label="Search">⌕</button>
          <button type="button" aria-label="Toggle roster and activity" onClick={props.onToggleRoster}>☰</button>
        </div>
      </header>

      <div className="message-stream" ref={streamRef}>
        {props.messages.map((message) => {
          const author = props.members.find((member) => member.id === message.authorMemberId);
          const thread = props.threads.find((candidate) => candidate.parent.id === message.id);
          return (
            <MessageRow
              key={message.id}
              message={message}
              artifacts={props.artifacts.filter((artifact) => artifact.messageId === message.id)}
              author={author}
              members={props.members}
              thread={thread}
              onOpenThread={props.onOpenThread}
              onResolveDecision={props.onResolveDecision}
            />
          );
        })}
      </div>

      {props.room ? (
        <Composer
          label={`Message ${props.room.kind === "channel" ? `#${props.room.name}` : props.room.name}`}
          members={roomMembers}
          onSend={props.onSendMessage}
          autoFocus
        />
      ) : null}
    </section>
  );
}

function MessageRow(props: {
  message: MessageSummary;
  artifacts: ArtifactSummary[];
  author: MemberSummary | undefined;
  members: MemberSummary[];
  thread: ThreadSummary | undefined;
  onOpenThread(threadId: string): void;
  onResolveDecision(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void>;
}) {
  const initials = props.author?.displayName.slice(0, 2).toUpperCase() ?? "--";
  const time = formatTime(props.message.createdAt);

  return (
    <article className="message-row">
      <div className={`avatar ${props.author?.kind === "agent" ? "agent" : "human"}`} aria-hidden="true">{initials}</div>
      <div className="message-body">
        <div className="message-meta">
          <strong>{props.author?.displayName ?? "Unknown"}</strong>
          {props.author ? <PresenceDot state={props.author.presenceState} /> : null}
          {props.author?.kind === "agent" ? <span className="agent-tag">agent</span> : null}
          <span>{time}</span>
        </div>
        <p>{renderMessageText(props.message.body, props.members)}</p>
        {props.message.blocks.map((block, index) => (
          <MessageBlock block={block} key={index} onResolveDecision={props.onResolveDecision} />
        ))}
        <ArtifactList artifacts={props.artifacts} compact={false} />
        {props.thread ? <ThreadAnchor thread={props.thread} onOpenThread={props.onOpenThread} /> : null}
      </div>
    </article>
  );
}

function ThreadAnchor(props: { thread: ThreadSummary; onOpenThread(threadId: string): void }) {
  return (
    <button className="thread-anchor" type="button" onClick={() => props.onOpenThread(props.thread.id)}>
      <span aria-hidden="true">↳</span>
      <span>{props.thread.label}</span>
      <StatusChip status={props.thread.status} />
      <span>{props.thread.replies.length} {props.thread.replies.length === 1 ? "reply" : "replies"}</span>
    </button>
  );
}

function MessageBlock(props: {
  block: Record<string, unknown>;
  onResolveDecision(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void>;
}) {
  const [choice, setChoice] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [submitState, setSubmitState] = React.useState<"idle" | "sending" | "failed">("idle");
  const [error, setError] = React.useState("");

  if (props.block.type === "progress") {
    const lines = Array.isArray(props.block.lines) ? props.block.lines.map(String) : [];
    return (
      <div className="progress-block" role="status" aria-label="Progress">
        {lines.map((line) => (
          <div key={line}><span aria-hidden="true">▹</span> {line}</div>
        ))}
      </div>
    );
  }

  if (props.block.type === "decision") {
    const kind = typeof props.block.kind === "string" ? props.block.kind : "pick_one";
    const options = Array.isArray(props.block.options) ? props.block.options.map(String) : [];
    const status = typeof props.block.status === "string" ? props.block.status : "open";
    const prompt = typeof props.block.prompt === "string" ? props.block.prompt : "Choose a direction so the work can continue.";
    const title = String(props.block.title ?? "answer");
    const disabled = submitState === "sending" || typeof props.block.id !== "string";

    async function submit(result: Record<string, unknown>): Promise<void> {
      setSubmitState("sending");
      setError("");
      try {
        await props.onResolveDecision(props.block, result);
        setSubmitState("idle");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Decision did not submit");
        setSubmitState("failed");
      }
    }

    if (status === "resolved") {
      return (
        <div className="decision-block resolved" role="group" aria-label="Decision resolved">
          <div className="decision-title">✓ Decision resolved</div>
          <p>{decisionReceiptText(props.block)}</p>
        </div>
      );
    }

    return (
      <div className="decision-block" role="group" aria-label={`Decision ${title}`}>
        <div className="decision-title">◇ Decision · {title}</div>
        <p>{prompt}</p>
        {kind === "approve_reject" ? (
          <div className="decision-actions">
            <button type="button" disabled={disabled} onClick={() => void submit({ decision: "approved" })}>
              {String(props.block.approveLabel ?? "Approve")}
            </button>
            <button type="button" className="secondary" disabled={disabled} onClick={() => void submit({ decision: "rejected" })}>
              {String(props.block.rejectLabel ?? "Reject")}
            </button>
          </div>
        ) : null}
        {kind === "short_question" ? (
          <>
            <textarea
              value={answer}
              maxLength={Number(props.block.maxLength ?? 500)}
              placeholder={String(props.block.placeholder ?? "Type your answer")}
              onChange={(event) => {
                setAnswer(event.target.value);
                setSubmitState("idle");
              }}
            />
            <button type="button" disabled={disabled || !answer.trim()} onClick={() => void submit({ answer: answer.trim() })}>
              {submitState === "sending" ? "Submitting..." : "Submit"}
            </button>
          </>
        ) : null}
        {kind !== "approve_reject" && kind !== "short_question" ? (
          <>
            <div className="decision-options">
              {options.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name={`direction-${String(props.block.id ?? title)}`}
                    checked={choice === option}
                    onChange={() => {
                      setChoice(option);
                      setSubmitState("idle");
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <button type="button" disabled={disabled || !choice} onClick={() => void submit({ choice })}>
              {submitState === "sending" ? "Submitting..." : "Submit"}
            </button>
          </>
        ) : null}
        {typeof props.block.id !== "string" ? <p className="decision-error">Decision is not synced yet.</p> : null}
        {submitState === "failed" ? <p className="decision-error">{error}</p> : null}
      </div>
    );
  }

  return null;
}

function decisionReceiptText(block: Record<string, unknown>): string {
  const result = block.result && typeof block.result === "object" && !Array.isArray(block.result)
    ? (block.result as Record<string, unknown>)
    : {};
  if (result.decision === "approved") {
    return "Approved.";
  }
  if (result.decision === "rejected") {
    return "Rejected.";
  }
  if (typeof result.answer === "string") {
    return `Answered: ${result.answer}`;
  }
  if (typeof result.choice === "string") {
    return `Chose ${result.choice}.`;
  }
  return "Decision receipt recorded.";
}

function ArtifactList(props: { artifacts: ArtifactSummary[]; compact: boolean }) {
  if (props.artifacts.length === 0) {
    return null;
  }

  return (
    <div className={`artifact-list ${props.compact ? "compact" : ""}`} aria-label="Artifacts">
      {props.artifacts.map((artifact) => (
        <ArtifactPreviewCard artifact={artifact} key={artifact.id} />
      ))}
    </div>
  );
}

function ArtifactPreviewCard(props: { artifact: ArtifactSummary }) {
  const { artifact } = props;
  const title = artifact.title || "Untitled artifact";

  return (
    <article className={`artifact-card kind-${artifact.kind}`} aria-label={`${artifact.kind} artifact: ${title}`}>
      <div className="artifact-kind" aria-hidden="true">{artifactIcon(artifact.kind)}</div>
      <div className="artifact-content">
        <div className="artifact-heading">
          <strong>{title}</strong>
          <span>{artifact.kind}</span>
        </div>
        <ArtifactBody artifact={artifact} />
        <div className="artifact-meta">
          {artifact.mimeType ? <span>{artifact.mimeType}</span> : null}
          {artifact.preview.sizeBytes !== undefined ? <span>{formatBytes(artifact.preview.sizeBytes)}</span> : null}
          <span>{formatTime(artifact.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

function ArtifactBody(props: { artifact: ArtifactSummary }) {
  const { artifact } = props;
  const preview = artifact.preview;

  if (artifact.kind === "markdown") {
    return <p className="artifact-excerpt">{preview.excerpt ?? "Markdown preview unavailable."}</p>;
  }

  if (artifact.kind === "link") {
    const href = safeHref(preview.url ?? artifact.externalUrl);
    return (
      <p className="artifact-excerpt">
        {preview.description ?? "Link preview unavailable."}
        {href ? (
          <>
            {" "}
            <a href={href} target="_blank" rel="noreferrer">Open link</a>
          </>
        ) : null}
      </p>
    );
  }

  if (artifact.kind === "image") {
    const src = safeHref(preview.imageUrl ?? artifact.externalUrl);
    return (
      <div className="image-preview">
        {src ? <img src={src} alt={preview.altText ?? artifact.title} loading="lazy" /> : <span>No safe image preview</span>}
        {preview.description ? <p>{preview.description}</p> : null}
        {preview.width && preview.height ? <small>{preview.width} x {preview.height}</small> : null}
      </div>
    );
  }

  return (
    <p className="artifact-excerpt">
      {preview.fileName ?? artifact.storageKey ?? "File metadata only"}
      {preview.description ? ` - ${preview.description}` : ""}
    </p>
  );
}

function artifactIcon(kind: ArtifactSummary["kind"]): string {
  switch (kind) {
    case "markdown":
      return "MD";
    case "link":
      return "↗";
    case "image":
      return "IMG";
    default:
      return "FILE";
  }
}

function safeHref(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function ContextPane(props: {
  mode: ContextMode;
  selectedThread: ThreadSummary | null;
  artifacts: ArtifactSummary[];
  members: MemberSummary[];
  activity: ActivitySummary[];
  currentMember: MemberSummary | undefined;
  room: RoomSummary | undefined;
  onModeChange(mode: ContextMode): void;
  onJumpToRoom(roomId: string): void;
  onSendThreadReply(body: string, mentions: string[]): Promise<void>;
  onResolveDecision(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void>;
}) {
  const agents = props.members.filter((member) => member.kind === "agent");
  const humans = props.members.filter((member) => member.kind === "human");

  return (
    <aside className={`context-pane mode-${props.mode}`} aria-label="Workspace context">
      <div className="context-tabs" role="tablist" aria-label="Context views">
        <button type="button" className={props.mode === "thread" ? "active" : ""} onClick={() => props.onModeChange("thread")}>Thread</button>
        <button type="button" className={props.mode === "roster" ? "active" : ""} onClick={() => props.onModeChange("roster")}>Roster</button>
        <button type="button" className={props.mode === "activity" ? "active" : ""} onClick={() => props.onModeChange("activity")}>Activity</button>
      </div>

      {props.mode === "thread" ? (
        <ThreadPanel
          thread={props.selectedThread}
          artifacts={props.artifacts}
          members={props.members}
          room={props.room}
          onSendThreadReply={props.onSendThreadReply}
          onResolveDecision={props.onResolveDecision}
        />
      ) : null}

      {props.mode === "roster" ? (
        <Roster agents={agents} humans={humans} />
      ) : null}

      {props.mode === "activity" ? (
        <ActivityList
          activity={props.activity}
          members={props.members}
          currentMemberId={props.currentMember?.id ?? null}
          onJumpToRoom={props.onJumpToRoom}
        />
      ) : null}
    </aside>
  );
}

function ThreadPanel(props: {
  thread: ThreadSummary | null;
  artifacts: ArtifactSummary[];
  members: MemberSummary[];
  room: RoomSummary | undefined;
  onSendThreadReply(body: string, mentions: string[]): Promise<void>;
  onResolveDecision(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void>;
}) {
  if (!props.thread) {
    return (
      <section className="empty-thread">
        <div className="pane-heading">
          <h2>Thread</h2>
          <span>none open</span>
        </div>
        <p>Select a thread in the conversation to keep ongoing work in view.</p>
      </section>
    );
  }

  return (
    <section className="thread-panel">
      <div className="pane-heading">
        <div>
          <h2>{props.thread.label}</h2>
          <p>{props.room?.kind === "channel" ? `#${props.room.name}` : props.room?.name}</p>
        </div>
        <StatusChip status={props.thread.status} />
      </div>
      <div className="thread-messages">
        {[props.thread.parent, ...props.thread.replies].map((message) => {
          const author = props.members.find((member) => member.id === message.authorMemberId);
          return (
            <CompactMessage
              key={message.id}
              message={message}
              artifacts={props.artifacts.filter((artifact) => artifact.messageId === message.id)}
              author={author}
              onResolveDecision={props.onResolveDecision}
            />
          );
        })}
      </div>
      <Composer
        label="Reply in thread"
        members={props.members.filter((member) => props.room?.memberIds.includes(member.id))}
        onSend={props.onSendThreadReply}
      />
    </section>
  );
}

function CompactMessage(props: {
  message: MessageSummary;
  artifacts: ArtifactSummary[];
  author: MemberSummary | undefined;
  onResolveDecision(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void>;
}) {
  return (
    <article className="compact-message">
      <div className="message-meta">
        <strong>{props.author?.displayName ?? "Unknown"}</strong>
        {props.author ? <PresenceDot state={props.author.presenceState} /> : null}
        <span>{formatTime(props.message.createdAt)}</span>
      </div>
      <p>{props.message.body}</p>
      {props.message.blocks.map((block, index) => (
        <MessageBlock block={block} key={index} onResolveDecision={props.onResolveDecision} />
      ))}
      <ArtifactList artifacts={props.artifacts} compact />
    </article>
  );
}

function Roster(props: { agents: MemberSummary[]; humans: MemberSummary[] }) {
  return (
    <section>
      <div className="pane-heading">
        <h2>Roster</h2>
        <span>{props.agents.length} agents</span>
      </div>
      <div className="roster-list">
        {[...props.agents, ...props.humans].map((member) => (
          <div className="roster-row" key={member.id}>
            <div className={`avatar ${member.kind === "agent" ? "agent" : "human"}`} aria-hidden="true">
              {member.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <strong>{member.displayName}</strong>
              <p>{member.role ?? member.kind} · {presenceText(member.presenceState)}</p>
            </div>
            <PresenceDot state={member.presenceState} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivityList(props: {
  activity: ActivitySummary[];
  members: MemberSummary[];
  currentMemberId: string | null;
  onJumpToRoom(roomId: string): void;
}) {
  const actionNeeded = props.activity.filter((item) => item.state === "action_needed");
  const recentlyDone = props.activity.filter((item) => item.state === "recently_done");

  return (
    <section className="activity-card">
      <div className="pane-heading">
        <h2>Activity</h2>
        <span>{getActionNeededCount(props.activity, props.currentMemberId)} need you</span>
      </div>
      <ActivityGroup title="Action needed" items={actionNeeded} members={props.members} onJumpToRoom={props.onJumpToRoom} />
      <ActivityGroup title="Recently done" items={recentlyDone} members={props.members} onJumpToRoom={props.onJumpToRoom} />
    </section>
  );
}

function ActivityGroup(props: {
  title: string;
  items: ActivitySummary[];
  members: MemberSummary[];
  onJumpToRoom(roomId: string): void;
}) {
  return (
    <div className="activity-group">
      <h3>{props.title}</h3>
      {props.items.length === 0 ? <p className="empty-copy">You're all caught up.</p> : null}
      {props.items.map((item) => {
        const actor = props.members.find((member) => member.id === item.actorMemberId);
        return (
          <button className="activity-row" key={item.id} type="button" onClick={() => props.onJumpToRoom(item.roomId)}>
            <span aria-hidden="true">{item.state === "action_needed" ? "◐" : "✓"}</span>
            <span>
              <strong>{actor?.displayName ?? "Workspace"}</strong>
              <small>{item.summary}</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        );
      })}
    </div>
  );
}

function Composer(props: {
  label: string;
  members: MemberSummary[];
  onSend(body: string, mentions: string[]): Promise<void>;
  autoFocus?: boolean;
}) {
  const [value, setValue] = React.useState("");
  const [sendState, setSendState] = React.useState<SendState>("idle");
  const [activeMentionIndex, setActiveMentionIndex] = React.useState(0);
  const mention = getMentionQuery(value);
  const mentionMatches = mention
    ? props.members
        .filter((member) => member.handle.toLowerCase().startsWith(mention.query.toLowerCase()))
        .slice(0, 5)
    : [];

  async function submit(): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed || sendState === "sending") {
      return;
    }
    setSendState("sending");
    try {
      await props.onSend(trimmed, extractMentionIds(trimmed, props.members));
      setValue("");
      setSendState("idle");
    } catch {
      setSendState("failed");
    }
  }

  function chooseMention(member: MemberSummary): void {
    if (!mention) {
      return;
    }
    const next = `${value.slice(0, mention.start)}@${member.handle} ${value.slice(mention.end)}`;
    setValue(next);
    setActiveMentionIndex(0);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (mentionMatches.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      const offset = event.key === "ArrowDown" ? 1 : -1;
      setActiveMentionIndex((current) => (current + offset + mentionMatches.length) % mentionMatches.length);
      event.preventDefault();
      return;
    }
    if (mentionMatches.length > 0 && (event.key === "Tab" || event.key === "Enter") && !event.shiftKey) {
      chooseMention(mentionMatches[activeMentionIndex]);
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      void submit();
      event.preventDefault();
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={`composer-${props.label}`}>{props.label}</label>
      <div className="composer-control">
        <input
          id={`composer-${props.label}`}
          data-composer-input
          value={value}
          placeholder="Write a message..."
          autoComplete="off"
          autoFocus={props.autoFocus}
          onChange={(event) => {
            setValue(event.target.value);
            setSendState("idle");
          }}
          onKeyDown={onKeyDown}
          aria-describedby={sendState === "failed" ? "composer-error" : undefined}
        />
        <button type="submit" aria-label="Send message" disabled={!value.trim() || sendState === "sending"}>➤</button>
      </div>
      {mentionMatches.length > 0 ? (
        <div className="mention-menu" role="listbox" aria-label="Mention suggestions">
          {mentionMatches.map((member, index) => (
            <button
              key={member.id}
              className={index === activeMentionIndex ? "active" : ""}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseMention(member)}
            >
              <PresenceDot state={member.presenceState} />
              <span>@{member.handle}</span>
              <small>{member.role ?? member.kind}</small>
            </button>
          ))}
        </div>
      ) : null}
      {sendState === "failed" ? <p className="composer-error" id="composer-error">Message did not send. Try again.</p> : null}
    </form>
  );
}

function MobileTabs(props: {
  active: "chats" | "activity" | "roster";
  actionNeeded: number;
  onSelect(tab: "chats" | "activity" | "roster"): void;
}) {
  return (
    <nav className="mobile-tabs" aria-label="Primary">
      <button className={props.active === "chats" ? "active" : ""} type="button" onClick={() => props.onSelect("chats")}>Chats</button>
      <button className={props.active === "activity" ? "active" : ""} type="button" onClick={() => props.onSelect("activity")}>
        Activity <span>{props.actionNeeded}</span>
      </button>
      <button className={props.active === "roster" ? "active" : ""} type="button" onClick={() => props.onSelect("roster")}>Roster</button>
    </nav>
  );
}

function StatusChip(props: { status: ThreadSummary["status"] }) {
  const labels = {
    working: "● working",
    waiting: "◐ waiting on you",
    done: "✓ done"
  };
  return <span className={`status-chip ${props.status}`}>{labels[props.status]}</span>;
}

function PresenceDot(props: { state: MemberSummary["presenceState"] }) {
  return <span className={`presence ${props.state}`} aria-label={presenceText(props.state)} title={presenceText(props.state)} />;
}

function presenceText(state: MemberSummary["presenceState"]): string {
  switch (state) {
    case "working":
      return "working";
    case "waiting":
      return "waiting on you";
    case "offline":
      return "offline";
    default:
      return "idle";
  }
}

function renderMessageText(body: string, members: MemberSummary[]): React.ReactNode {
  const parts = body.split(/(@\w+)/g);
  return parts.map((part, index) => {
    const handle = part.startsWith("@") ? part.slice(1).toLowerCase() : null;
    const member = handle ? members.find((candidate) => candidate.handle.toLowerCase() === handle) : null;
    return member ? <mark key={`${part}-${index}`}>{part}</mark> : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
}

function getMentionQuery(value: string): { query: string; start: number; end: number } | null {
  const cursor = value.length;
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([a-z0-9_-]*)$/i);
  if (!match || match.index === undefined) {
    return null;
  }
  const start = match.index + match[1].length;
  return { query: match[2], start, end: cursor };
}

function extractMentionIds(body: string, members: MemberSummary[]): string[] {
  const handles = [...body.matchAll(/@([a-z0-9_-]+)/gi)].map((match) => match[1].toLowerCase());
  return members
    .filter((member) => handles.includes(member.handle.toLowerCase()))
    .map((member) => member.id);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
