import { authorize } from "@/lib/auth";
import { loadRepoHistory } from "@/lib/repo-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    await authorize();
  } catch {
    return Response.json({ error: "Sign in to see repository history." }, { status: 401, headers });
  }
  try {
    const history = await loadRepoHistory();
    return history
      ? Response.json(history, { headers })
      : Response.json({ error: "Configure GITHUB_REPOSITORY to see its history." }, { status: 503, headers });
  } catch {
    return Response.json({ error: "Repository history could not be loaded." }, { status: 503, headers });
  }
}
