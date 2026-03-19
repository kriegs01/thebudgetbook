import React from 'react';

type Variant = 'close' | 'remove' | 'open' | 'reopen';

interface IconSquircleButtonProps {
  variant: Variant;
  onClick?: () => void;
  disabled?: boolean;
  'aria-label': string;
  children: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  close: 'border-amber-400/60 text-amber-500 bg-amber-50 hover:bg-amber-100',
  remove: 'border-red-400/60 text-red-500 bg-red-50 hover:bg-red-100',
  open: 'border-slate-300 text-slate-500 bg-white hover:bg-slate-50',
  reopen: 'border-indigo-100 text-indigo-600 bg-indigo-50 hover:bg-indigo-100',
};

export function IconSquircleButton({
  variant,
  onClick,
  disabled,
  children,
  ...rest
}: IconSquircleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-2xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
