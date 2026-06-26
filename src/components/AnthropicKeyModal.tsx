"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import {
  setAnthropicKeyAction,
  clearAnthropicKeyAction,
  getAnthropicKeyStatusAction,
} from "@/app/dashboard/[accountId]/actions";

// Manage the user's own Anthropic API key (powers the AI features on their account).
export default function AnthropicKeyModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<{ set: boolean; last4?: string } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setStatus(await getAnthropicKeyStatusAction());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await setAnthropicKeyAction(key);
    setBusy(false);
    if (res.error) return setMsg(res.error);
    setKey("");
    setMsg("✓ Saved");
    refresh();
  }

  async function clear() {
    setBusy(true);
    setMsg(null);
    await clearAnthropicKeyAction();
    setBusy(false);
    setMsg("Removed");
    refresh();
  }

  return (
    <Modal title="Your Claude API key" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Add your own Anthropic API key so the AI features (opportunity scanner, trade explanations,
          journal coach) run on <strong>your</strong> Anthropic account. Get one at{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            console.anthropic.com
          </a>
          . It&apos;s stored encrypted and never shown again.
        </p>

        {status?.set && (
          <div className="rounded-lg border border-positive/40 bg-positive/10 px-3 py-2">
            ✓ A key is saved{status.last4 ? ` (ends in …${status.last4})` : ""}.
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            className="flex-1 rounded-lg border border-border bg-input px-3 py-2 outline-none focus:border-primary"
          />
          <button
            onClick={save}
            disabled={busy || !key.trim()}
            className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : status?.set ? "Replace" : "Save"}
          </button>
        </div>

        {status?.set && (
          <button onClick={clear} disabled={busy} className="text-xs text-muted hover:text-negative">
            Remove saved key
          </button>
        )}
        {msg && <p className="text-xs text-muted">{msg}</p>}
      </div>
    </Modal>
  );
}
