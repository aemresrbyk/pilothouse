import React from 'react';

interface AppLogoProps {
  className?: string;
  size?: number;
}

// Inline copy of public/logo.svg (kept in sync by hand).
export const AppLogo: React.FC<AppLogoProps> = ({ className = 'w-5 h-5', size }) => (
  <svg
    viewBox="100 100 824 824"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    role="img"
    aria-label="Electron"
  >
  <defs>
    <linearGradient id="elBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#1B1F2A"/>
      <stop offset="1" stopColor="#0A0C11"/>
    </linearGradient>
    <linearGradient id="elAccent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#FFA270"/>
      <stop offset="1" stopColor="#D9572B"/>
    </linearGradient>
  </defs>
  {/* macOS-style squircle tile with standard 100px safe margin */}
  <rect x="100" y="100" width="824" height="824" rx="190" fill="url(#elBg)"/>
  <rect x="101.5" y="101.5" width="821" height="821" rx="188.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.08" strokeWidth="3"/>
  {/* single tilted orbit */}
  <ellipse cx="512" cy="512" rx="300" ry="122" transform="rotate(-28 512 512)" fill="none" stroke="url(#elAccent)" strokeWidth="26" strokeOpacity="0.9"/>
  {/* terminal prompt >_ as the nucleus */}
  <path d="M404 420 L496 512 L404 604" fill="none" stroke="#F4F1EA" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round"/>
  <rect x="528" y="580" width="112" height="44" rx="22" fill="#F4F1EA"/>
  {/* the electron */}
  <circle cx="776" cy="371" r="40" fill="url(#elAccent)"/>
  </svg>
);
