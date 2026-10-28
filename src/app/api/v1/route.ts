import { cors, index } from "@/lib/agents/api";

export const GET = index;
export const OPTIONS = () => new Response(null, { status: 204, headers: cors });
