/**
 * Hero artwork — a flat "verified ledger" composition in brand colors.
 * Cream cards, ink frame, gold accents. Solid fills only, no gradients.
 */
export default function HeroArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 560"
      className={className}
      role="img"
      aria-label="Verified credit ledger illustration"
    >
      {/* ground shadows */}
      <ellipse cx="240" cy="528" rx="170" ry="14" fill="#D8CDB4" />
      <ellipse cx="392" cy="430" rx="62" ry="10" fill="#D8CDB4" />

      {/* gold seal */}
      <circle cx="392" cy="330" r="72" fill="#B3872A" />
      <circle cx="392" cy="330" r="58" fill="none" stroke="#F4EFE5" strokeWidth="3" strokeDasharray="10 8" />
      <path
        d="M392 288 L402 302 L380 331 L402 360 L380 389 L402 418 L392 432"
        fill="none"
        stroke="#151311"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* main ledger card */}
      <rect x="40" y="60" width="300" height="440" rx="14" fill="#FAF7EF" stroke="#151311" strokeWidth="3" />
      <rect x="40" y="60" width="300" height="64" rx="14" fill="#151311" />
      <rect x="40" y="100" width="300" height="24" fill="#151311" />
      <text x="64" y="92" fontSize="15" fill="#F4EFE5" fontFamily="ui-monospace, monospace" letterSpacing="2">
        CREDIT LEDGER
      </text>
      <text x="64" y="113" fontSize="12" fill="#A89C86" fontFamily="ui-monospace, monospace">
        0xBEEF…C0FFEE · ETH MAINNET
      </text>

      {/* score row */}
      <circle cx="120" cy="190" r="42" fill="none" stroke="#D8CDB4" strokeWidth="10" />
      <circle
        cx="120" cy="190" r="42" fill="none" stroke="#B3872A" strokeWidth="10"
        strokeLinecap="round" strokeDasharray="206 264" transform="rotate(-90 120 190)"
      />
      <text x="120" y="197" textAnchor="middle" fontSize="26" fontWeight="700" fill="#151311" fontFamily="ui-monospace, monospace">
        800
      </text>
      <text x="196" y="178" fontSize="15" fontWeight="700" fill="#151311" fontFamily="ui-sans-serif, system-ui">
        Platinum
      </text>
      <text x="196" y="200" fontSize="12" fill="#6E6455" fontFamily="ui-monospace, monospace">
  85% COLLATERAL
  <tspan x="196" dy="1.5em">6% APR</tspan>
</text>
      
       

      {/* entries */}
      {[
        { y: 252, pts: "+32", where: "Aave · $500 USDC", w: 150, c: "#465E54" },
        { y: 312, pts: "+50", where: "Compound · $1,000 USDC", w: 210, c: "#465E54" },
        { y: 372, pts: "−20", where: "Default · $12 USDC", w: 60, c: "#9A6B3F" },
      ].map((r) => (
        <g key={r.y}>
          <text x="64" y={r.y} fontSize="15" fontWeight="700" fill={r.c} fontFamily="ui-monospace, monospace">
            {r.pts}
          </text>
          <text x="118" y={r.y} fontSize="12" fill="#6E6455" fontFamily="ui-monospace, monospace">
            {r.where}
          </text>
          <rect x="64" y={r.y + 10} width={r.w} height="8" rx="4" fill={r.c} opacity="0.85" />
        </g>
      ))}

      {/* verified strip */}
      <rect x="64" y="430" width="252" height="42" rx="8" fill="#151311" />
      <circle cx="88" cy="451" r="9" fill="#B3872A" />
      <path d="M84 451l3 3 5.5-6" fill="none" stroke="#151311" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <text x="106" y="456" fontSize="13" fill="#F4EFE5" fontFamily="ui-monospace, monospace" letterSpacing="1">
        PROOF VERIFIED ×45
      </text>
    </svg>
  );
}
