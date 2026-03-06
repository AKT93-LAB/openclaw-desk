import { getMissionControlSnapshot } from "@/lib/dashboard";
import { MissionControlShell } from "@/components/mission-control-shell";

export default async function HomePage() {
  const snapshot = await getMissionControlSnapshot();
  return <MissionControlShell initialSnapshot={snapshot} />;
}

