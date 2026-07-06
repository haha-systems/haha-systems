import { readFile } from "node:fs/promises";

const sourcePath = new URL("../src/ui/main.tsx", import.meta.url);
const source = await readFile(sourcePath, "utf8");

function assert(hasText: string, description: string): void {
  if (!source.includes(hasText)) {
    throw new Error(`Missing expected agent UI wiring: ${description}`);
  }
}

assert("onAddAgent={openCreateAgentForm}", "left rail add-agent handler wired");
assert("onEditAgent={openEditAgentForm}", "context roster edit handler wired");
assert("function AgentSettingsModal", "agent settings modal component exists");
assert("onSubmit={submitAgentForm}", "agent settings modal submit handler wired");
assert("onSetEnabled={toggleCurrentAgentEnabled}", "agent settings toggle handler wired");
assert("onDelete={removeCurrentAgent}", "agent delete handler wired");
assert("Display name", "display-name field exists");
assert("Handle", "handle field exists");
assert("Adapter type", "adapter type field exists");
assert("Model", "model field exists");
assert("Instructions reference", "instructions ref field exists");
assert("Hourly token budget", "budget field exists");
assert("type=\"number\"", "budget field is numeric");

console.log("Agent UI flow wiring verified.");
