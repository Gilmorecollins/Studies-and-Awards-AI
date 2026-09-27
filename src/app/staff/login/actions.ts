"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

// Emails a one-time sign-in link. Only existing Supabase users can sign in
// (shouldCreateUser: false): staff are invited from the Supabase dashboard.
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await siteUrl()}/auth/callback?next=/staff`,
    },
  });

  if (error) {
    // Supabase returns an error for unknown emails when shouldCreateUser is
    // false. Show the same message either way so staff emails are not revealed.
    console.error("signInWithOtp failed:", error.message);
  }

  return {
    status: "sent",
    message: "If that email belongs to a staff account, a sign-in link is on its way.",
  };
}

async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
