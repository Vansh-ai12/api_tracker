import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        {
          error: "Email content required",
        },
        {
          status: 400,
        },
      );
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",

      temperature: 0,

      messages: [
        {
          role: "system",
          content: `
You are a subscription email parser.

Extract subscription information from emails.

Rules:

1. Never invent missing dates.
2. If the email does not contain a year, return only:
   "MM-DD"
   or null.
3. Detect currency from symbols:
   ₹ = INR
   $ = USD
   € = EUR
4. Return ONLY JSON.

Return:

{
 "service_name": "",
 "domain": "",
 "amount": number | null,
 "currency": "",
 "billing_cycle": "weekly | monthly | yearly | null",
 "renewal_date": "YYYY-MM-DD | MM-DD | null",
 "type": "subscription | trial | usage | unknown"
}
`,
        },

        {
          role: "user",
          content: email,
        },
      ],
    });

    const result = completion.choices[0].message.content;

    const cleanedResult = result!
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed = JSON.parse(cleanedResult);

    const lowerEmail = email.toLowerCase();

    if (
      email.includes("₹") ||
      lowerEmail.includes("rs") ||
      lowerEmail.includes("inr") ||
      lowerEmail.includes("rupee")
    ) {
      parsed.currency = "INR";
    }

    if (
      email.includes("$") ||
      lowerEmail.includes("usd") ||
      lowerEmail.includes("dollar")
    ) {
      parsed.currency = "USD";
    }

    if (
      email.includes("€") ||
      lowerEmail.includes("eur") ||
      lowerEmail.includes("euro")
    ) {
      parsed.currency = "EUR";
    }

    return NextResponse.json({
      success: true,

      data: parsed,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Parsing failed",
      },
      {
        status: 500,
      },
    );
  }
}
