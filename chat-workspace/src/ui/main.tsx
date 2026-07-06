import React from "react";
import { createRoot } from "react-dom/client";
import type {
  ActivitySummary,
  ArtifactSummary,
  BootstrapPayload,
  AgentSummary,
  MemberSummary,
  MiraMonitorSummary,
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

type ContextMode = "thread" | "roster" | "activity" | "mira";
type ConnectionState = "connecting" | "online" | "reconnecting" | "offline";
type SendState = "idle" | "sending" | "failed";
type AgentFormMode = "create" | "edit";
type AgentFormState = "idle" | "saving" | "failed";
type MobileTab = "chats" | "activity" | "roster" | "mira";

interface ThreadSummary {
  id: string;
  parent: MessageSummary;
  replies: MessageSummary[];
  status: ThreadStatus;
  label: string;
}

interface AgentFormValues {
  displayName: string;
  handle: string;
  role: string;
  adapterType: string;
  model: string;
  instructionsRef: string;
  budgetCap: string;
  isEnabled: boolean;
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
  const [rooms, setRooms] = React.useState<RoomSummary[]>([]);
  const [members, setMembers] = React.useState<MemberSummary[]>([]);
  const [agentCatalog, setAgentCatalog] = React.useState<AgentSummary[]>([]);
  const [messages, setMessages] = React.useState<MessageSummary[]>([]);
  const [artifacts, setArtifacts] = React.useState<ArtifactSummary[]>([]);
  const [activity, setActivity] = React.useState<ActivitySummary[]>([]);
  const [threadStates, setThreadStates] = React.useState<ThreadStateSummary[]>([]);
  const [miraMonitor, setMiraMonitor] = React.useState<MiraMonitorSummary | null>(null);
  const [eventState, setEventState] = React.useState<ConnectionState>("connecting");
  const [contextMode, setContextMode] = React.useState<ContextMode>("roster");
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
  const [mobileTab, setMobileTab] = React.useState<MobileTab>("chats");
  const [announce, setAnnounce] = React.useState("");
  const [agentFormMode, setAgentFormMode] = React.useState<AgentFormMode | null>(null);
  const [agentFormTargetId, setAgentFormTargetId] = React.useState<string | null>(null);
  const [agentFormState, setAgentFormState] = React.useState<AgentFormState>("idle");
  const [agentFormError, setAgentFormError] = React.useState("");
  const [agentFormValues, setAgentFormValues] = React.useState<AgentFormValues>({
    displayName: "",
    handle: "",
    role: "",
    adapterType: "local-adapter",
    model: "gpt-5-codex",
    instructionsRef: "",
    budgetCap: "",
    isEnabled: true
  });

  const refreshWorkspaceSnapshot = React.useCallback(async (): Promise<void> => {
    const response = await fetch("/api/bootstrap");
    if (!response.ok) {
      throw new Error(`Bootstrap refresh failed with ${response.status}`);
    }
    const payload = (await response.json()) as BootstrapPayload;
    setRooms(payload.rooms);
    setMembers(payload.members);
    setMessages(payload.messages);
    setArtifacts(payload.artifacts);
    setActivity(payload.activity);
    setThreadStates(payload.threadStates);
    setMiraMonitor(payload.miraMonitor);
  }, []);

  const refreshAgentCatalog = React.useCallback(async (): Promise<void> => {
    if (!data) {
      return;
    }
    const response = await fetch(`/api/workspaces/${data.workspace.id}/agents`);
    if (!response.ok) {
      throw new Error(`Agent catalog refresh failed with ${response.status}`);
    }
    const payload = (await response.json()) as { agents: AgentSummary[] };
    setAgentCatalog(payload.agents);
  }, [data]);

  const refreshWorkspaceData = React.useCallback(async (): Promise<void> => {
    await Promise.all([refreshWorkspaceSnapshot(), refreshAgentCatalog()]);
  }, [refreshWorkspaceSnapshot, refreshAgentCatalog]);

  const resetAgentForm = React.useCallback((): void => {
    setAgentFormMode(null);
    setAgentFormTargetId(null);
    setAgentFormError("");
    setAgentFormState("idle");
  }, []);

  const defaultAgentFormValues = React.useCallback((): AgentFormValues => ({
    displayName: "",
    handle: "",
    role: "",
    adapterType: "local-adapter",
    model: "gpt-5-codex",
    instructionsRef: "",
    budgetCap: "",
    isEnabled: true
  }), []);

  const findAgentProfile = React.useCallback(
    (memberId: string | null): AgentSummary | null => {
      if (!memberId) {
        return null;
      }
      return agentCatalog.find((agent) => agent.member.id === memberId) ?? null;
    },
    [agentCatalog]
  );

  React.useEffect(() => {
    if (!data) {
      return;
    }
    setSelectedRoomId((current) => current ?? data.rooms[0]?.id ?? null);
    setRooms(data.rooms);
    setMembers(data.members);
    setMessages(data.messages);
    setArtifacts(data.artifacts);
    setActivity(data.activity);
    setThreadStates(data.threadStates);
    setMiraMonitor(data.miraMonitor);
    void refreshAgentCatalog().catch(() => setAnnounce("Could not load agent settings"));
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
      setEventState("online");
      applyWorkspaceEvent(parsed, setMessages, setArtifacts);
      if (shouldRefreshWorkspaceSnapshot(parsed.type)) {
        void refreshWorkspaceData().catch(() => setEventState("reconnecting"));
      }
      if (parsed.type === "message.created") {
        const message = parsed.payload.message as MessageSummary | undefined;
        setAnnounce(message ? `New message: ${message.body}` : "New message received");
      }
      if (parsed.type === "artifact.created") {
        const artifact = parsed.payload.artifact as ArtifactSummary | undefined;
        setAnnounce(artifact ? `New artifact: ${artifact.title}` : "New artifact received");
      }
    });
    socket.addEventListener("open", () => setEventState("online"));
    socket.addEventListener("close", () => setEventState("reconnecting"));
    socket.addEventListener("error", () => setEventState("offline"));

    return () => socket.close();
  }, [data, refreshWorkspaceData]);

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
          ? getThreads(messages, threadStates).find((thread) => thread.parent.roomId === selectedRoomId)
          : null;
        if (firstThread) {
          openThread(firstThread.id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [messages, selectedRoomId, threadStates]);

  if (error) {
    return <div className="loading">Could not load workspace: {error}</div>;
  }

  if (!data) {
    return <div className="loading">Loading workspace...</div>;
  }

  const currentMember = members.find((member) => member.kind === "human") ?? members[0];
  const workspaceId = data.workspace.id;
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];
  const threads = getThreads(messages, threadStates);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const roomMessages = messages.filter(
    (message) => message.roomId === selectedRoom?.id && !message.parentMessageId && !message.deletedAt
  );
  const selectedAgent = findAgentProfile(agentFormTargetId);

  const isAgentFormSaving = agentFormState === "saving";

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
    await refreshWorkspaceSnapshot();
    setAnnounce("Decision submitted");
  }

  const getAgentBudgetCap = React.useCallback((agent: AgentSummary | null): string => {
    if (!agent) {
      return "";
    }
    const policy = agent.profile.budgetPolicy;
    const raw = policy.hourlyTokens;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return Number.isInteger(raw) ? String(raw) : String(raw);
    }
    if (typeof raw === "string") {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? String(parsed) : "";
    }
    return "";
  }, []);

  const openCreateAgentForm = React.useCallback((): void => {
    setAgentFormMode("create");
    setAgentFormTargetId(null);
    setAgentFormValues(defaultAgentFormValues());
    setAgentFormError("");
    setAgentFormState("idle");
    setContextMode("roster");
    setMobileTab("roster");
  }, [defaultAgentFormValues]);

  const openEditAgentForm = React.useCallback(
    (memberId: string): void => {
      const agent = findAgentProfile(memberId);
      if (!agent) {
        setAnnounce("Agent settings are still loading.");
        return;
      }
      setAgentFormMode("edit");
      setAgentFormTargetId(agent.member.id);
      setAgentFormValues({
        displayName: agent.member.displayName,
        handle: agent.member.handle,
        role: agent.member.role ?? "",
        adapterType: agent.profile.adapterType,
        model: agent.profile.model,
        instructionsRef: agent.profile.instructionsRef ?? "",
        budgetCap: getAgentBudgetCap(agent),
        isEnabled: agent.profile.isEnabled
      });
      setAgentFormError("");
      setAgentFormState("idle");
      setContextMode("roster");
      setMobileTab("roster");
    },
    [findAgentProfile, getAgentBudgetCap]
  );

  const closeAgentForm = React.useCallback((): void => {
    resetAgentForm();
  }, [resetAgentForm]);

  async function submitAgentForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!currentMember) {
      throw new Error("No current member available");
    }
    if (!agentFormMode) {
      return;
    }

    if (!agentFormValues.displayName.trim() || !agentFormValues.handle.trim()) {
      setAgentFormError("Display name and handle are required.");
      setAgentFormState("failed");
      return;
    }

    if (!agentFormValues.adapterType.trim() || !agentFormValues.model.trim()) {
      setAgentFormError("Adapter type and model are required.");
      setAgentFormState("failed");
      return;
    }

    const budgetCap = agentFormValues.budgetCap.trim();
    const budgetPolicy: Record<string, unknown> = {};
    if (budgetCap) {
      const parsedBudget = Number(budgetCap);
      if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
        setAgentFormError("Budget cap must be a non-negative number.");
        setAgentFormState("failed");
        return;
      }
      budgetPolicy.hourlyTokens = Math.trunc(parsedBudget);
    }

    setAgentFormState("saving");
    setAgentFormError("");

    const payload = {
      displayName: agentFormValues.displayName.trim(),
      handle: agentFormValues.handle.trim(),
      role: agentFormValues.role.trim() || null,
      adapterType: agentFormValues.adapterType.trim(),
      model: agentFormValues.model.trim(),
      instructionsRef: agentFormValues.instructionsRef.trim() || null,
      budgetPolicy,
      isEnabled: agentFormValues.isEnabled
    };

    try {
      if (agentFormMode === "create") {
        const response = await fetch(`/api/workspaces/${workspaceId}/agents`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...payload,
            createdByMemberId: currentMember.id
          })
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => ({ error: "Could not create agent" }))) as { error?: string };
          throw new Error(detail.error ?? `Create agent failed with ${response.status}`);
        }
      } else {
        if (!agentFormTargetId) {
          throw new Error("No target agent selected");
        }
        const response = await fetch(`/api/workspaces/${workspaceId}/agents/${agentFormTargetId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...payload,
            updatedByMemberId: currentMember.id,
            isEnabled: agentFormValues.isEnabled
          })
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => ({ error: "Could not update agent" }))) as { error?: string };
          throw new Error(detail.error ?? `Update agent failed with ${response.status}`);
        }
      }
      await refreshWorkspaceData();
      closeAgentForm();
      setAnnounce(agentFormMode === "create" ? "Agent created" : "Agent updated");
    } catch (caught: unknown) {
      setAgentFormError(caught instanceof Error ? caught.message : "Could not save agent");
      setAgentFormState("failed");
    }
  }

  async function removeCurrentAgent(): Promise<void> {
    if (!agentFormMode || !agentFormTargetId || !currentMember) {
      return;
    }
    if (!window.confirm(`Delete ${agentFormValues.displayName || "agent"}?`)) {
      return;
    }
    setAgentFormState("saving");
    setAgentFormError("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/agents/${agentFormTargetId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({ error: "Could not delete agent" }))) as { error?: string };
        throw new Error(detail.error ?? `Delete agent failed with ${response.status}`);
      }
      await refreshWorkspaceData();
      closeAgentForm();
      setAnnounce("Agent deleted (disabled)");
    } catch (caught: unknown) {
      setAgentFormError(caught instanceof Error ? caught.message : "Could not delete agent");
      setAgentFormState("failed");
    }
  }

  async function toggleCurrentAgentEnabled(nextEnabled: boolean): Promise<void> {
    if (!agentFormMode || !agentFormTargetId || !currentMember) {
      return;
    }
    setAgentFormState("saving");
    setAgentFormError("");
    try {
      if (nextEnabled) {
        const response = await fetch(`/api/workspaces/${workspaceId}/agents/${agentFormTargetId}/reactivate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ updatedByMemberId: currentMember.id })
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => ({ error: "Could not reactivate agent" }))) as { error?: string };
          throw new Error(detail.error ?? `Reactivate agent failed with ${response.status}`);
        }
      } else {
        const response = await fetch(`/api/workspaces/${workspaceId}/agents/${agentFormTargetId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ updatedByMemberId: currentMember.id, isEnabled: false })
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => ({ error: "Could not disable agent" }))) as { error?: string };
          throw new Error(detail.error ?? `Disable agent failed with ${response.status}`);
        }
      }
      await refreshWorkspaceData();
      closeAgentForm();
      setAnnounce(nextEnabled ? "Agent reactivated" : "Agent disabled");
    } catch (caught: unknown) {
      setAgentFormError(caught instanceof Error ? caught.message : "Could not update agent status");
      setAgentFormState("failed");
    }
  }

  async function setMiraEnabled(enabled: boolean): Promise<void> {
    const response = await fetch(`/api/workspaces/${workspaceId}/mira-monitor`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => ({ error: "Mira did not update" }))) as { error?: string };
      throw new Error(detail.error ?? `Mira update failed with ${response.status}`);
    }

    const result = (await response.json()) as { miraMonitor: MiraMonitorSummary };
    setMiraMonitor(result.miraMonitor);
    await refreshWorkspaceSnapshot();
    setAnnounce(enabled ? "Mira monitoring is on" : "Mira monitoring is off");
  }

  function askForArtifactChanges(artifact: ArtifactSummary): void {
    const targetThreadId = artifact.threadId ?? threads.find((thread) => thread.parent.id === artifact.messageId)?.id;
    if (targetThreadId) {
      openThread(targetThreadId);
      window.setTimeout(() => fillComposerForArtifactChanges(artifact), 0);
    } else {
      fillComposerForArtifactChanges(artifact);
    }
    setAnnounce(`Composer ready for changes to ${artifact.title}`);
  }

  return (
    <main className="workspace-shell">
      <LeftRail
        workspaceName={data.workspace.name}
        rooms={rooms}
        members={members}
        selectedRoomId={selectedRoom?.id ?? ""}
        onSelectRoom={selectRoom}
        activity={activity}
        onOpenActivity={() => {
          setContextMode("activity");
          setMobileTab("activity");
        }}
        currentMemberId={currentMember?.id ?? null}
        miraMonitor={miraMonitor}
        onOpenMira={() => {
          setContextMode("mira");
          setMobileTab("mira");
        }}
        onAddAgent={openCreateAgentForm}
      />
      <ConversationPane
        room={selectedRoom}
        messages={roomMessages}
        artifacts={artifacts}
        members={members}
        eventState={eventState}
        threads={threads}
        currentMember={currentMember}
        onOpenThread={openThread}
        onToggleRoster={() => setContextMode((mode) => (mode === "roster" ? "activity" : "roster"))}
        onSendMessage={(body, mentions) => selectedRoom && sendMessage(selectedRoom.id, body, mentions)}
        onResolveDecision={resolveDecisionBlock}
        onAskForChanges={askForArtifactChanges}
      />
      <ContextPane
        mode={contextMode}
        selectedThread={selectedThread}
        artifacts={artifacts}
        members={members}
        activity={activity}
        currentMember={currentMember}
        miraMonitor={miraMonitor}
        room={selectedRoom}
        onModeChange={setContextMode}
        onJumpToRoom={selectRoom}
        onSetMiraEnabled={setMiraEnabled}
        onEditAgent={openEditAgentForm}
        onSendThreadReply={(body, mentions) => {
          if (!selectedThread) {
            throw new Error("No thread is selected");
          }
          return sendMessage(selectedThread.parent.roomId, body, mentions, selectedThread.parent.id);
        }}
        onResolveDecision={resolveDecisionBlock}
        onAskForChanges={askForArtifactChanges}
      />
      {agentFormMode ? (
        <AgentSettingsModal
          mode={agentFormMode}
          agent={selectedAgent}
          values={agentFormValues}
          isSaving={isAgentFormSaving}
          error={agentFormError}
          onClose={closeAgentForm}
          onSubmit={submitAgentForm}
          onDelete={removeCurrentAgent}
          onSetEnabled={toggleCurrentAgentEnabled}
          onValuesChange={setAgentFormValues}
        />
      ) : null}
      <MobileTabs
        active={mobileTab}
        actionNeeded={getActionNeededCount(activity, currentMember?.id ?? null)}
        onSelect={(tab) => {
          setMobileTab(tab);
          if (tab === "activity") {
            setContextMode("activity");
          }
          if (tab === "roster") {
            setContextMode("roster");
          }
          if (tab === "mira") {
            setContextMode("mira");
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

function shouldRefreshWorkspaceSnapshot(eventType: string): boolean {
  return [
    "artifact.created",
    "agent.created",
    "agent.disabled",
    "agent.enabled",
    "agent.removed",
    "agent.updated",
    "decision.created",
    "decision.resolved",
    "mira.monitor.updated",
    "message.updated",
    "session.created",
    "session.updated",
    "wake.queued"
  ].includes(eventType);
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
  miraMonitor: MiraMonitorSummary | null;
  onOpenActivity(): void;
  onOpenMira(): void;
  onAddAgent(): void;
}) {
  const channels = props.rooms.filter((room) => room.kind === "channel");
  const dms = props.rooms.filter((room) => room.kind === "dm");
  const actionsNeeded = getActionNeededCount(props.activity, props.currentMemberId);
  const miraLabel = props.miraMonitor ? miraHealthLabel(props.miraMonitor.health) : "loading";

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
      <button className={`mira-rail-button ${props.miraMonitor?.health ?? "empty"}`} type="button" onClick={props.onOpenMira}>
        <span>Mira</span>
        <span>{miraLabel}</span>
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

      <div className="rail-help">
        <button className="add-agent" type="button" onClick={props.onAddAgent}>+ Add agent</button>
        <a href="/docs/agent-configuration.md#add-agent" target="_blank" rel="noreferrer">Agent setup docs</a>
      </div>
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
  onAskForChanges(artifact: ArtifactSummary): void;
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
          <a className="doc-link" href="/docs/getting-started.md" target="_blank" rel="noreferrer">Docs</a>
          <ConnectionNotice state={props.eventState} />
          <a className="icon-link" href="/docs/troubleshooting.md" target="_blank" rel="noreferrer" aria-label="Troubleshooting">?</a>
          <button type="button" aria-label="Search">⌕</button>
          <button type="button" aria-label="Toggle roster and activity" onClick={props.onToggleRoster}>☰</button>
        </div>
      </header>

      <div className="message-stream" ref={streamRef}>
        {props.messages.length === 0 ? <EmptyConversation room={props.room} /> : null}
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
              onAskForChanges={props.onAskForChanges}
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
  onAskForChanges(artifact: ArtifactSummary): void;
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
          <MessageBlock block={block} key={index} members={props.members} onResolveDecision={props.onResolveDecision} />
        ))}
        <ArtifactList artifacts={props.artifacts} compact={false} onAskForChanges={props.onAskForChanges} />
        {props.thread ? <ThreadAnchor thread={props.thread} onOpenThread={props.onOpenThread} /> : null}
      </div>
    </article>
  );
}

function ConnectionNotice(props: { state: string }) {
  if (props.state !== "offline" && props.state !== "reconnecting") {
    return null;
  }
  return <span className={`connection-pill ${props.state}`}>{props.state === "offline" ? "Offline" : "Reconnecting"}</span>;
}

function EmptyConversation(props: { room: RoomSummary | undefined }) {
  const isDm = props.room?.kind === "dm";
  return (
    <section className="empty-conversation" aria-label="No messages">
      <strong>{isDm ? `No direct messages with ${props.room?.name ?? "this teammate"} yet` : "No messages yet"}</strong>
      <p>
        {isDm
          ? "Start a new 1:1 below, or keep shared launch work in the main channel."
          : "Start the conversation below."}
      </p>
    </section>
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
  members: MemberSummary[];
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
          <DecisionReceipt block={props.block} members={props.members} />
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

function DecisionReceipt(props: { block: Record<string, unknown>; members: MemberSummary[] }) {
  const result = getDecisionResult(props.block);
  const resolverId = typeof props.block.resolvedByMemberId === "string" ? props.block.resolvedByMemberId : null;
  const resolver = resolverId ? props.members.find((member) => member.id === resolverId) : null;
  const resolvedAt = typeof props.block.resolvedAt === "string" ? props.block.resolvedAt : null;
  const note = typeof result.note === "string" ? result.note.trim() : "";

  return (
    <dl className="decision-receipt">
      <div>
        <dt>Choice</dt>
        <dd>{decisionChoiceText(result)}</dd>
      </div>
      <div>
        <dt>Resolver</dt>
        <dd>{resolver?.displayName ?? "Workspace"}</dd>
      </div>
      <div>
        <dt>Time</dt>
        <dd>{resolvedAt ? formatTime(resolvedAt) : "Recorded"}</dd>
      </div>
      {note ? (
        <div>
          <dt>Note</dt>
          <dd>{note}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function getDecisionResult(block: Record<string, unknown>): Record<string, unknown> {
  return block.result && typeof block.result === "object" && !Array.isArray(block.result)
    ? (block.result as Record<string, unknown>)
    : {};
}

function decisionChoiceText(result: Record<string, unknown>): string {
  if (result.decision === "approved") {
    return "Approved";
  }
  if (result.decision === "rejected") {
    return "Rejected";
  }
  if (typeof result.answer === "string") {
    return result.answer;
  }
  if (typeof result.choice === "string") {
    return result.choice;
  }
  return "Recorded";
}

function ArtifactList(props: {
  artifacts: ArtifactSummary[];
  compact: boolean;
  onAskForChanges(artifact: ArtifactSummary): void;
}) {
  if (props.artifacts.length === 0) {
    return null;
  }

  return (
    <div className={`artifact-list ${props.compact ? "compact" : ""}`} aria-label="Artifacts">
      {props.artifacts.map((artifact) => (
        <ArtifactPreviewCard artifact={artifact} key={artifact.id} onAskForChanges={props.onAskForChanges} />
      ))}
    </div>
  );
}

function ArtifactPreviewCard(props: { artifact: ArtifactSummary; onAskForChanges(artifact: ArtifactSummary): void }) {
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
        <ArtifactActions artifact={artifact} onAskForChanges={props.onAskForChanges} />
        <div className="artifact-meta">
          {artifact.mimeType ? <span>{artifact.mimeType}</span> : null}
          {artifact.preview.sizeBytes !== undefined ? <span>{formatBytes(artifact.preview.sizeBytes)}</span> : null}
          <span>{formatTime(artifact.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

function ArtifactActions(props: { artifact: ArtifactSummary; onAskForChanges(artifact: ArtifactSummary): void }) {
  const href = artifactHref(props.artifact);
  const canAsk = Boolean(props.artifact.threadId || props.artifact.messageId);

  async function copyArtifactReference(): Promise<void> {
    const text = href ?? props.artifact.preview.excerpt ?? props.artifact.preview.description ?? props.artifact.title;
    await navigator.clipboard?.writeText(text);
  }

  return (
    <div className="artifact-actions" aria-label={`Actions for ${props.artifact.title}`}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">Open</a>
      ) : (
        <button type="button" disabled>Open</button>
      )}
      {href ? (
        <a href={href} download={props.artifact.preview.fileName ?? props.artifact.title}>Download</a>
      ) : (
        <button type="button" disabled>Download</button>
      )}
      <button type="button" onClick={() => void copyArtifactReference()}>Copy</button>
      {canAsk ? (
        <button type="button" onClick={() => props.onAskForChanges(props.artifact)}>Ask for changes</button>
      ) : null}
    </div>
  );
}

function fillComposerForArtifactChanges(artifact: ArtifactSummary): void {
  window.dispatchEvent(
    new CustomEvent("chat-workspace:artifact-change-request", {
      detail: { title: artifact.title }
    })
  );
  document.querySelector<HTMLInputElement>("[data-composer-input]")?.focus();
}

function artifactHref(artifact: ArtifactSummary): string | null {
  return safeHref(artifact.preview.url ?? artifact.preview.imageUrl ?? artifact.externalUrl);
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
  miraMonitor: MiraMonitorSummary | null;
  room: RoomSummary | undefined;
  onModeChange(mode: ContextMode): void;
  onJumpToRoom(roomId: string): void;
  onSetMiraEnabled(enabled: boolean): Promise<void>;
  onEditAgent(memberId: string): void;
  onSendThreadReply(body: string, mentions: string[]): Promise<void>;
  onResolveDecision(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void>;
  onAskForChanges(artifact: ArtifactSummary): void;
}) {
  const agents = props.members.filter((member) => member.kind === "agent");
  const humans = props.members.filter((member) => member.kind === "human");

  return (
    <aside className={`context-pane mode-${props.mode}`} aria-label="Workspace context">
      <div className="context-tabs" role="tablist" aria-label="Context views">
        <button type="button" className={props.mode === "thread" ? "active" : ""} onClick={() => props.onModeChange("thread")}>Thread</button>
        <button type="button" className={props.mode === "roster" ? "active" : ""} onClick={() => props.onModeChange("roster")}>Roster</button>
        <button type="button" className={props.mode === "activity" ? "active" : ""} onClick={() => props.onModeChange("activity")}>Activity</button>
        <button type="button" className={props.mode === "mira" ? "active" : ""} onClick={() => props.onModeChange("mira")}>Mira</button>
      </div>

      {props.mode === "thread" ? (
        <ThreadPanel
          thread={props.selectedThread}
          artifacts={props.artifacts}
          members={props.members}
          room={props.room}
          onSendThreadReply={props.onSendThreadReply}
          onResolveDecision={props.onResolveDecision}
          onAskForChanges={props.onAskForChanges}
        />
      ) : null}

      {props.mode === "roster" ? (
        <Roster agents={agents} humans={humans} onEditAgent={props.onEditAgent} />
      ) : null}

      {props.mode === "activity" ? (
        <ActivityList
          activity={props.activity}
          members={props.members}
          currentMemberId={props.currentMember?.id ?? null}
          onJumpToRoom={props.onJumpToRoom}
        />
      ) : null}

      {props.mode === "mira" ? (
        <MiraMonitorPanel
          miraMonitor={props.miraMonitor}
          member={props.members.find((member) => member.id === props.miraMonitor?.agentMemberId)}
          onSetEnabled={props.onSetMiraEnabled}
        />
      ) : null}
    </aside>
  );
}

function MiraMonitorPanel(props: {
  miraMonitor: MiraMonitorSummary | null;
  member: MemberSummary | undefined;
  onSetEnabled(enabled: boolean): Promise<void>;
}) {
  const [toggleState, setToggleState] = React.useState<"idle" | "saving" | "failed">("idle");
  const [error, setError] = React.useState("");

  if (!props.miraMonitor) {
    return (
      <section className="mira-panel">
        <div className="pane-heading">
          <h2>Mira</h2>
          <span>loading</span>
        </div>
        <p className="empty-copy">Loading monitoring status.</p>
      </section>
    );
  }

  const { miraMonitor } = props;
  const disabled = toggleState === "saving";

  async function toggle(): Promise<void> {
    setToggleState("saving");
    setError("");
    try {
      await props.onSetEnabled(!miraMonitor.enabled);
      setToggleState("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mira did not update");
      setToggleState("failed");
    }
  }

  return (
    <section className={`mira-panel state-${miraMonitor.health}`} aria-label="Mira monitoring">
      <div className="pane-heading">
        <div>
          <h2>Mira</h2>
          <p>{props.member?.role ?? "Workspace monitor"}</p>
        </div>
        <span className={`mira-health ${miraMonitor.health}`}>{miraHealthLabel(miraMonitor.health)}</span>
      </div>

      <p className="mira-copy">
        Mira watches workspace activity for stalled handoffs, fresh decisions, and agent work that needs attention.
      </p>

      <div className="mira-status-grid">
        <div>
          <span>State</span>
          <strong>{miraMonitor.enabled ? "Monitoring" : "Off"}</strong>
        </div>
        <div>
          <span>Last check</span>
          <strong>{miraMonitor.lastCheckedAt ? formatDateTime(miraMonitor.lastCheckedAt) : "Not checked yet"}</strong>
        </div>
      </div>

      <label className="mira-toggle">
        <input type="checkbox" checked={miraMonitor.enabled} disabled={disabled} onChange={() => void toggle()} />
        <span>{miraMonitor.enabled ? "Turn Mira off" : "Turn Mira on"}</span>
      </label>
      {toggleState === "saving" ? <p className="mira-note">Updating Mira...</p> : null}
      {toggleState === "failed" ? <p className="mira-error">{error}</p> : null}

      <MiraStateCopy miraMonitor={miraMonitor} />

      <div className="mira-doc-link">
        <a href="/docs/mira.md#where-to-see-mira-status" target="_blank" rel="noreferrer">Read how Mira works</a>
      </div>

      <div className="mira-activity">
        <h3>Last hour</h3>
        {miraMonitor.lastHourActivity.length === 0 ? (
          <p className="empty-copy">No Mira checks or actions in the last hour.</p>
        ) : (
          <ol>
            {miraMonitor.lastHourActivity.map((item) => (
              <li className={`severity-${item.severity}`} key={item.id}>
                <span>{formatTime(item.createdAt)}</span>
                <strong>{miraActivityKindLabel(item.kind)}</strong>
                <p>{item.summary}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function MiraStateCopy(props: { miraMonitor: MiraMonitorSummary }) {
  if (props.miraMonitor.health === "disabled") {
    return <p className="mira-note">Mira will not start future monitoring checks or actions while it is off.</p>;
  }
  if (props.miraMonitor.health === "error") {
    return <p className="mira-error">{props.miraMonitor.errorMessage ?? "Mira reported an error."}</p>;
  }
  if (props.miraMonitor.health === "empty") {
    return <p className="mira-note">Mira is on. No monitor activity has happened in the last hour.</p>;
  }
  return <p className="mira-note">Mira is active and has recent monitor activity.</p>;
}

function ThreadPanel(props: {
  thread: ThreadSummary | null;
  artifacts: ArtifactSummary[];
  members: MemberSummary[];
  room: RoomSummary | undefined;
  onSendThreadReply(body: string, mentions: string[]): Promise<void>;
  onResolveDecision(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void>;
  onAskForChanges(artifact: ArtifactSummary): void;
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
              members={props.members}
              onResolveDecision={props.onResolveDecision}
              onAskForChanges={props.onAskForChanges}
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
  members: MemberSummary[];
  onResolveDecision(block: Record<string, unknown>, result: Record<string, unknown>): Promise<void>;
  onAskForChanges(artifact: ArtifactSummary): void;
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
        <MessageBlock block={block} key={index} members={props.members} onResolveDecision={props.onResolveDecision} />
      ))}
      <ArtifactList artifacts={props.artifacts} compact onAskForChanges={props.onAskForChanges} />
    </article>
  );
}

function Roster(props: { agents: MemberSummary[]; humans: MemberSummary[]; onEditAgent(memberId: string): void }) {
  return (
    <section>
      <div className="pane-heading">
        <div>
          <h2>Roster</h2>
          <a className="subtle-link" href="/docs/agent-configuration.md#room-memberships" target="_blank" rel="noreferrer">
            Agent settings
          </a>
        </div>
        <span>{props.agents.length} agents</span>
      </div>
      <div className="roster-list">
        {[...props.agents, ...props.humans].map((member) => {
          const isAgent = member.kind === "agent";
          return (
            <button
              className={`roster-row ${isAgent ? "is-agent" : "is-human"}`}
              key={member.id}
              type="button"
              onClick={isAgent ? () => props.onEditAgent(member.id) : undefined}
            >
              <div className={`avatar ${isAgent ? "agent" : "human"}`} aria-hidden="true">
                {member.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <strong>{member.displayName}</strong>
                <p>{member.role ?? member.kind} · {presenceText(member.presenceState)}</p>
              </div>
              <div className="roster-meta">
                {isAgent ? <span className="roster-action">Edit settings</span> : <PresenceDot state={member.presenceState} />}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AgentSettingsModal(props: {
  mode: AgentFormMode;
  agent: AgentSummary | null;
  values: AgentFormValues;
  isSaving: boolean;
  error: string;
  onClose(): void;
  onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void>;
  onDelete(): Promise<void>;
  onSetEnabled(nextEnabled: boolean): Promise<void>;
  onValuesChange(values: AgentFormValues): void;
}) {
  const isCreate = props.mode === "create";
  const isSaving = props.isSaving;
  const actionLabel = isCreate ? "Create agent" : "Save agent changes";
  const statusLabel = props.values.isEnabled ? "enabled" : "disabled";

  React.useEffect(() => {
    function onEsc(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        props.onClose();
      }
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [props.onClose, props.agent?.member.displayName]);

  function setField(field: keyof AgentFormValues, value: string | boolean): void {
    props.onValuesChange({ ...props.values, [field]: value });
  }

  function closeOnScrim(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      props.onClose();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={closeOnScrim}>
      <section className="agent-settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="agent-settings-header">
          <h2>{isCreate ? "Add agent" : `Edit ${props.agent?.member.displayName ?? "agent"}`}</h2>
          <button type="button" onClick={props.onClose}>✕</button>
        </header>
        <form className="agent-settings-form" onSubmit={props.onSubmit}>
          <label>
            <span>Display name</span>
            <input
              value={props.values.displayName}
              onChange={(event) => setField("displayName", event.target.value)}
              required
            />
          </label>

          <label>
            <span>Handle</span>
            <input
              value={props.values.handle}
              onChange={(event) => setField("handle", event.target.value)}
              required
            />
          </label>

          <label>
            <span>Role</span>
            <input
              value={props.values.role}
              onChange={(event) => setField("role", event.target.value)}
            />
          </label>

          <label>
            <span>Adapter type</span>
            <input
              value={props.values.adapterType}
              onChange={(event) => setField("adapterType", event.target.value)}
              required
            />
          </label>

          <label>
            <span>Model</span>
            <input
              value={props.values.model}
              onChange={(event) => setField("model", event.target.value)}
              required
            />
          </label>

          <label>
            <span>Instructions reference</span>
            <input
              value={props.values.instructionsRef}
              placeholder="agents/example.md"
              onChange={(event) => setField("instructionsRef", event.target.value)}
            />
          </label>

          <label>
            <span>Hourly token budget</span>
            <input
              type="number"
              min="0"
              value={props.values.budgetCap}
              onChange={(event) => setField("budgetCap", event.target.value)}
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={props.values.isEnabled}
              onChange={(event) => setField("isEnabled", event.target.checked)}
            />
            <span>Enabled</span>
          </label>

          <p className="agent-settings-meta">Current status: {statusLabel}</p>

          {props.error ? <p className="agent-settings-error" role="alert">{props.error}</p> : null}

          <div className="agent-settings-actions">
            <button className="secondary" type="button" onClick={props.onClose}>Cancel</button>
            <button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : actionLabel}</button>
          </div>

          {!isCreate ? (
            <div className="agent-settings-actions danger-zone">
              <button
                type="button"
                onClick={() => {
                  void props.onSetEnabled(!props.values.isEnabled);
                }}
                disabled={isSaving}
              >
                {props.values.isEnabled ? "Disable" : "Reactivate"}
              </button>
              <button type="button" className="danger" onClick={() => void props.onDelete()} disabled={isSaving}>Delete</button>
            </div>
          ) : null}
        </form>
      </section>
    </div>
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
        <div>
          <h2>Activity</h2>
          <a className="subtle-link" href="/docs/mira.md#where-to-see-mira-status" target="_blank" rel="noreferrer">
            Mira status
          </a>
        </div>
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
        .filter((member) => member.isEnabled)
        .filter((member) => member.handle.toLowerCase().startsWith(mention.query.toLowerCase()))
        .slice(0, 5)
    : [];

  React.useEffect(() => {
    const onArtifactChangeRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string }>).detail;
      const title = detail?.title ?? "this artifact";
      setValue((current) => current || `Ask for changes on ${title}: `);
      setSendState("idle");
    };
    window.addEventListener("chat-workspace:artifact-change-request", onArtifactChangeRequest);
    return () => window.removeEventListener("chat-workspace:artifact-change-request", onArtifactChangeRequest);
  }, []);

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
  active: MobileTab;
  actionNeeded: number;
  onSelect(tab: MobileTab): void;
}) {
  return (
    <nav className="mobile-tabs" aria-label="Primary">
      <button className={props.active === "chats" ? "active" : ""} type="button" onClick={() => props.onSelect("chats")}>Chats</button>
      <button className={props.active === "activity" ? "active" : ""} type="button" onClick={() => props.onSelect("activity")}>
        Activity <span>{props.actionNeeded}</span>
      </button>
      <button className={props.active === "roster" ? "active" : ""} type="button" onClick={() => props.onSelect("roster")}>Roster</button>
      <button className={props.active === "mira" ? "active" : ""} type="button" onClick={() => props.onSelect("mira")}>Mira</button>
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

function miraHealthLabel(health: MiraMonitorSummary["health"]): string {
  switch (health) {
    case "active":
      return "active";
    case "disabled":
      return "off";
    case "error":
      return "error";
    default:
      return "quiet";
  }
}

function miraActivityKindLabel(kind: MiraMonitorSummary["lastHourActivity"][number]["kind"]): string {
  switch (kind) {
    case "check":
      return "Check";
    case "action":
      return "Action";
    default:
      return "Note";
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
    .filter((member) => member.isEnabled && handles.includes(member.handle.toLowerCase()))
    .map((member) => member.id);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
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
