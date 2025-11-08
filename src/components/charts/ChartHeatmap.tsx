import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface HeatmapDataPoint {
  dow: number;
  hora: number;
  vistorias: number;
}

interface ChartHeatmapProps {
  data: HeatmapDataPoint[];
  title?: string;
}

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

function getColorIntensity(value: number, max: number): string {
  if (max === 0) return '#f0f9ff';
  const ratio = value / max;
  if (ratio === 0) return '#f0f9ff';
  if (ratio < 0.2) return '#e0f2fe';
  if (ratio < 0.4) return '#bae6fd';
  if (ratio < 0.6) return '#7dd3fc';
  if (ratio < 0.8) return '#38bdf8';
  return '#0284c7';
}

export function ChartHeatmap({ data, title = 'Heatmap de Vistorias' }: ChartHeatmapProps) {
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

  const maxValue = Math.max(...data.map((d) => d.vistorias), 1);

  const chartData = DAYS_OF_WEEK.map((day, dowIdx) => {
    const dayData: Record<string, number | string> = { day };
    HOURS.forEach((hour) => {
      const point = data.find((d) => d.dow === dowIdx && d.hora === hour);
      dayData[`h${hour}`] = point?.vistorias ?? 0;
    });
    return dayData;
  });

  const bars = HOURS.map((hour) => ({
    dataKey: `h${hour}`,
    name: `${hour}h`,
  }));

  const heatmapGrid = DAYS_OF_WEEK.map((day, dowIdx) => {
    const dayData: Array<{ hora: number; vistorias: number }> = [];
    HOURS.forEach((hour) => {
      const point = data.find((d) => d.dow === dowIdx && d.hora === hour);
      dayData.push({ hora: hour, vistorias: point?.vistorias ?? 0 });
    });
    return { day, data: dayData };
  });

  const topHours = [...data]
    .sort((a, b) => b.vistorias - a.vistorias)
    .slice(0, 3)
    .map(d => `${DAYS_OF_WEEK[d.dow]} ${d.hora}h`);

  return (
    <Card className="bg-white border border-slate-200 rounded-md shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        <p className="text-sm text-slate-500">Quantidade de serviços realizados por horário</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-12 text-left text-xs text-slate-600 font-medium p-1"></th>
                  {HOURS.map((hour) => (
                    <th key={hour} className="text-center text-xs text-slate-600 font-medium p-1">
                      {hour}h
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapGrid.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td className="text-xs text-slate-700 font-medium p-1">{row.day}</td>
                    {row.data.map((cell, cellIdx) => {
                      const isTopHour = topHours.includes(`${DAYS_OF_WEEK[rowIdx]} ${cell.hora}h`);
                      return (
                        <td
                          key={cellIdx}
                          className="h-8 w-8 rounded border border-slate-200 text-center text-xs font-semibold p-1 relative"
                          style={{
                            backgroundColor: getColorIntensity(cell.vistorias, maxValue),
                            color: cell.vistorias > maxValue * 0.6 ? 'white' : '#334155',
                          }}
                          title={`${DAYS_OF_WEEK[rowIdx]} ${cell.hora}h — ${cell.vistorias} ${cell.vistorias === 1 ? 'serviço' : 'serviços'}`}
                        >
                          {cell.vistorias > 0 ? cell.vistorias : ''}
                          {isTopHour && cell.vistorias > 0 && (
                            <span className="absolute top-0 right-0 text-yellow-400" style={{ fontSize: '8px' }}>★</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-center gap-3 text-xs text-slate-600">
            <span className="font-medium">Legenda:</span>
            <div className="flex items-center gap-1">
              <div className="h-3 w-8 rounded bg-gradient-to-r from-sky-100 via-sky-300 to-sky-600 border border-slate-300" />
              <span>Baixo → Alto</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-yellow-400 text-sm">★</span>
              <span>Top 3 horários</span>
            </div>
          </div>
          <div className="text-center text-xs text-slate-500">
            Máximo: {maxValue} serviços
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

