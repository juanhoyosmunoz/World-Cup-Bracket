export default function FlagIcon({ flag, className }: { flag?: string; className?: string }) {
  if (!flag) return null;
  if (flag.startsWith("http"))
    return <img src={flag} alt="" className={className ?? "w-6 h-4 object-cover rounded-sm"} />;
  return <span>{flag}</span>;
}
