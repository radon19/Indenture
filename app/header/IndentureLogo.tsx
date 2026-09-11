type Props = {
  size?: number;
  className?: string;
};

/**
 * Indenture mark, flat — mirrors /public/indentureLogo.svg.
 * Cream field, ink frame, gold zig-zag. No gradients.
 */
export function IndentureLogo({ size = 32, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role="img"
      aria-label="Indenture logo"
      className={className}
    >
      <rect width="256" height="256" rx="12" fill="#F4EFE5" />
      <rect x="48" y="56" width="160" height="145" rx="8" fill="#151311" />
      <path
        d="M128 56 L141 70 L115 99 L141 128 L115 157 L141 186 L128 201"
        fill="none"
        stroke="#B3872A"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default IndentureLogo;
