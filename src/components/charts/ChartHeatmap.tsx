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
  if (max === 0) return '#e2e8f0';
  const ratio = value / max;
  if (ratio === 0) return '#f1f5f9';
  if (ratio < 0.25) return '#dbeafe';
  if (ratio < 0.5) return '#93c5fd';
  if (ratio < 0.75) return '#3b82f6';
  return '#1e40af';
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

  return (
    <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
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
                    {row.data.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className="h-8 w-8 rounded border border-slate-200 text-center text-xs font-semibold p-1"
                        style={{
                          backgroundColor: getColorIntensity(cell.vistorias, maxValue),
                          color: cell.vistorias > maxValue * 0.5 ? 'white' : '#334155',
                        }}
                        title={`${DAYS_OF_WEEK[rowIdx]} ${cell.hora}h — ${cell.vistorias} ${cell.vistorias === 1 ? 'vistoria' : 'vistorias'}`}
                      >
                        {cell.vistorias > 0 ? cell.vistorias : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-600">
          <span>Intensidade:</span>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-slate-200 border border-slate-300" />
            <span>0</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-blue-200 border border-blue-300" />
            <span>Baixa</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-blue-400 border border-blue-500" />
            <span>Média</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-blue-600 border border-blue-700" />
            <span>Alta</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

