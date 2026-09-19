"use server";
import { revalidatePath } from "next/cache";
import { placePreviewTrade } from "@/lib/neon-preview/trading";
import { checkOrders, saveOrder } from "@/lib/neon-preview/orders";
import { changeWorker, readWorker } from "@/lib/neon-preview/background";

export async function backgroundStatus() {
  try {return {state:await readWorker()};}
  catch {return {error:"Background status unavailable. Check your connection and sign in again if needed."};}
}
export async function setBackground(enabled: unknown) {
  try {
    if(typeof enabled!=="boolean") throw new Error("Invalid setting");
    const state=await changeWorker(enabled);
    revalidatePath("/neon-preview/trading");
    return {state};
  } catch(error) {
    return {error:error instanceof Error && error.message==="Background process is offline"?"The background process is offline. Restart the local preview to reconnect it.":"Could not change background execution. Refresh to confirm its current status."};
  }
}

export async function order(requestId: unknown, input: unknown): Promise<{ result?: Record<string,string>; error?: string }> {
  try {
    const result = await saveOrder(requestId,input);
    revalidatePath("/neon-preview/trading");
    return { result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /^(Account not found|Open position not found|Invalid order|Invalid limit|Invalid entry|Invalid stop loss|Invalid close timer|Invalid take-profit|Take-profit amounts exceed|Symbol does not match|Request ID reused|Sign in to your approved)/;
    return {error: safe.test(message) ? message : "Could not save this test order. Check the amounts, price precision and connection. Retry unchanged to avoid duplicates."};
  }
}

export async function runOrderChecks() {
  try {
    const result = await checkOrders();
    revalidatePath("/neon-preview/trading");
    return {result};
  } catch {
    return {error: "Checks could not finish. Check your connection and sign in again if your session has expired. Completed fills will not repeat."};
  }
}

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
