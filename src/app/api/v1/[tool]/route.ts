import { call, cors } from "@/lib/agents/api";

async function handle(request: Request, { params }: { params: Promise<{ tool: string }> }) {
  return call(request, (await params).tool);
}

export { handle as GET, handle as POST };
export const OPTIONS = () => new Response(null, { status: 204, headers: cors });
