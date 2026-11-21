import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function db(
  path = process.env.DATABASE_PATH || ".secrets/shiftrelay.sqlite",
) {
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  // A workspace poll can overlap a voice callback writing the next command.
  d.exec("PRAGMA busy_timeout = 3000");
  d.exec(
    "CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY, time TEXT DEFAULT CURRENT_TIMESTAMP, data TEXT NOT NULL)",
  );
  return d;
}
export function remember(value: unknown, path?: string) {
  const d = db(path);
  try {
    d.prepare("INSERT INTO records(data) VALUES (?)").run(
      JSON.stringify(value),
    );
  } finally {
    d.close();
  }
}
export function latest(completedOnly = false) {
  const d = db();
  try {
    const row = d
      .prepare(
        completedOnly
          ? "SELECT time,data FROM records WHERE json_extract(data, '$.state') IS NOT NULL ORDER BY id DESC LIMIT 1"
          : "SELECT time,data FROM records ORDER BY id DESC LIMIT 1",
      )
      .get();
    return row
      ? { time: row.time, ...JSON.parse(String(row.data)) }
      : { status: "No handover saved" };
  } finally {
    d.close();
  }
}
export function outcomeForRun(url: string) {
  const d = db();
  try {
    const row = d
      .prepare(
        "SELECT data FROM records WHERE json_extract(data, '$.evidence.url') = ? AND json_extract(data, '$.state') IS NOT NULL ORDER BY id DESC LIMIT 1",
      )
      .get(url);
    return row ? JSON.parse(String(row.data)) : null;
  } finally {
    d.close();
  }
}
export function recentEvents() {
  const d = db();
  try {
    return d
      .prepare("SELECT id,time,data FROM records ORDER BY id DESC LIMIT 8")
      .all()
      .map((row) => {
        const value = JSON.parse(String(row.data));
        return {
          id: Number(row.id),
          time: String(row.time),
          text: String(value.summary || value.action || value.state),
        };
      });
  } finally {
    d.close();
  }
}
