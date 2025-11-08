import { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { BadgeDelta } from './BadgeDelta';
import { formatCurrency } from '@/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface KpiCardProps {
  title: string;
  value: number | string;
  deltaPct?: number;
  sparkline?: number[];
  negativeIsBad?: boolean;
  helper?: string;
}

export function KpiCard({ title, value, deltaPct, sparkline, negativeIsBad = false, helper }: KpiCardProps) {
  const isNegative = typeof value === 'number' && value < 0;
  const shouldHighlightNegative = negativeIsBad && isNegative;

  const sparklineData = useMemo(() => {
    if (!sparkline || sparkline.length === 0) return null;
    return sparkline.map((val, idx) => ({ name: idx, value: val }));
  }, [sparkline]);

  const displayValue = typeof value === 'number' ? formatCurrency(value) : value;

  return (
    <Card className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${shouldHighlightNegative ? 'ring-2 ring-rose-200 bg-rose-50/30' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-slate-600">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-2xl font-semibold ${shouldHighlightNegative ? 'text-rose-700' : 'text-slate-900'}`}>
            {displayValue}
          </p>
          {deltaPct !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <BadgeDelta valuePct={deltaPct} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Variação em relação ao período anterior</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
        {sparklineData && sparklineData.length > 0 && (
          <div className="mt-3 h-12 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={shouldHighlightNegative ? '#e11d48' : '#0284c7'}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

