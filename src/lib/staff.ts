import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffMember = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "counsellor";
};

// Returns the signed-in staff member. Redirects to the login page when nobody
// is signed in; returns null when the user is signed in but is not active staff.
// Cached per request, so the layout and page share one lookup.
export const requireStaff = cache(async (): Promise<StaffMember | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/staff/login");

  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, email, role")
    .eq("id", userId)
    .eq("is_active", true)
    .maybeSingle<StaffMember>();

  return staff;
});
