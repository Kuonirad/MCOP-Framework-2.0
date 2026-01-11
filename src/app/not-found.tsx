import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
      <main id="main-content" className="flex flex-col items-center gap-6 text-center px-4">
        <h1 className="font-mono text-8xl font-bold tracking-tighter opacity-10">404</h1>

        <div className="space-y-2">
          <h2 className="font-mono text-xl font-medium tracking-tight">
            Trace Dissolved
          </h2>
          <p className="font-sans text-sm text-foreground/60 max-w-[300px]">
            The trace you are following has dissolved.
          </p>
        </div>

        <Link
          href="/"
          className="font-mono mt-4 rounded-full border border-foreground/10 px-6 py-2 text-sm transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
        >
          Return to Source
        </Link>
      </main>
    </div>
  );
}
