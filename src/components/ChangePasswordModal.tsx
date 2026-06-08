"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "./Modal";

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords do not match.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    setDone(true);
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Your password has been updated.</p>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">New password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Confirm new password</label>
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
    </Modal>
  );
}
