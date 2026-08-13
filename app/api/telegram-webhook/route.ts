import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { chatId, message } = await request.json();

    if (!chatId || !message) {
      return NextResponse.json(
        {
          success: false,
          error: "chatId and message are required",
        },
        { status: 400 }
      );
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "TELEGRAM_BOT_TOKEN is not configured",
        },
        { status: 500 }
      );
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
        }),
      }
    );

    const data = await telegramResponse.json();

    if (!telegramResponse.ok || !data.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.description || "Telegram API error",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Telegram message sent!",
      telegram: data,
    });
  } catch (error) {
    console.error("Telegram error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Something went wrong",
      },
      { status: 500 }
    );
  }
}