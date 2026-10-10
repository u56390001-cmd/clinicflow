import Image from "next/image";

type ProductFrameProps = {
  src: string;
  alt: string;
  label: string;
  /** Tailwind/CSS classes applied to the frame element (e.g. hero aspect). */
  className?: string;
  /** CSS aspect-ratio value when the frame size should be ratio-driven. */
  aspectRatio?: string;
  /** Fixed height (px) when the frame should be height-driven. */
  height?: number;
  sizes?: string;
  priority?: boolean;
};

/**
 * Browser-chrome product frame from the approved landing page v2. Holds a real
 * product screenshot (`next/image`, fill) inside the mockup's white canvas with
 * its traffic-light header.
 */
export function ProductFrame({
  src,
  alt,
  label,
  className = "",
  aspectRatio,
  height,
  sizes = "100vw",
  priority = false,
}: ProductFrameProps) {
  const style = aspectRatio
    ? { aspectRatio }
    : height
      ? { height: `${height}px` }
      : undefined;

  return (
    <div className={`product-frame ${className}`} style={style}>
      <div className="browser-top" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>{label}</span>
      </div>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover object-top"
      />
    </div>
  );
}