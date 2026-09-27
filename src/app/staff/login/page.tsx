import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in" };

export default async function StaffLoginPage({ searchParams }: PageProps<"/staff/login">) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Staff sign in</h1>
        <p className="mt-1 text-sm text-neutral-500">Studies and Awards AI</p>
      </div>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          That sign-in link is invalid or has expired. Request a new one.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
