import Link from "next/link";

export default function NotFound() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-8 row-start-2 items-center text-center">
        <h1 className="text-6xl font-bold tracking-tighter sm:text-8xl">404</h1>
        <div className="flex flex-col gap-4 items-center">
          <h2 className="text-xl font-medium sm:text-2xl">Page Not Found</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[400px]">
            The trace you are following has dissolved.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 focus:outline-none"
        >
          Return to Source
        </Link>
      </main>
    </div>
  );
}
