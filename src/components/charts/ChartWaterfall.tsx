import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Cell, ReferenceLine, Line, ComposedChart } from 'recharts';
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
      <Card className="bg-white border border-slate-200 rounded-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            {title || `Cascata de Receitas e Custos - ${loja}`}
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
    const isResultado = etapa.nome.toLowerCase().includes('resultado');
    const isFaturamento = etapa.nome.toLowerCase().includes('faturamento') || etapa.nome.toLowerCase().includes('receita');
    
    const start = runningTotal;
    let end = start;
    
    if (isFaturamento) {
      end = etapa.valor;
      runningTotal = etapa.valor;
    } else {
      end = start + etapa.valor;
      runningTotal = end;
    }
    
    const barStart = isPositive ? start : end;
    const barValue = etapa.valor;
    const displayValue = etapa.valor / 100;
    
    return {
      name: etapa.nome,
      start: barStart / 100,
      end: end / 100,
      value: displayValue,
      barValue: barValue / 100,
      connector: end / 100,
      fill: isResultado
        ? isPositive
          ? '#10b981'
          : '#dc2626'
        : isFaturamento
          ? '#3b82f6'
          : '#ef4444',
      isPositive,
      isResultado,
      isFaturamento,
      label: `${isPositive && !isFaturamento ? '+' : ''}${formatCurrency(etapa.valor)}`,
    };
  });

  return (
    <Card className="bg-white border border-slate-200 rounded-md shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">
          {title || `Cascata de Receitas e Custos - ${loja}`}
        </CardTitle>
        <p className="text-sm text-slate-500">Fluxo de receitas até resultado líquido</p>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={waterfallData} margin={{ top: 30, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 10 }} 
                angle={-35}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tickFormatter={(value) => formatCurrency(value * 100)}
                label={{ value: 'Valor (R$)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
              />
              <Tooltip
                formatter={(value: number, name: string, props: any) => {
                  const item = props.payload;
                  if (name === 'connector') return null;
                  return [item.label, item.name];
                }}
                labelFormatter={(label) => `${label}`}
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
              />
              <Bar 
                dataKey="barValue"
                stackId="base"
                radius={[4, 4, 0, 0]}
                label={({ x, y, width, value, index }: any) => {
                  const item = waterfallData[index];
                  const labelY = item.isPositive ? y - 5 : y + 15;
                  return (
                    <text
                      x={x + width / 2}
                      y={labelY}
                      fill={item.fill}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight="600"
                    >
                      {item.label}
                    </text>
                  );
                }}
              >
                {waterfallData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill}
                    stroke={entry.isResultado ? (entry.isPositive ? '#059669' : '#b91c1c') : entry.fill}
                    strokeWidth={entry.isResultado ? 2 : 0}
                  />
                ))}
              </Bar>
              <Line 
                type="step"
                dataKey="connector"
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-blue-600" />
            <span className="text-slate-600">Receita</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-500" />
            <span className="text-slate-600">Custos</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-green-600" />
            <span className="text-slate-600">Resultado Positivo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-600 ring-2 ring-red-900" />
            <span className="text-slate-600">Resultado Negativo</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

