"use server";
import { decide } from "../lib/proposals";
import { authorize } from "../lib/auth";
import { latest, outcomeForRun, recentEvents } from "../lib/records";
import { latestRepair } from "../lib/checkout-repair";
import { recentWorkspaceCommands } from "../lib/workspace-commands";
import {
  investigationProgress,
  runInvestigation,
} from "../lib/investigation-progress";
export async function loadEvidence() {
  try {
    await authorize();
    return await runInvestigation();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "GitHub unavailable" };
  }
}

export async function review(id: string, approved: boolean) {
  await authorize();
  if (
    typeof approved !== "boolean" ||
    typeof id !== "string" ||
    !/^[a-f0-9]{64}$/.test(id)
  )
    throw new Error("Invalid proposal decision");
  return decide(id, approved);
}

export async function readWorkspace() {
  try {
    await authorize();
  } catch {
    return null;
  }
  const record = latest();
  const outcome =
    record.evidence && !record.proposal
      ? outcomeForRun(record.evidence.url)
      : null;
  return {
    ...outcome,
    ...record,
    events: recentEvents(),
    progress: investigationProgress(),
    repair: latestRepair(),
    commands: recentWorkspaceCommands(),
  };
}
export async function retryDiscord(id: string) {
  await authorize();
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
    throw new Error("Invalid proposal");
  return decide(id, true, true);
}
