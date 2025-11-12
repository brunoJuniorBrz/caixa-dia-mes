import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Area,
  Bar,
  Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrencyFromCents } from '@/features/admin/utils';

interface TrendPoint {
  label: string;
  monthKey: string;
  serviceCents: number;
  variableCents: number;
  fixedCents: number;
  netCents: number;
}

interface FinancialTrendChartProps {
  data: TrendPoint[];
  title?: string;
}

const currencyTick = (value: number) => formatCurrencyFromCents(Math.round(value * 100));

export function FinancialTrendChart({ data, title = 'Tendência financeira' }: FinancialTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="bg-white border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
            Sem dados suficientes para exibir a tendência.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = [...data]
    .sort((a, b) => (a.monthKey > b.monthKey ? 1 : -1))
    .map((item) => ({
      label: item.label,
      receita: item.serviceCents / 100,
      variavel: item.variableCents / 100,
      fixa: item.fixedCents / 100,
      liquido: item.netCents / 100,
    }));

  return (
    <Card className="bg-white border border-slate-200 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        <p className="text-sm text-slate-500">Compare receita, despesas e resultado mês a mês.</p>
      </CardHeader>
      <CardContent className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 10,
              bottom: 20,
            }}
          >
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis
              tickFormatter={currencyTick}
              tick={{ fontSize: 12 }}
              label={{
                value: 'Valores (R$)',
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: '#475569' },
              }}
            />
            <Tooltip
              formatter={(value: number, name) => [currencyTick(value as number), name]}
              contentStyle={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="receita"
              name="Receita"
              fill="#bae6fd"
              stroke="#0ea5e9"
              strokeWidth={2}
              fillOpacity={0.6}
            />
            <Bar dataKey="variavel" name="Despesa variável" fill="#f97316" opacity={0.85} />
            <Bar dataKey="fixa" name="Despesa fixa" fill="#f43f5e" opacity={0.85} />
            <Line
              type="monotone"
              dataKey="liquido"
              name="Resultado líquido"
              stroke="#16a34a"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
