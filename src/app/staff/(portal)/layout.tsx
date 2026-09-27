import { requireStaff } from "@/lib/staff";

export default async function StaffPortalLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <span className="font-semibold">Studies and Awards AI · Staff</span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-neutral-600 underline">
            Sign out
          </button>
        </form>
      </header>
      {staff ? (
        children
      ) : (
        <main className="mx-auto max-w-md flex-1 px-4 py-16">
          <h1 className="text-xl font-semibold">No staff access</h1>
          <p className="mt-2 text-neutral-600">
            You are signed in, but this account is not an active staff member. Ask an admin to add
            you to the staff list.
          </p>
        </main>
      )}
    </div>
  );
}
