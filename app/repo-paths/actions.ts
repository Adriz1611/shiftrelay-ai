"use server";

import { authorize } from "../../lib/auth";
import { buildSprintPlan, readContributorGuide, readSprintPlan } from "../../lib/repo-paths";
import { rehearsalIssues } from "./rehearsal";

async function readPath<T>(read: () => Promise<T>) {
  try {
    await authorize();
    return { data: await read(), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Repository evidence is unavailable." };
  }
}

export async function getSprintPath(hours: number, rehearsal = false) {
  return readPath(async () => rehearsal === true
    ? { ...buildSprintPlan(rehearsalIssues, hours), source: "#sprint-example-evidence", warnings: [] }
    : readSprintPlan(hours));
}

export async function getContributorPath() {
  return readPath(readContributorGuide);
}
