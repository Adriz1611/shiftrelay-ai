"use server";

import { authorize } from "../../lib/auth";
import { getRepositoryBriefing } from "../../lib/repo-briefing";

export async function loadRepositoryBriefing() {
  try {
    await authorize();
  } catch {
    return { error: "Sign in as the demo operator to read GitHub signals." } as const;
  }
  return { briefing: await getRepositoryBriefing() } as const;
}
