import React from 'react';

interface AppLogoProps {
  className?: string;
  size?: number;
}

// Inline copy of public/logo.svg (kept in sync by hand): a heading marker leaving a bearing ring through north.
export const AppLogo: React.FC<AppLogoProps> = ({ className = 'w-5 h-5', size }) => (
  <svg
    viewBox="100 100 824 824"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    role="img"
    aria-label="Pilothouse"
  >
    <rect x="100" y="100" width="824" height="824" rx="200" fill="#0B0D10" />
    <rect x="102" y="102" width="820" height="820" rx="198" fill="none" stroke="#FFFFFF" strokeOpacity="0.07" strokeWidth="4" />
    <path d="M575.9 289 A232 232 0 1 1 448.1 289" fill="none" stroke="#E8EDF0" strokeWidth="26" strokeLinecap="round" />
    <path d="M512 296 L616 640 L512 584 L408 640 Z" fill="#C8FF2E" stroke="#C8FF2E" strokeWidth="12" strokeLinejoin="round" />
  </svg>
);
