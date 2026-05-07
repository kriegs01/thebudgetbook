import React, { useState, useRef, useEffect } from 'react';

interface PersonAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export const PersonAutocomplete: React.FC<PersonAutocompleteProps> = ({
  value,
  onChange,
  options,
  placeholder,
  required,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) {
      setFilteredOptions(options);
    } else {
      setFilteredOptions(
        options.filter(opt => opt.toLowerCase().includes(value.toLowerCase()))
      );
    }
  }, [value, options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getMonogram = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getColorClass = (name: string) => {
    const colors = [
      'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
      'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
      'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
      'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
      'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
      'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
      'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        required={required}
        className={className || "w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-indigo-500 transition-all"}
        autoComplete="off"
      />
      
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-[100] w-full mt-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden">
          {filteredOptions.map((opt, i) => (
            <div key={i} onMouseDown={(e) => { e.preventDefault(); onChange(opt); setIsOpen(false); }} className="flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors border-b border-gray-50 dark:border-gray-800/50 last:border-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${getColorClass(opt)}`}>{getMonogram(opt)}</div>
              <span className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};