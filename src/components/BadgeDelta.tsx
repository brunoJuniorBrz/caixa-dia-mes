import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { formatPercent } from '@/utils/format';

interface BadgeDeltaProps {
  valuePct: number;
  className?: string;
}

export function BadgeDelta({ valuePct, className = '' }: BadgeDeltaProps) {
  const absValue = Math.abs(valuePct);
  const isPositive = valuePct > 0;
  const isNegative = valuePct < 0;
  const isZero = valuePct === 0;

  let bgColor = 'bg-slate-100';
  let textColor = 'text-slate-700';
  let borderColor = 'border-slate-200';
  let Icon = Minus;

  if (isPositive) {
    bgColor = 'bg-green-50';
    textColor = 'text-green-700';
    borderColor = 'border-green-200';
    Icon = ArrowUp;
  } else if (isNegative) {
    bgColor = 'bg-rose-50';
    textColor = 'text-rose-700';
    borderColor = 'border-rose-200';
    Icon = ArrowDown;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${bgColor} ${textColor} ${borderColor} ${className}`}
      aria-label={`Variação de ${formatPercent(valuePct)} em relação ao período anterior`}
    >
      <Icon className="h-3 w-3" />
      {formatPercent(absValue)}
    </span>
  );
}

