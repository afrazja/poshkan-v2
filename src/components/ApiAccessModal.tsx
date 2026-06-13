"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import {
  createApiTokenAction,
  listApiTokensAction,
  revokeApiTokenAction,
} from "@/app/dashboard/[accountId]/actions";

interface TokenRow {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

// Manage personal API tokens that let Claude (via MCP) act on your accounts.
export default function ApiAccessModal({ onClose }: { onClose: () => void }) {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("Claude");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const res = await listApiTokensAction();
    if (res.error) setError(res.error.includes("api_tokens") ? "Run supabase/mcp.sql first." : res.error);
    else setTokens(res.tokens ?? []);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    setError(null);
    setBusy(true);
    const res = await createApiTokenAction(name);
    setBusy(false);
    if (res.error) return setError(res.error);
    setNewToken(res.token ?? null);
    refresh();
  }

  async function revoke(id: string) {
    await revokeApiTokenAction(id);
    refresh();
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://poshkan.com";
  const mcpUrl = `${origin}/api/mcp/mcp`;

  return (
    <Modal title="Claude API access" onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Create a token to let Claude trade and read your accounts through MCP. Treat tokens
          like passwords — anyone holding one can act on your paper accounts.
        </p>

        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-negative">
            {error}
          </div>
        )}

        {newToken ? (
          <div className="space-y-3 rounded-lg border border-positive/40 bg-positive/10 p-4">
            <p className="font-semibold">✓ Token created — copy it now, it won&apos;t be shown again:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md bg-background px-3 py-2 text-xs">{newToken}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newToken);
                  setCopied(true);
                }}
                className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="space-y-2 border-t border-border pt-3 text-xs text-muted">
              <p className="font-semibold text-foreground">Connect Claude:</p>
              <p>
                <strong>claude.ai</strong> → Settings → Connectors → Add custom connector → URL:
              </p>
              <code className="block overflow-x-auto rounded-md bg-background px-2 py-1.5">
                {mcpUrl}?key={newToken}
              </code>
              <p>
                <strong>Claude Code</strong>:
              </p>
              <code className="block overflow-x-auto rounded-md bg-background px-2 py-1.5">
                claude mcp add poshkan --transport http &quot;{mcpUrl}&quot; --header &quot;Authorization: Bearer {newToken}&quot;
              </code>
            </div>
            <button onClick={() => setNewToken(null)} className="text-xs text-muted hover:text-foreground">
              Done — hide token
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Token name (e.g. Claude)"
              className="flex-1 rounded-lg border border-border bg-input px-3 py-2 outline-none focus:border-primary"
            />
            <button
              onClick={create}
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create token"}
            </button>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your tokens</h3>
          {tokens === null ? (
            <p className="text-muted">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="text-muted">No tokens yet.</p>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div>
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 text-xs text-muted">
                      created {new Date(t.created_at).toLocaleDateString("en-US")}
                      {t.last_used_at
                        ? ` · last used ${new Date(t.last_used_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                        : " · never used"}
                    </span>
                  </div>
                  <button onClick={() => revoke(t.id)} className="shrink-0 text-xs text-muted hover:text-negative">
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
