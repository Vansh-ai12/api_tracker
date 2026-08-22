import { NextResponse } from "next/server";
import { getSessionUserId, getUserPlan } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const plan = await getUserPlan(userId);
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("[api/user/plan] Failed to fetch user plan:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
