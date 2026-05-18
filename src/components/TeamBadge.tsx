import type { Team } from "../types";

export default function TeamBadge({ team, size = "md" }: { team?: Team | null; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "text-base" : size === "lg" ? "text-3xl" : "text-xl";
  if (!team) return <span className="text-ink-400 italic">TBD</span>;
  const isUrl = team.flag?.startsWith("http");
  return (
    <span className="inline-flex items-center gap-2">
      {isUrl ? (
        <img src={team.flag} alt="" className="w-6 h-4 object-cover rounded-sm" />
      ) : (
        <span className={sz}>{team.flag}</span>
      )}
      <span className="font-semibold">{team.name}</span>
    </span>
  );
}
