export default function MKSLogo({ size = 120 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 210"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="MKS Auto Body Parts Logo"
    >
      {/* Hexagonal badge background */}
      <polygon
        points="100,6 194,52 194,158 100,204 6,158 6,52"
        fill="#0d0d0d"
      />
      {/* Outer gold border */}
      <polygon
        points="100,6 194,52 194,158 100,204 6,158 6,52"
        fill="none"
        stroke="#D4920A"
        strokeWidth="8"
      />
      {/* Inner gold border */}
      <polygon
        points="100,19 183,60 183,150 100,191 17,150 17,60"
        fill="none"
        stroke="#D4920A"
        strokeWidth="2"
        opacity="0.55"
      />
      {/* MKS text */}
      <text
        x="100"
        y="93"
        textAnchor="middle"
        fontFamily="Arial Black, Impact, sans-serif"
        fontWeight="900"
        fontSize="56"
        fill="#D4920A"
        letterSpacing="-2"
      >
        MKS
      </text>
      {/* 3 stars */}
      <text x="54"  y="122" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="22" fill="#D4920A">★</text>
      <text x="100" y="122" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="22" fill="#D4920A">★</text>
      <text x="146" y="122" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="22" fill="#D4920A">★</text>
      {/* SINCE */}
      <text
        x="100"
        y="150"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fontSize="12"
        fill="#D4920A"
        letterSpacing="5"
      >
        SINCE
      </text>
      {/* 1980 */}
      <text
        x="100"
        y="170"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fontSize="17"
        fill="#D4920A"
        letterSpacing="3"
      >
        1980
      </text>
    </svg>
  );
}
