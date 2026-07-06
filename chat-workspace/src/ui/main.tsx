import React from "react";
import { createRoot } from "react-dom/client";
import type {
  ActivitySummary,
  BootstrapPayload,
  MemberSummary,
  MessageSummary,
  RoomSummary
} from "../shared/types";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
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
  const [eventState, setEventState] = React.useState("connecting");

  React.useEffect(() => {
    if (!data) {
      return;
    }

    setSelectedRoomId((current) => current ?? data.rooms[0]?.id ?? null);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/workspaces/${data.workspace.id}/events/ws?token=${data.eventToken}`
    );

    socket.addEventListener("message", (event) => {
      const parsed = JSON.parse(String(event.data)) as { type: string; sequence: number };
      setEventState(`${parsed.type} #${parsed.sequence}`);
    });
    socket.addEventListener("open", () => setEventState("live"));
    socket.addEventListener("close", () => setEventState("reconnecting"));
    socket.addEventListener("error", () => setEventState("offline"));

    return () => socket.close();
  }, [data]);

  if (error) {
    return <div className="loading">Could not load workspace: {error}</div>;
  }

  if (!data) {
    return <div className="loading">Loading workspace...</div>;
  }

  const selectedRoom = data.rooms.find((room) => room.id === selectedRoomId) ?? data.rooms[0];
  const roomMessages = data.messages.filter((message) => message.roomId === selectedRoom?.id);
  const agents = data.members.filter((member) => member.kind === "agent");

  return (
    <main className="workspace-shell">
      <LeftRail
        workspaceName={data.workspace.name}
        rooms={data.rooms}
        members={data.members}
        selectedRoomId={selectedRoom?.id ?? ""}
        onSelectRoom={setSelectedRoomId}
        activity={data.activity}
      />
      <ConversationPane
        room={selectedRoom}
        messages={roomMessages}
        members={data.members}
        eventState={eventState}
      />
      <ContextPane agents={agents} activity={data.activity} />
    </main>
  );
}

function LeftRail(props: {
  workspaceName: string;
  rooms: RoomSummary[];
  members: MemberSummary[];
  selectedRoomId: string;
  onSelectRoom(roomId: string): void;
  activity: ActivitySummary[];
}) {
  const channels = props.rooms.filter((room) => room.kind === "channel");
  const dms = props.rooms.filter((room) => room.kind === "dm");
  const actionsNeeded = props.activity.filter((item) => item.state === "action_needed").length;

  return (
    <aside className="rail" aria-label="Workspace conversations">
      <div className="workspace-name">
        <span>{props.workspaceName}</span>
        <span className="chevron">v</span>
      </div>
      <button className="activity-button" type="button">
        <span>Activity</span>
        <span className="badge">{actionsNeeded}</span>
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
            >
              {agent ? <PresenceDot state={agent.presenceState} /> : null}
              <span>{room.name}</span>
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
    <button className={`rail-item ${props.selected ? "selected" : ""}`} type="button" onClick={props.onSelect}>
      <span className="hash">#</span>
      <span>{props.room.name}</span>
      {props.room.unreadCount > 0 ? <span className="mini-badge">{props.room.unreadCount}</span> : null}
    </button>
  );
}

function ConversationPane(props: {
  room: RoomSummary | undefined;
  messages: MessageSummary[];
  members: MemberSummary[];
  eventState: string;
}) {
  const title = props.room?.kind === "channel" ? `# ${props.room.name}` : `DM · ${props.room?.name ?? ""}`;

  return (
    <section className="conversation" aria-label="Conversation">
      <header className="conversation-header">
        <div>
          <h1>{title}</h1>
          <p>{props.room?.topic ?? "Workspace conversation"}</p>
        </div>
        <div className="header-actions">
          <span className="socket-pill">{props.eventState}</span>
          <button type="button" aria-label="Search">⌕</button>
          <button type="button" aria-label="Roster">☰</button>
        </div>
      </header>

      <div className="message-stream">
        {props.messages.map((message) => {
          const author = props.members.find((member) => member.id === message.authorMemberId);
          return <MessageRow key={message.id} message={message} author={author} />;
        })}
      </div>

      <form className="composer">
        <label htmlFor="message">Message {props.room?.kind === "channel" ? `#${props.room.name}` : props.room?.name}</label>
        <div>
          <input id="message" placeholder="Write a message..." />
          <button type="button" aria-label="Send message">➤</button>
        </div>
      </form>
    </section>
  );
}

function MessageRow(props: { message: MessageSummary; author: MemberSummary | undefined }) {
  const initials = props.author?.displayName.slice(0, 2).toUpperCase() ?? "--";
  const time = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    new Date(props.message.createdAt)
  );

  return (
    <article className="message-row">
      <div className={`avatar ${props.author?.kind === "agent" ? "agent" : "human"}`}>{initials}</div>
      <div className="message-body">
        <div className="message-meta">
          <strong>{props.author?.displayName ?? "Unknown"}</strong>
          {props.author ? <PresenceDot state={props.author.presenceState} /> : null}
          <span>{time}</span>
        </div>
        <p>{props.message.body}</p>
        {props.message.blocks.map((block, index) => (
          <MessageBlock block={block} key={index} />
        ))}
        {props.message.threadId ? (
          <button className="thread-anchor" type="button">
            ↳ Landing hero · waiting on you · 2 replies
          </button>
        ) : null}
      </div>
    </article>
  );
}

function MessageBlock(props: { block: Record<string, unknown> }) {
  if (props.block.type === "progress") {
    const lines = Array.isArray(props.block.lines) ? props.block.lines.map(String) : [];
    return (
      <div className="progress-block">
        {lines.map((line) => (
          <div key={line}>▹ {line}</div>
        ))}
      </div>
    );
  }

  if (props.block.type === "decision") {
    const options = Array.isArray(props.block.options) ? props.block.options.map(String) : [];
    return (
      <div className="decision-block" role="group" aria-label="Decision pick one">
        <div className="decision-title">◇ Decision · {String(props.block.title ?? "answer")}</div>
        <p>Choose a direction so Ari can continue.</p>
        <div className="decision-options">
          {options.map((option) => (
            <label key={option}>
              <input type="radio" name="direction" />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <button type="button">Submit</button>
      </div>
    );
  }

  return null;
}

function ContextPane(props: { agents: MemberSummary[]; activity: ActivitySummary[] }) {
  return (
    <aside className="context-pane" aria-label="Workspace context">
      <section>
        <div className="pane-heading">
          <h2>Roster</h2>
          <span>{props.agents.length} agents</span>
        </div>
        <div className="roster-list">
          {props.agents.map((agent) => (
            <div className="roster-row" key={agent.id}>
              <div className="avatar agent">{agent.displayName.slice(0, 2).toUpperCase()}</div>
              <div>
                <strong>{agent.displayName}</strong>
                <p>{agent.role} · {presenceText(agent.presenceState)}</p>
              </div>
              <PresenceDot state={agent.presenceState} />
            </div>
          ))}
        </div>
      </section>

      <section className="activity-card">
        <div className="pane-heading">
          <h2>Activity</h2>
          <span>derived</span>
        </div>
        {props.activity.map((item) => (
          <div className="activity-row" key={item.id}>
            <span>{item.state === "action_needed" ? "◐" : "✓"}</span>
            <p>{item.summary}</p>
          </div>
        ))}
      </section>
    </aside>
  );
}

function PresenceDot(props: { state: MemberSummary["presenceState"] }) {
  return <span className={`presence ${props.state}`} aria-label={presenceText(props.state)} />;
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

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
