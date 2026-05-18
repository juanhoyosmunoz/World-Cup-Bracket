export default function Loading({ fullscreen = false }: { fullscreen?: boolean }) {
  const dot = "inline-block w-2.5 h-2.5 rounded-full bg-brand-500 animate-bounce";
  return (
    <div
      className={
        fullscreen
          ? "min-h-screen flex items-center justify-center"
          : "py-12 flex items-center justify-center"
      }
    >
      <div className="flex gap-1.5">
        <span className={dot} style={{ animationDelay: "0ms" }} />
        <span className={dot} style={{ animationDelay: "120ms" }} />
        <span className={dot} style={{ animationDelay: "240ms" }} />
      </div>
    </div>
  );
}
