import React from 'react';

interface ImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
  [key: string]: unknown;
}

const MockImage = ({ src, alt, priority, 'aria-hidden': ariaHidden, ...props }: ImageProps) => {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} data-priority={priority ? 'true' : undefined} aria-hidden={ariaHidden as boolean | 'true' | 'false' | undefined} {...props} />;
};

export default MockImage;
