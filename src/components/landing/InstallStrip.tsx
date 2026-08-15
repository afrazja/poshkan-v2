"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { BTN_SECONDARY, SHADOW_SM } from "./lp";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The compact install strip from the landing design: icon, one line of copy,
// and a secondary button. Chrome/Edge/Android get the real install prompt;
// iOS and other browsers get a one-line instruction instead; installed users
// get a checkmark.
export default function InstallStrip() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<"installable" | "ios" | "manual" | "installed">("manual");
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return setState("installed");
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setState("ios");
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
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setState("installed");
      setDeferred(null);
      return;
    }
    setHint(true);
  }

  return (
    <div
      className="mt-14 flex flex-wrap items-center gap-x-5 gap-y-4 rounded-[10px] px-6 py-[22px]"
      style={{ boxShadow: SHADOW_SM }}
    >
      <Smartphone size={22} className="text-[var(--lp-accent)]" aria-hidden />
      <p className="m-0 min-w-[260px] flex-1 text-[15.5px] leading-[25px] text-[#e9e9edcc]">
        {state === "installed"
          ? "Installed — open Poshkan from your home screen."
          : hint
            ? state === "ios"
              ? "In Safari: tap Share, then “Add to Home Screen”."
              : "In Chrome or Edge: the install icon in the address bar, or menu → “Install Poshkan”."
            : "Poshkan installs like a real app — home-screen icon, full screen, and a push when an order fills or an alert hits."}
      </p>
      {state !== "installed" && (
        <button onClick={install} className={`${BTN_SECONDARY} px-[18px] py-2.5 text-[14px]`}>
          Install Poshkan
        </button>
      )}
    </div>
  );
}
