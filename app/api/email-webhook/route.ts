import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
async function parseEmailWithAI(emailContent: string) {
  const response = await fetch("http://localhost:3000/api/parse-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: emailContent,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("AI parsing failed");
  }

  return data.data;
}

export async function POST(request: Request) {
  try {
    const email = await request.json();

    console.log("Incoming email:", email);

    // Example:
    // 7f89av@unsub.app

    const recipient = email.to;

    if (!recipient) {
      return NextResponse.json(
        {
          error: "No recipient",
        },
        {
          status: 400,
        },
      );
    }

    // Extract alias

    const alias = recipient.split("@")[0];

    console.log("Extracted alias:", alias);

    // Find user

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("forwarding_alias", alias)
      .maybeSingle();

    if (userError) {
      console.error(userError);

      return NextResponse.json(
        {
          error: "User lookup failed",
        },
        {
          status: 500,
        },
      );
    }

    if (!user) {
      return NextResponse.json(
        {
          error: "No user found for alias",
        },
        {
          status: 404,
        },
      );
    }

    // Insert raw email

    const rawContent = JSON.stringify(email);

    // Save raw email first

    const { data: rawEmail, error: insertError } = await supabase
      .from("raw_emails")
      .insert({
        user_id: user.id,

        raw_content: rawContent,

        parse_status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error(insertError);

      return NextResponse.json(
        {
          error: "Could not save email",
        },
        {
          status: 500,
        },
      );
    }

    // Parse using Groq

    const subscription = await parseEmailWithAI(rawContent);

    console.log("Parsed subscription:", subscription);

    await supabase
      .from("raw_emails")
      .update({
        parse_status: "parsed",
      })
      .eq("id", rawEmail.id);

    const { error: subscriptionError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: user.id,

        service_name: subscription.service_name,

        domain: subscription.domain,

        amount: subscription.amount,

        currency: subscription.currency,

        billing_cycle: subscription.billing_cycle,
        renewal_date:
          subscription.renewal_date?.length === 5
            ? `${new Date().getFullYear()}-${subscription.renewal_date}`
            : subscription.renewal_date,

        status: "active",
      });

    if (subscriptionError) {
      console.error(subscriptionError);

      return NextResponse.json(
        {
          error: "Could not save subscription",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,

      message: "Email processed",

      user_id: user.id,

      alias,

      subscription: {
        ...subscription,

        currency: subscription.currency,

        renewal_date:
          subscription.renewal_date?.length === 5
            ? `${new Date().getFullYear()}-${subscription.renewal_date}`
            : subscription.renewal_date,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      {
        status: 500,
      },
    );
  }
}
