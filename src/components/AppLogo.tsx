import React from 'react';

interface AppLogoProps {
  className?: string;
  size?: number;
}

export const AppLogo: React.FC<AppLogoProps> = ({ className = 'w-5 h-5', size }) => {
  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <svg
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={sizeStyle}
    >
      <defs>
        <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1E2330"/>
          <stop offset="100%" stop-color="#0E1017"/>
        </linearGradient>

        <linearGradient id="logoBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF8A65" stop-opacity="0.9"/>
          <stop offset="50%" stop-color="#D9643A" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#F59E0B" stop-opacity="0.7"/>
        </linearGradient>

        <linearGradient id="logoFlame" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF9E67"/>
          <stop offset="50%" stop-color="#E0683B"/>
          <stop offset="100%" stop-color="#C24E25"/>
        </linearGradient>

        <linearGradient id="logoAmber" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#F59E0B"/>
          <stop offset="100%" stop-color="#FDE68A"/>
        </linearGradient>
      </defs>

      {/* Rounded Squircle Container */}
      <rect x="40" y="40" width="944" height="944" rx="210" ry="210" fill="url(#logoBgGrad)" />
      <rect x="40" y="40" width="944" height="944" rx="210" ry="210" fill="none" stroke="url(#logoBorderGrad)" stroke-width="16" />

      {/* Terminal Chevron (>) */}
      <path
        d="M 280 340 L 450 512 L 280 684"
        fill="none"
        stroke="url(#logoFlame)"
        stroke-width="64"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      {/* Claude Spark / AI Star (✦) */}
      <path
        d="M 660 270 
           C 660 380, 710 440, 820 480 
           C 710 520, 660 580, 660 690 
           C 660 580, 610 520, 500 480 
           C 610 440, 660 380, 660 270 Z"
        fill="url(#logoFlame)"
      />
      <circle cx="660" cy="480" r="28" fill="#FFF4EE" />

      {/* Terminal Prompt Underline (_) */}
      <line
        x1="330"
        y1="770"
        x2="520"
        y2="770"
        stroke="url(#logoAmber)"
        stroke-width="44"
        stroke-linecap="round"
      />
    </svg>
  );
};

