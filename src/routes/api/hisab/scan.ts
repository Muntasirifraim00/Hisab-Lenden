import { createFileRoute } from "@tanstack/react-router";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * AI স্ক্যান (OCR) — মেমোর ছবি থেকে তারিখ, টাকা, পরিশোধ, পার্টির নাম ও
 * বিবরণ পড়ার চেষ্টা করে। ফলাফল ফর্ম ভরে দেয়, সরাসরি সেভ করে না —
 * ব্যবহারকারীকে সবসময় মিলিয়ে নিতে হয়।
 *
 * ANTHROPIC_API_KEY না থাকলে বাকি অ্যাপ স্বাভাবিকভাবেই চলে, শুধু এই
 * বোতামটা "চালু নেই" বলে জানায়।
 */

const MODEL = "claude-opus-5";

const BodySchema = z.object({
  // data URL: data:image/jpeg;base64,....  (সর্বোচ্চ ~৮ MB)
  image: z.string().min(64).max(11_000_000),
  type: z.enum(["expense", "purchase", "sale"]).optional(),
});

/** AI-কে ঠিক এই কাঠামোতেই উত্তর দিতে বাধ্য করা হয় */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    invoice_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    memo_no: { type: ["string", "null"] },
    party_name: { type: ["string", "null"] },
    total_amount: { type: ["number", "null"] },
    paid_amount: { type: ["number", "null"] },
    details: { type: ["string", "null"], description: "বাংলায় সংক্ষিপ্ত বিবরণ" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_name: { type: "string" },
          qty: { type: "number" },
          unit_price: { type: "number" },
        },
        required: ["product_name", "qty", "unit_price"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number", description: "০ থেকে ১" },
  },
  required: [
    "invoice_date",
    "memo_no",
    "party_name",
    "total_amount",
    "paid_amount",
    "details",
    "items",
    "confidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM = `তুমি একটা বাংলাদেশি দোকানের হিসাবরক্ষক। ছবিটা একটা মেমো / রসিদ / চালান / ইনভয়েস।
ছবি থেকে যা পড়তে পারো তা বের করো।

নিয়ম:
- যা ছবিতে স্পষ্ট নেই, সেটা null দাও — অনুমান করো না।
- টাকার অঙ্ক শুধু সংখ্যা, কোনো চিহ্ন বা কমা নয়।
- বাংলা অঙ্ক (০-৯) দেখলে ইংরেজি সংখ্যায় বদলে দাও।
- হাতে লেখা মেমো হলে confidence কম দাও।
- পণ্যের তালিকা না থাকলে items খালি অ্যারে দাও।`;

export const Route = createFileRoute("/api/hisab/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.ANTHROPIC_API_KEY) {
          return Response.json(
            { error: "AI স্ক্যান চালু নেই (ANTHROPIC_API_KEY নেই)।" },
            { status: 503 },
          );
        }

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "ছবিটা পড়া গেল না।" }, { status: 400 });
        }

        const parsedImage = parseDataUrl(body.image);
        if (!parsedImage) {
          return Response.json({ error: "শুধু ছবি ফাইল দেওয়া যাবে।" }, { status: 400 });
        }

        const client = new Anthropic();

        try {
          const response = await client.messages.create({
            model: MODEL,
            max_tokens: 16000,
            system: SYSTEM,
            // মেমো পড়া সহজ কাজ — কম effort-এ দ্রুত ও সস্তা, মান একই থাকে
            output_config: {
              effort: "low",
              format: { type: "json_schema", schema: OUTPUT_SCHEMA },
            },
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: parsedImage.mediaType,
                      data: parsedImage.data,
                    },
                  },
                  {
                    type: "text",
                    text: `এই মেমোটা পড়ো। এন্ট্রির ধরন: ${typeLabel(body.type)}`,
                  },
                ],
              },
            ],
          });

          if (response.stop_reason === "refusal") {
            return Response.json({ error: "ছবিটা পড়তে AI রাজি হয়নি।" }, { status: 422 });
          }

          const text = response.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");

          return Response.json({ ok: true, result: sanitize(JSON.parse(text)) });
        } catch (error) {
          return Response.json({ error: message(error) }, { status: status(error) });
        }
      },
    },
  },
});

/* ------------------------------ সহায়ক ------------------------------ */

const typeLabel = (type?: string) =>
  type === "sale"
    ? "বিক্রয়"
    : type === "purchase"
      ? "ক্রয়"
      : type === "expense"
        ? "খরচ"
        : "অজানা";

function parseDataUrl(input: string) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/i.exec(input);
  if (!match) return null;

  // Claude "image/jpg" চেনে না — "image/jpeg" লেখা লাগে
  const mediaType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  return {
    mediaType: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
    data: match[2],
  };
}

function status(error: unknown) {
  if (error instanceof Anthropic.RateLimitError) return 429;
  if (error instanceof Anthropic.AuthenticationError) return 503;
  if (error instanceof Anthropic.APIConnectionError) return 502;
  return 502;
}

function message(error: unknown) {
  if (error instanceof Anthropic.RateLimitError) {
    return "একটু পরে আবার চেষ্টা করুন (অনেক বেশি অনুরোধ)।";
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return "AI-এর চাবি (ANTHROPIC_API_KEY) ঠিক নেই।";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "AI সার্ভারে পৌঁছানো গেল না।";
  }
  if (error instanceof SyntaxError) {
    return "AI যা দিল তা বোঝা গেল না।";
  }
  console.error("hisab/scan:", error);
  return "স্ক্যান করা গেল না।";
}

/** AI যা দিল তা ছেঁকে নিরাপদ আকারে ফেরত */
function sanitize(input: unknown) {
  const o = (input ?? {}) as Record<string, unknown>;

  const numeric = (v: unknown) => {
    const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  };
  const text = (v: unknown, max: number) => {
    const s = String(v ?? "").trim();
    return s && s !== "null" ? s.slice(0, max) : null;
  };
  const isoDate = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const today = new Date().toISOString().slice(0, 10);
    return s > today ? null : s; // ভবিষ্যতের তারিখ নেওয়া হয় না
  };

  const items = Array.isArray(o.items)
    ? o.items.slice(0, 30).map((raw) => {
        const it = (raw ?? {}) as Record<string, unknown>;
        return {
          product_name: text(it.product_name, 120) ?? "পণ্য",
          qty: numeric(it.qty) ?? 1,
          unit_price: numeric(it.unit_price) ?? 0,
        };
      })
    : [];

  const conf = Number(o.confidence);

  return {
    invoice_date: isoDate(o.invoice_date),
    memo_no: text(o.memo_no, 60),
    party_name: text(o.party_name, 120),
    total_amount: numeric(o.total_amount),
    paid_amount: numeric(o.paid_amount),
    details: text(o.details, 300),
    items,
    confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
  };
}
