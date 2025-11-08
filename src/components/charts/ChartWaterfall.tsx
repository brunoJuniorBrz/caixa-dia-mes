import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Cell, ReferenceLine } from 'recharts';
import { formatCurrency } from '@/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WaterfallEtapa {
  nome: string;
  valor: number;
}

interface ChartWaterfallProps {
  loja: string;
  etapas: WaterfallEtapa[];
  title?: string;
}

export function ChartWaterfall({ loja, etapas, title }: ChartWaterfallProps) {
  if (!etapas || etapas.length === 0) {
    return (
      <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            {title || `Waterfall - ${loja}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-72 w-full items-center justify-center rounded-md border border-dashed text-sm text-slate-500">
            Sem dados suficientes para exibir o gráfico.
          </div>
        </CardContent>
      </Card>
    );
  }

  let runningTotal = 0;
  const waterfallData = etapas.map((etapa, idx) => {
    const isPositive = etapa.valor >= 0;
    const isResultado = etapa.nome === 'Resultado';
    const isFaturamento = etapa.nome === 'Faturamento';
    
    const start = runningTotal;
    let end = start;
    
    if (isFaturamento) {
      end = etapa.valor;
      runningTotal = etapa.valor;
    } else {
      end = start + etapa.valor;
      runningTotal = end;
    }
    
    const height = Math.abs(etapa.valor);
    
    return {
      name: etapa.nome,
      start,
      end,
      value: etapa.valor,
      height,
      fill: isResultado
        ? isPositive
          ? '#22c55e'
          : '#e11d48'
        : isFaturamento
          ? '#0284c7'
          : '#f59e0b',
      isPositive,
      isResultado,
      isFaturamento,
    };
  });

  return (
    <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">
          {title || `Waterfall - ${loja}`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 10 }} 
                angle={-25}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tickFormatter={(value) => formatCurrency(value)}
                label={{ value: 'Valor (R$)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                formatter={(value: number, name: string, props: any) => {
                  const item = props.payload;
                  return [
                    `${formatCurrency(value)} (${item.isPositive ? '+' : ''}${formatCurrency(item.value)})`,
                    item.name,
                  ];
                }}
                labelFormatter={(label) => `Etapa: ${label}`}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
              <Bar 
                dataKey="start" 
                stackId="base"
                fill="transparent"
              >
                {waterfallData.map((entry, index) => (
                  <Cell key={`base-${index}`} fill="transparent" />
                ))}
              </Bar>
              <Bar 
                dataKey="height"
                stackId="base"
                radius={[4, 4, 0, 0]}
              >
                {waterfallData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill}
                    stroke={entry.isResultado ? (entry.isPositive ? '#16a34a' : '#dc2626') : entry.fill}
                    strokeWidth={entry.isResultado ? 2 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-blue-600" />
            <span className="text-slate-600">Faturamento</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-amber-500" />
            <span className="text-slate-600">Despesas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-green-600" />
            <span className="text-slate-600">Resultado Positivo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-600" />
            <span className="text-slate-600">Resultado Negativo</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

