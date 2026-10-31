import { roadmapApi, roadmapPreflight } from "@/lib/roadmap-api";

// The roadmap API, for building a board's public roadmap into another site. See /docs/roadmap-api
const handle = (request: Request) => roadmapApi(request);

export { handle as GET, handle as POST };
export const OPTIONS = (request: Request) => roadmapPreflight(request);
