import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only the staff area uses Supabase sessions for now. Widen this when
  // signed-in pages are added elsewhere.
  matcher: ["/staff", "/staff/:path*"],
};
