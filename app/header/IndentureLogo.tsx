type Props = {
  size?: number;
  className?: string;
};

/**
 * Indenture mark — ledger "I" cut into 3 installment bars,
 * gold coin badge = one installment paid.
 * Master vector lives in ./indenture-logo.svg; this component
 * mirrors it for crisp inline use (header, buttons, empty states).
 */
export function IndentureLogo({ size = 32, className }: Props) {
  return (<>
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Indenture logo"
      className={className}
    >
      <defs>
        <linearGradient
          id="indenture-bg"
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#064e3b" />
          <stop offset="0.55" stopColor="#047857" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient
          id="indenture-sheen"
          x1="0"
          y1="0"
          x2="0"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#indenture-bg)" />
      <rect width="64" height="64" rx="15" fill="url(#indenture-sheen)" />
      <rect
        x="1"
        y="1"
        width="62"
        height="62"
        rx="14"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />
      <rect x="14" y="15" width="30" height="8" rx="4" fill="#ffffff" opacity="0.96" />
      <rect x="14" y="27.5" width="20" height="8" rx="4" fill="#ffffff" opacity="0.68" />
      <rect x="14" y="40" width="30" height="8" rx="4" fill="#ffffff" opacity="0.96" />
      <circle cx="44" cy="31.5" r="9.5" fill="#fbbf24" />
      <circle
        cx="44"
        cy="31.5"
        r="9.5"
        fill="none"
        stroke="#064e3b"
        strokeWidth="2"
      />
      <path
        d="M39.5 31.7l3.2 3.2 5.4-6.2"
        fill="none"
        stroke="#064e3b"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    
</>
  );
}

export default IndentureLogo;
