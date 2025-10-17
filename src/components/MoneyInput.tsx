import { Input } from '@/components/ui/input';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';

interface MoneyInputProps extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
}

export function MoneyInput({
  value,
  onChange,
  placeholder = '0,00',
  ...props
}: MoneyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (isFocused) return;
    if (!value) {
      setInputValue('');
      return;
    }

    setInputValue(formatCents(value));
  }, [value, isFocused]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeValue(event.target.value);
    if (sanitized === null) return;

    setInputValue(sanitized);

    const cents = parseCents(sanitized);
    onChange(cents);
  };

  const handleBlur = () => {
    setIsFocused(false);

    if (!inputValue) {
      onChange(0);
      setInputValue('');
      return;
    }

    const cents = parseCents(inputValue);
    onChange(cents);
    setInputValue(formatCents(cents));
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={inputValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      {...props}
    />
  );
}

function sanitizeValue(value: string): string | null {
  const sanitized = value.replace(/[^0-9.,]/g, '');
  if (!/^\d*(?:[.,]\d{0,2})?$/.test(sanitized)) {
    return null;
  }
  return sanitized;
}

function parseCents(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const numeric = Number.parseFloat(normalized);
  if (Number.isNaN(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100);
}

function formatCents(value: number): string {
  return (value / 100).toFixed(2).replace('.', ',');
}
