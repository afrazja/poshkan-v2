"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BTN_PRIMARY, INPUT_LP } from "./lp";

// The closing-section sign-up row: an email field that hands off into the real
// sign-up flow at /signup with the address pre-filled.
export default function SignupCta() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = email.trim();
        router.push(v ? `/signup?email=${encodeURIComponent(v)}` : "/signup");
      }}
      className="flex max-w-[520px] flex-wrap items-stretch gap-3"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className={`${INPUT_LP} min-h-[46px] min-w-[220px] flex-1`}
      />
      <button type="submit" className={`${BTN_PRIMARY} whitespace-nowrap px-[22px] py-3 text-[15px]`}>
        Create a free account
      </button>
    </form>
  );
}
