import { ImageResponse } from "next/og";

// Branded 1200×630 preview for link shares (WhatsApp, Telegram, X, Discord…).
// Rendered on demand — no binary asset to keep in sync with the design.
export const alt = "Poshkan — trade fearlessly, lose nothing. Paper trading with strategy scanners.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CANDLES = [
  { h: 120, up: true },
  { h: 190, up: false },
  { h: 150, up: true },
  { h: 240, up: true },
  { h: 170, up: false },
  { h: 280, up: true },
  { h: 210, up: false },
  { h: 320, up: true },
];

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #0b0e14 0%, #101726 55%, #1e1b4b 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* candle backdrop, right side */}
        <div
          style={{
            position: "absolute",
            right: 40,
            bottom: 0,
            display: "flex",
            alignItems: "flex-end",
            gap: 28,
            opacity: 0.55,
          }}
        >
          {CANDLES.map((c, i) => (
            <div
              key={i}
              style={{
                width: 34,
                height: c.h,
                borderRadius: 6,
                background: c.up ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
                border: c.up ? "2px solid rgba(34,197,94,0.8)" : "2px solid rgba(239,68,68,0.8)",
                boxShadow: c.up ? "0 0 40px rgba(34,197,94,0.5)" : "0 0 40px rgba(239,68,68,0.5)",
              }}
            />
          ))}
        </div>

        {/* copy */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 80px",
            maxWidth: 760,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              P
            </div>
            <div style={{ fontSize: 40, fontWeight: 700 }}>Poshkan</div>
          </div>
          <div style={{ marginTop: 40, fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>
            Trade fearlessly. Lose nothing.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
            Strategy scanners that find & trade setups on stocks, crypto and forex — 100% virtual money.
          </div>
          <div
            style={{
              marginTop: 36,
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 26,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <div
              style={{
                background: "rgba(59,130,246,0.25)",
                border: "1px solid rgba(59,130,246,0.6)",
                borderRadius: 999,
                padding: "8px 24px",
                color: "#ffffff",
              }}
            >
              Free
            </div>
            www.poshkan.com
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
