"use client";

// Landing tour video. iOS requires `muted` and `playsInline` to be set as DOM
// properties (not just attributes) for muted autoplay to work — the ref
// callback sets them and kicks playback.
export default function LandingVideo({
  src,
  poster,
  ariaLabel,
}: {
  src: string;
  poster?: string;
  ariaLabel: string;
}) {
  return (
    <video
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      controls
      preload="metadata"
      aria-label={ariaLabel}
      className="block w-full"
      ref={(v) => {
        if (!v) return;
        v.muted = true;
        v.loop = true;
        v.controls = true;
        v.playsInline = true;
        v.play().catch(() => {});
      }}
    />
  );
}
