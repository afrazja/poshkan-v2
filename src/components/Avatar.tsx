// Deterministic initials avatar — no upload/storage needed (v1).
function colorFor(seed: string): string {
  const colors = [
    "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c",
    "#16a34a", "#0891b2", "#4f46e5", "#9333ea", "#0d9488",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = (name || "?")
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: colorFor(name || "?"),
        fontSize: size * 0.4,
      }}
    >
      {initials || "?"}
    </span>
  );
}
