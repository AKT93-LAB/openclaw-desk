import { getMissionControlSnapshot } from "@/lib/dashboard";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = await getMissionControlSnapshot();
  return Response.json(snapshot);
}

