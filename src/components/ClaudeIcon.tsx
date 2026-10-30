import React from 'react';

export const ClaudeIcon: React.FC<{ className?: string; size?: number }> = ({ className = "w-6 h-6", size }) => {
  return (
    <div 
      className={`rounded-lg bg-gradient-to-br from-[#d97706] to-[#cc6b49] flex items-center justify-center shadow-md shadow-[#cc6b49]/20 flex-shrink-0 ${className}`}
      style={size ? { width: size, height: size } : undefined}
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-[65%] h-[65%] text-white">
        <path
          d="M12 2.5L14.7 8.5L21.2 11.2L14.7 13.9L12 19.9L9.3 13.9L2.8 11.2L9.3 8.5L12 2.5Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
};
