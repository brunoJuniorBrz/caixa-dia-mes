import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MarginPercentageDataPoint {
  date: string;
  marginPercentage: number;
  label: string;
  revenueCents: number;
}

interface MarginPercentageChartProps {
  data: MarginPercentageDataPoint[];
  title?: string;
  targetMargin?: number;
}

export function MarginPercentageChart({ 
  data, 
  title = 'Margem Percentual sobre Faturamento',
  targetMargin = 10 
}: MarginPercentageChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="bg-white border border-slate-200 rounded-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-72 w-full items-center justify-center rounded-md border border-dashed text-sm text-slate-500">
            Sem dados suficientes para exibir o gráfico.
          </div>
        </CardContent>
      </Card>
    );
  }

  const average = data.reduce((sum, d) => sum + d.marginPercentage, 0) / data.length;

  return (
    <Card className="bg-white border border-slate-200 rounded-md shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        <p className="text-sm text-slate-500">
          Média: {average.toFixed(1)}% | Meta: {targetMargin}%
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <defs>
                <linearGradient id="marginGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                height={40}
              />
              <YAxis
                domain={[0, 'auto']}
                tickFormatter={(value) => `${value}%`}
                label={{ value: 'Margem (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Margem']}
                labelFormatter={(label) => `Data: ${label}`}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
              />
              <ReferenceLine 
                y={targetMargin} 
                stroke="#10b981" 
                strokeDasharray="5 5"
                label={{ value: `Meta ${targetMargin}%`, position: 'right', fill: '#10b981', fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="marginPercentage"
                stroke="#3b82f6"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#marginGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
