import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">Studies and Awards AI</h1>
      <p className="text-neutral-600">
        An online consultant that helps students check their eligibility to study in Australia.
        The student-facing checker is coming soon.
      </p>
      <Link href="/staff" className="text-sm underline">
        Staff sign in
      </Link>
    </main>
  );
}
