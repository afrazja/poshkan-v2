import { NextResponse } from "next/server";
import { requireUser } from "../_auth";
import { getStockShowcase } from "@/lib/showcase";

// Shelves for the stock account's showcase. Cached server-side for five
// minutes and shared by every viewer, so this costs one batched quote per
// instance per five minutes however many people are looking.
export async function GET() {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ shelves: await getStockShowcase() });
  } catch (error) {
    console.warn(`[showcase] ${(error as Error).message ?? "failed"}`);
    return NextResponse.json({ shelves: [] });
  }
}
