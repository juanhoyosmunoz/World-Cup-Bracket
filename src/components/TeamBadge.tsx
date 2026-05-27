import type { Team } from "../types";
import FlagIcon from "./FlagIcon";

export default function TeamBadge({ team, size = "md", layout = "inline" }: { team?: Team | null; size?: "sm" | "md" | "lg"; layout?: "inline" | "stacked" }) {
  if (!team) return <span className="text-ink-400 italic">TBD</span>;
  const imgSize = size === "sm" ? "w-5 h-3.5" : size === "lg" ? "w-10 h-7" : "w-7 h-5";

  if (layout === "stacked") {
    return (
      <span className="inline-flex flex-col items-center gap-1 text-center">
        <FlagIcon flag={team.flag} className={`${imgSize} object-cover rounded-sm`} />
        <span className="font-semibold text-sm leading-tight">{team.name}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <FlagIcon flag={team.flag} className={`${imgSize} object-cover rounded-sm`} />
      <span className="font-semibold">{team.name}</span>
    </span>
  );
}
