"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-16 font-sans">
      <h1 className="text-2xl font-semibold">Backend connection test</h1>

      <Link
        href="/streaming"
        className="self-start rounded bg-foreground px-4 py-2 text-background"
      >
        Go to Streaming
      </Link>

    </main>
  );
}
