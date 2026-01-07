import Link from "next/link";

export default function NotFound() {
  return (
    <div className="font-sans grid items-center justify-items-center min-h-screen p-8 pb-20 sm:p-20">
      <main id="main-content" className="flex flex-col gap-8 items-center text-center max-w-lg">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">404</h1>

        <div className="space-y-4">
          <p className="text-xl font-medium">
            The trace you are following has dissolved.
          </p>
          <p className="text-sm text-black/60 dark:text-white/60 font-mono">
            Error: Signal Lost
          </p>
        </div>

        <Link
          href="/"
          className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 focus:outline-none"
          aria-label="Return to Source (Home)"
        >
          Return to Source
        </Link>
      </main>
    </div>
  );
}
