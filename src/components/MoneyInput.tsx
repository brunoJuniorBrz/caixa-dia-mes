import { Input } from '@/components/ui/input';
import { formatCurrency, parseCurrency } from '@/lib/money';
import { useState, useEffect } from 'react';

interface MoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MoneyInput({
  value,
  onChange,
  placeholder = 'R$ 0,00',
  disabled,
  className,
}: MoneyInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    if (value === 0 && displayValue === '') return;
    const formattedValue = formatCurrency(value);
    if (displayValue === formattedValue) return;
    setDisplayValue(formattedValue);
  }, [value, displayValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);

    const cents = parseCurrency(inputValue);
    onChange(cents);
  };

  const handleBlur = () => {
    if (displayValue) {
      setDisplayValue(formatCurrency(parseCurrency(displayValue)));
    }
  };

  return (
    <Input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
