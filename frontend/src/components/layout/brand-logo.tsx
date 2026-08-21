import Image from "next/image";

type BrandLogoProps = {
  /** Visual height in pixels */
  height?: number;
  className?: string;
  priority?: boolean;
};

/** Saptakoshi Development Bank wordmark from `/public/logo.png`. */
export function BrandLogo({
  height = 40,
  className = "",
  priority = false,
}: BrandLogoProps) {
  // Source asset is 3361×750 (~4.48:1)
  const width = Math.round(height * (3361 / 750));

  return (
    <Image
      src="/logo.png"
      alt="Saptakoshi Development Bank"
      width={width}
      height={height}
      priority={priority}
      className={`h-auto w-auto object-contain ${className}`}
      style={{ height, width: "auto" }}
    />
  );
}
