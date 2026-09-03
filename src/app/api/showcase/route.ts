import { NextResponse } from "next/server";
import { requireUser } from "../_auth";
import { getShowcase, type ShowcaseType } from "@/lib/showcase";

// Shelves for an account's showcase. Cached server-side for five minutes and
// shared by every viewer, so this costs one batched quote per instance per five
// minutes however many people are looking.
export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = new URL(request.url).searchParams.get("type");
  const type: ShowcaseType = raw === "crypto" ? "crypto" : "stocks";
  try {
    return NextResponse.json({ shelves: await getShowcase(type) });
  } catch (error) {
    console.warn(`[showcase] ${type}: ${(error as Error).message ?? "failed"}`);
    return NextResponse.json({ shelves: [] });
  }
}
