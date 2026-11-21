import { db } from "./records";
import type { SpotlightStep } from "./spotlight";
import type {
  proposeRepair,
  latestRepair,
  verifyRepair,
} from "./checkout-repair";

type Command =
  | { kind: "repository"; mode: "briefing" | "plan" | "onboard" | "health" | "history"; hours?: number }
  | { kind: "spotlight"; steps: SpotlightStep[]; agentId?: string }
  | { kind: "focus"; nodeId: string }
  | { kind: "xray" | "review" }
  | { kind: "preview"; plan: Awaited<ReturnType<typeof proposeRepair>> }
  | {
      kind: "status";
      result: {
        receipt: NonNullable<ReturnType<typeof latestRepair>>;
        verification: Awaited<ReturnType<typeof verifyRepair>>;
      };
    };

function open() {
  const connection = db();
  connection.exec(
    "CREATE TABLE IF NOT EXISTS workspace_commands(id INTEGER PRIMARY KEY AUTOINCREMENT, created INTEGER NOT NULL, payload TEXT NOT NULL)",
  );
  return connection;
}

export function sendWorkspaceCommand(command: Command) {
  const connection = open();
  try {
    const now = Date.now();
    connection
      .prepare("DELETE FROM workspace_commands WHERE created < ?")
      .run(now - 120000);
    connection
      .prepare("INSERT INTO workspace_commands(created,payload) VALUES (?,?)")
      .run(now, JSON.stringify(command));
  } finally {
    connection.close();
  }
}

export function recentWorkspaceCommands() {
  const connection = open();
  try {
    return connection
      .prepare(
        "SELECT id,created,payload FROM workspace_commands WHERE created >= ? ORDER BY id DESC LIMIT 12",
      )
      .all(Date.now() - 120000)
      .reverse()
      .map((row) => ({
        id: Number(row.id),
        createdAt: Number(row.created),
        ...(JSON.parse(String(row.payload)) as Command),
      }));
  } finally {
    connection.close();
  }
}
