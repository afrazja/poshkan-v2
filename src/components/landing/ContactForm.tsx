"use client";

import { useState, type FormEvent } from "react";
import { BTN_PRIMARY, INPUT_LP } from "./lp";

// The landing page's message box: the person who builds Poshkan speaks first,
// then a textarea, an optional address for a reply, and Send. It posts to
// /api/contact, which turns it into one email.
export default function ContactForm() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot; people never see it
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function send(e: FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, email, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setState("sent");
        setMessage("");
      } else {
        setError(data.error || "Couldn’t send just now. Please try again in a minute.");
        setState("error");
      }
    } catch {
      setError("Couldn’t send just now. Please try again in a minute.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-[14px] p-6" style={{ boxShadow: "inset 0 0 0 1px var(--lp-divider)" }} role="status">
        <p className="m-0 text-[16.5px] leading-[28px]">Sent. Thank you — every message gets read.</p>
        <p className="mb-0 mt-2 text-[14.5px] leading-[24px] text-[#e9e9edad]">
          {email
            ? `A reply will go to ${email}.`
            : "You didn’t leave an address, so there is no way to reply. Send another with one if you’d like an answer."}
        </p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="mt-4 text-[14px] text-[var(--lp-accent)] underline underline-offset-4"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={send}>
      <div
        className="mb-4 max-w-[52ch] rounded-[14px] rounded-tl-[4px] px-5 py-4 text-[15.5px] leading-[26px] text-[#e9e9edd1]"
        style={{ background: "color-mix(in srgb, var(--lp-accent) 9%, transparent)" }}
      >
        Hi — I build Poshkan, on my own. What confused you? What is missing? What broke? Write it
        the way you would say it; there is no form to fill in.
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        maxLength={2000}
        rows={5}
        placeholder="Type your message…"
        aria-label="Your message"
        className={`${INPUT_LP} block min-h-[132px] w-full resize-y py-3 leading-[24px]`}
      />
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
      />
      <div className="mt-3 flex flex-wrap items-stretch gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email, if you’d like a reply"
          aria-label="Your email address, optional"
          className={`${INPUT_LP} min-h-[46px] min-w-[240px] flex-1`}
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className={`${BTN_PRIMARY} whitespace-nowrap px-[22px] py-3 text-[15px] disabled:opacity-60`}
        >
          {state === "sending" ? "Sending…" : "Send"}
        </button>
      </div>
      {state === "error" && (
        <p className="mb-0 mt-3 text-[14px] leading-[22px] text-[#f0a1a1]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
