import { relayer } from "@/lib/server/relayer";

export const dynamic = "force-dynamic";

const handle = (req: Request) => relayer().fetch(req);
export const GET = handle;
export const POST = handle;
