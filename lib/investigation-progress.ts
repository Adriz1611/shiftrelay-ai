import { randomUUID } from "node:crypto";
import { db, remember } from "./records";
import { investigate } from "./investigate";
import { prepare } from "./proposals";

function progressDb() {
  const connection = db();
  connection.exec(
    "CREATE TABLE IF NOT EXISTS investigation_progress (slot INTEGER PRIMARY KEY CHECK(slot=1), request TEXT NOT NULL, phase TEXT NOT NULL, evidence TEXT NOT NULL, updated INTEGER NOT NULL)",
  );
  return connection;
}

export function investigationProgress() {
  const connection = progressDb();
  try {
    const row = connection
      .prepare(
        "SELECT phase,evidence,updated FROM investigation_progress WHERE slot=1",
      )
      .get();
    if (!row || row.phase === "complete") return null;
    return {
      phase:
        row.phase === "failed" || Date.now() - Number(row.updated) > 90000
          ? ("failed" as const)
          : ("running" as const),
      evidence: JSON.parse(String(row.evidence)) as unknown,
    };
  } finally {
    connection.close();
  }
}

export async function runInvestigation() {
  const id = randomUUID();
  const evidence: Record<string, unknown> = {};
  const connection = progressDb();
  try {
    connection
      .prepare(
        "INSERT OR REPLACE INTO investigation_progress VALUES (1, ?, 'running', '{}', ?)",
      )
      .run(id, Date.now());
    const update = connection.prepare(
      "UPDATE investigation_progress SET phase=?, evidence=?, updated=? WHERE request=?",
    );
    try {
      const data = await investigate((stage) => {
        Object.assign(evidence, stage);
        update.run("running", JSON.stringify(evidence), Date.now(), id);
      });
      const proposal = prepare(data);
      remember({
        evidence: data,
        proposal,
        action: proposal
          ? "Awaiting operator approval"
          : "Investigation completed",
      });
      update.run("complete", "{}", Date.now(), id);
      return { data, proposal };
    } catch (error) {
      update.run("failed", JSON.stringify(evidence), Date.now(), id);
      throw error;
    }
  } finally {
    connection.close();
  }
}
