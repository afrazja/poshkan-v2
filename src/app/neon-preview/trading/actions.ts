"use server";
import { revalidatePath } from "next/cache";
import { placePreviewTrade } from "@/lib/neon-preview/trading";

export async function trade(requestId: unknown, input: unknown): Promise<{ result?: Record<string,string>; error?: string }> {
  try {
    const result = await placePreviewTrade(requestId, input);
    revalidatePath("/neon-preview/trading");
    return { result };
  } catch (error) {
    // Never send raw PostgreSQL/Yahoo diagnostics (or connection settings) to a browser.
    const message = error instanceof Error ? error.message : "";
    const safe = /^(Insufficient cash|Not enough holdings|Account not found|Open position not found|Invalid stop loss|Invalid close units|Partial close too small|Trade is too small|Position too small|Symbol does not match|Request ID reused|Use a forex position|A fresh market price|The market is closed|This test supports|Unsupported asset type|The quoted price|Sign in to your approved)/;
    return { error: safe.test(message) ? message : "The test trade could not be completed. Check the inputs and connection, then refresh. Retrying the same request cannot execute it twice." };
  }
}
