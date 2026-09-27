import type { Metadata } from "next";
import { requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Staff dashboard" };

export default async function StaffHomePage() {
  const staff = await requireStaff();
  if (!staff) return null; // the layout shows the "no staff access" message

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold">Welcome, {staff.full_name}</h1>
      <p className="mt-2 text-neutral-600">
        Signed in as {staff.email} ({staff.role}). Course data, requirement review and student
        assessments will appear here in the next steps.
      </p>
    </main>
  );
}
