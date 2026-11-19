import { createHash, randomBytes } from "node:crypto";
import { db } from "./records";

function store() {
  const d = db();
  d.exec(
    "CREATE TABLE IF NOT EXISTS voice_sessions(token_hash TEXT PRIMARY KEY, agent TEXT, expires INTEGER NOT NULL)",
  );
  return d;
}
function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function issueToolToken() {
  const token = randomBytes(32).toString("hex"),
    d = store();
  try {
    d.prepare("DELETE FROM voice_sessions WHERE expires < ?").run(Date.now());
    d.prepare("INSERT INTO voice_sessions VALUES(?,NULL,?)").run(
      digest(token),
      Date.now() + 300000,
    );
    return token;
  } finally {
    d.close();
  }
}
export function validToolToken(header: string | null) {
  if (!header || !/^Bearer [a-f0-9]{64}$/.test(header)) return false;
  const d = store();
  try {
    return !!d
      .prepare("SELECT 1 FROM voice_sessions WHERE token_hash=? AND expires>?")
      .get(digest(header.slice(7)), Date.now());
  } finally {
    d.close();
  }
}
export function toolAgent(header: string | null) {
  if (!header || !/^Bearer [a-f0-9]{64}$/.test(header)) return undefined;
  const connection = store();
  try {
    const row = connection
      .prepare(
        "SELECT agent FROM voice_sessions WHERE token_hash=? AND expires>?",
      )
      .get(digest(header.slice(7)), Date.now());
    return typeof row?.agent === "string" ? row.agent : undefined;
  } finally {
    connection.close();
  }
}
export function bindAgent(token: string, id: string) {
  const d = store();
  try {
    d.prepare("UPDATE voice_sessions SET agent=? WHERE token_hash=?").run(
      id,
      digest(token),
    );
  } finally {
    d.close();
  }
}
export function ownsAgent(id: string) {
  const d = store();
  try {
    return !!d.prepare("SELECT 1 FROM voice_sessions WHERE agent=?").get(id);
  } finally {
    d.close();
  }
}
export function revokeAgent(id: string) {
  const d = store();
  try {
    d.prepare("DELETE FROM voice_sessions WHERE agent=?").run(id);
  } finally {
    d.close();
  }
}
