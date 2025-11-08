import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line, ComposedChart } from 'recharts';
import { formatCurrency } from '@/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ParetoItem {
  servico: string;
  receita: number;
  margem: number;
  acumulada_pct: number;
}

interface ChartParetoProps {
  data: ParetoItem[];
  title?: string;
}

export function ChartPareto({ data, title = 'Análise de Pareto' }: ChartParetoProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
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

  const chartData = data.map((item, idx) => ({
    ...item,
    label: item.servico.length > 12 ? `${item.servico.slice(0, 12)}...` : item.servico,
    showLabel: idx < 3,
    margemReais: item.margem / 100,
  }));

  const maxMargem = Math.max(...chartData.map((d) => d.margem), 1);
  const normalizedData = chartData.map((item) => ({
    ...item,
    margemNormalized: (item.margem / maxMargem) * 100,
  }));

  return (
    <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={normalizedData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9 }}
                angle={-35}
                textAnchor="end"
                height={70}
                interval={0}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                label={{ value: 'Margem (R$)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                label={{ value: 'Acumulada (%)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle' } }}
              />
              <Tooltip
                formatter={(value: number, name: string, props: any) => {
                  const item = props.payload;
                  if (name === 'margem') {
                    return [formatCurrency(item.margem), 'Margem (R$)'];
                  }
                  if (name === 'acumulada_pct') {
                    return [`${item.acumulada_pct.toFixed(1)}%`, 'Acumulada (%)'];
                  }
                  return value;
                }}
                labelFormatter={(label) => `Serviço: ${label}`}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
              />
              <Bar
                yAxisId="left"
                dataKey="margem"
                name="Margem (R$)"
                fill="#0284c7"
                radius={[4, 4, 0, 0]}
                label={({ showLabel, margem }: any) =>
                  showLabel
                    ? {
                        position: 'top',
                        formatter: () => formatCurrency(margem),
                        fontSize: 9,
                        fill: '#0284c7',
                      }
                    : null
                }
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="acumulada_pct"
                name="Acumulada (%)"
                stroke="#22c55e"
                strokeWidth={3}
                dot={{ r: 5, fill: '#22c55e' }}
                activeDot={{ r: 7 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

