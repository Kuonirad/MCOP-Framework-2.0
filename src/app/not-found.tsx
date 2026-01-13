import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center font-sans gap-8">
      <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl">
        404
      </h1>
      <p className="text-lg text-foreground/80 max-w-[42rem] leading-normal sm:text-xl sm:leading-8">
        The trace you are following has dissolved.
      </p>
      <div className="flex gap-4 items-center flex-col sm:flex-row">
        <Link
          href="/"
          className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 focus:outline-none"
        >
          <Image
            aria-hidden
            className="dark:invert rotate-180"
            src="/next.svg"
            alt=""
            width={20}
            height={20}
          />
          Return to Source
        </Link>
      </div>
    </div>
  );
}
