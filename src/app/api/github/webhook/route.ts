import { after, NextResponse, type NextRequest } from "next/server";
import { githubReady, webhookSecret } from "@/lib/github/app";
import { signatureOk } from "@/lib/github/signature";
import { handleDelivery } from "@/lib/github/sync";

// GitHub's webhooks for the Acta app. The signature proves a delivery came from GitHub. The answer goes back
// straight away and the work happens after, since GitHub gives up on a slow answer
export async function POST(request: NextRequest) {
  if (!githubReady) return new NextResponse(null, { status: 404 });
  const body = await request.text();
  if (!signatureOk(webhookSecret, body, request.headers.get("x-hub-signature-256")))
    return new NextResponse(null, { status: 401 });

  const event = request.headers.get("x-github-event") ?? "";
  const delivery = request.headers.get("x-github-delivery") ?? "";
  if (event === "ping") return NextResponse.json({ ok: true });
  if (!delivery) return new NextResponse(null, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  after(() =>
    handleDelivery(event, delivery.slice(0, 100), payload).catch((error) =>
      console.error(`GitHub ${event} ${delivery} failed`, error),
    ),
  );
  return new NextResponse(null, { status: 202 });
}
