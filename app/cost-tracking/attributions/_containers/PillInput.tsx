'use client';

import { useState } from 'react';
import { PillInputView } from '../_components/PillInputView';

// =============================================================================
// PROPS
// =============================================================================

type PillInputProps = {
  pills: string[];
  onChange: (pills: string[]) => void;
  placeholder?: string;
};

// =============================================================================
// CONTAINER
// =============================================================================

export function PillInput({ pills, onChange, placeholder }: PillInputProps) {
  const [inputValue, setInputValue] = useState('');

  const addPill = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (pills.some((p) => p.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...pills, trimmed]);
    setInputValue('');
  };

  const removePill = (index: number) => {
    onChange(pills.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      addPill(inputValue);
    }
  };

  return (
    <PillInputView
      pills={pills}
      inputValue={inputValue}
      placeholder={placeholder}
      onInputChange={setInputValue}
      onKeyDown={handleKeyDown}
      onRemovePill={removePill}
    />
  );
}
