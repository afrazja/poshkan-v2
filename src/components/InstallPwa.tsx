"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallState = "installable" | "ios" | "manual" | "installed";

// "Install the app" section for the landing page. Chrome/Edge/Android get a
// real one-tap install button (beforeinstallprompt); iOS gets Share-menu
// instructions (Safari has no install API); already-installed users get a ✓.
export default function InstallPwa() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<InstallState>("manual");

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

          {state === "ios" && (
            <div className="mx-auto max-w-sm rounded-2xl border border-border bg-background p-4 text-left text-sm">
              <p className="font-semibold">On iPhone / iPad:</p>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-muted">
                <li>Open this page in Safari</li>
                <li>
                  Tap the <strong className="text-foreground">Share</strong> button (square with
                  an arrow)
                </li>
                <li>
                  Choose <strong className="text-foreground">Add to Home Screen</strong>
                </li>
              </ol>
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
