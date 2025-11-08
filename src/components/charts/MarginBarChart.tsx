import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, ReferenceLine, Cell } from 'recharts';
import { formatCurrency } from '@/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MarginDataPoint {
  date: string;
  marginCents: number;
  label: string;
}

interface MarginBarChartProps {
  data: MarginDataPoint[];
  title?: string;
}

export function MarginBarChart({ data, title = 'Margem em Reais por Dia' }: MarginBarChartProps) {
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

  const average = data.reduce((sum, d) => sum + d.marginCents, 0) / data.length;

  const chartData = data.map(item => ({
    ...item,
    marginReais: item.marginCents / 100,
    fill: item.marginCents >= average ? '#10b981' : item.marginCents >= 0 ? '#f59e0b' : '#ef4444',
  }));

  return (
    <Card className="bg-white border border-slate-200 rounded-md shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        <p className="text-sm text-slate-500">
          Média: {formatCurrency(average)}
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                height={40}
              />
              <YAxis
                tickFormatter={(value) => formatCurrency(value)}
                label={{ value: 'Margem (R$)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value * 100), 'Margem']}
                labelFormatter={(label) => `Data: ${label}`}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
              />
              <ReferenceLine 
                y={average / 100} 
                stroke="#64748b" 
                strokeDasharray="5 5"
                label={{ value: 'Média', position: 'right', fill: '#64748b', fontSize: 11 }}
              />
              <Bar
                dataKey="marginReais"
                radius={[4, 4, 0, 0]}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-green-600" />
            <span className="text-slate-600">Acima da média</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-amber-500" />
            <span className="text-slate-600">Abaixo da média</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-500" />
            <span className="text-slate-600">Negativo</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
