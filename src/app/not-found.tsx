import Link from "next/link";

export default function NotFound() {
  return (
    <div className="font-sans grid min-h-screen grid-rows-[1fr_auto_1fr] items-center justify-items-center p-8 pb-20 sm:p-20">
      <main className="row-start-2 flex flex-col items-center gap-8 text-center">
        <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl">
          404
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          The trace you are following has dissolved.
        </p>

        <Link
          href="/"
          className="group mt-4 rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-auto focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 focus:outline-none"
        >
          Return to Source
          <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none ml-1">
            →
          </span>
        </Link>
      </main>
    </div>
  );
}
