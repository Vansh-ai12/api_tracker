import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { requireProUser } from "@/lib/plan";
import { providerRegistry } from "@/lib/api-usage/registry";
import { ProviderCredentials } from "@/lib/api-usage/types";

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forbidden = await requireProUser(userId);
  if (forbidden) return forbidden;

  try {
    const body = await request.json();
    const { provider, credentials } = body;

    if (!provider || typeof provider !== "string") {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 });
    }

    if (!credentials || typeof credentials !== "object") {
      return NextResponse.json({ error: "Credentials are required" }, { status: 400 });
    }

    // Get provider adapter
    const adapter = providerRegistry.get(provider);
    if (!adapter) {
      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
    }

    // Build credentials object
    const providerCredentials: ProviderCredentials = {
      apiKey: credentials.apiKey || "",
      organizationId: credentials.organizationId,
      projectId: credentials.projectId,
    };

    // Validate credentials format
    if (!adapter.validateCredentials(providerCredentials)) {
      return NextResponse.json(
        { error: "Invalid credential format for this provider" },
        { status: 400 }
      );
    }

    // Test connection
    const isValid = await adapter.testConnection(providerCredentials);

    if (isValid) {
      return NextResponse.json({
        success: true,
        provider,
        message: "Connection successful"
      });
    } else {
      return NextResponse.json(
        { error: "Connection failed. Please check your credentials." },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("[api-integrations/test] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
