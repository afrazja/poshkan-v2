"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallState = "installable" | "ios" | "manual" | "installed";

// The iOS Share icon (square with an up arrow), inline so the step reads visually.
function ShareGlyph() {
  return (
    <svg
      className="inline-block h-4 w-4 align-text-bottom text-primary"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <rect x="4" y="11" width="16" height="10" rx="2" />
    </svg>
  );
}

// "Install the app" section for the landing page. Chrome/Edge/Android get a
// real one-tap install button (beforeinstallprompt); iOS gets Share-menu
// instructions (Safari has no install API); already-installed users get a ✓.
export default function InstallPwa() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<InstallState>("manual");
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setState("installed");
      return;
    }
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setState("ios");
    }
    // Chrome/Android: detect when our PWA is already installed (no install
    // event fires in that case, so without this check we'd show instructions
    // to someone who already has the app).
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<{ platform: string }[]>;
    };
    nav
      .getInstalledRelatedApps?.()
      .then((apps) => {
        if (apps.length > 0) setState("installed");
      })
      .catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setState("installable");
    };
    const onInstalled = () => setState("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setState("installed");
    setDeferred(null);
  }

  return (
    <section className="border-t border-border bg-card px-6 py-14 sm:px-12">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold tracking-tight">📲 Poshkan in your pocket</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Install it like a real app — home-screen icon, full screen, and push notifications when
          your orders fill or alerts hit.
        </p>

        <div className="mt-6">
          {state === "installed" && (
            <p className="font-medium text-positive">✓ Installed — open it from your home screen.</p>
          )}

          {state === "installable" && (
            <button
              onClick={install}
              className="rounded-xl bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-md transition hover:opacity-90"
            >
              Install Poshkan
            </button>
          )}

          {state === "ios" && !showIosGuide && (
            <button
              onClick={() => setShowIosGuide(true)}
              className="rounded-xl bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-md transition hover:opacity-90"
            >
              📲 Install on iPhone
            </button>
          )}

          {state === "ios" && showIosGuide && (
            <div className="mx-auto max-w-sm rounded-2xl border border-primary/40 bg-background p-5 text-left text-sm">
              <p className="font-semibold">Two taps and it&apos;s on your home screen:</p>
              <ol className="mt-3 space-y-3 text-muted">
                <li className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                  <span>
                    Tap the <strong className="text-foreground">Share</strong> button{" "}
                    <ShareGlyph /> at the bottom of Safari
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                  <span>
                    Scroll down and tap{" "}
                    <strong className="text-foreground">Add to Home Screen</strong>{" "}
                    <span className="inline-block rounded border border-border px-1 text-xs">＋</span>
                  </span>
                </li>
              </ol>
              <p className="mt-3 text-xs text-muted">
                (Using Chrome on iPhone? Same thing — Share, then &quot;Add to Home Screen&quot;.)
              </p>
            </div>
          )}

          {state === "manual" && (
            <div className="mx-auto max-w-sm rounded-2xl border border-border bg-background p-4 text-left text-sm">
              <p className="font-semibold">To install:</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
                <li>
                  <strong className="text-foreground">Android (Chrome):</strong> menu ⋮ →{" "}
                  <em>Add to Home screen</em>
                </li>
                <li>
                  <strong className="text-foreground">Desktop (Chrome/Edge):</strong> the install
                  icon in the address bar, or menu → <em>Install Poshkan</em>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
