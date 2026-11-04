import { useId } from "react";
import { BRAND } from "../../brand";

/** The mark: a leaf whose vein runs back to a node, which is a connected idea growing. */
export function Mark({ size = 28, tile = false, className }: { size?: number; tile?: boolean; className?: string }) {
  const id = useId();
  const leaf = tile ? "var(--n-on-moss)" : "var(--n-moss)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={BRAND.name} className={className}>
      <defs>
        <mask id={id}>
          <rect width="32" height="32" fill="white" />
          <path d="M9.5 22.5 20.5 11.5" stroke="black" strokeWidth="1.7" strokeLinecap="round" />
        </mask>
      </defs>
      {tile && <rect width="32" height="32" rx="9" fill="var(--n-moss)" />}
      <g mask={`url(#${id})`}>
        <path d="M8 24C7 14 14 7 25 7c1 11-6 18-17 17z" fill={leaf} />
      </g>
      <circle cx="8.6" cy="23.4" r="2.3" fill={leaf} />
    </svg>
  );
}

export function Wordmark({ className = "text-[22px]" }: { className?: string }) {
  return <span className={`n-display ${className}`}>{BRAND.name}</span>;
}
