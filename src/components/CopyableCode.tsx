'use client';

import { useState } from 'react';

interface CopyableCodeProps {
  code: string;
}

export const CopyableCode = ({ code }: CopyableCodeProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCopy();
    }
  };

  return (
    <code
      role="button"
      tabIndex={0}
      aria-label={`Copy code: ${code}`}
      className={`bg-black/[.05] dark:bg-white/[.06] font-mono font-semibold px-1 py-0.5 rounded cursor-pointer transition-colors relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${
        copied ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100' : 'hover:bg-black/[.1] dark:hover:bg-white/[.1]'
      }`}
      onClick={handleCopy}
      onKeyDown={handleKeyDown}
      title="Click to copy"
    >
      {code}
      {copied && (
        <span
          role="status"
          aria-live="polite"
          className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded shadow-lg animate-in fade-in zoom-in duration-200"
        >
          Copied!
        </span>
      )}
    </code>
  );
};
