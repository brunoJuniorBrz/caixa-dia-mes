import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export type AlertSeverity = 'warning' | 'danger' | 'info';

export interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  timestamp?: string;
}

interface AlertsListProps {
  alerts: AlertItem[];
  isLoading?: boolean;
  onClick?: (item: AlertItem) => void;
}

const severityConfig: Record<AlertSeverity, { icon: typeof AlertCircle; bgColor: string; textColor: string; borderColor: string }> = {
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
  },
  danger: {
    icon: AlertCircle,
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-700',
    borderColor: 'border-rose-200',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
};

const severityOrder: Record<AlertSeverity, number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

export function AlertsList({ alerts, isLoading = false, onClick }: AlertsListProps) {
  if (isLoading) {
    return (
      <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">Alertas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando alertas...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">Alertas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Nenhum alerta no momento.</p>
        </CardContent>
      </Card>
    );
  }

  const sortedAlerts = [...alerts].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">Alertas</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {sortedAlerts.map((alert) => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;
            const isClickable = Boolean(onClick);

            return (
              <li
                key={alert.id}
                className={`rounded-lg border p-3 ${config.bgColor} ${config.borderColor} ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                onClick={isClickable ? () => onClick?.(alert) : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={isClickable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick?.(alert);
                  }
                } : undefined}
                aria-label={isClickable ? `Alerta: ${alert.title}. Clique para ver detalhes` : undefined}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${config.textColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${config.textColor}`}>{alert.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{alert.message}</p>
                    {alert.timestamp && (
                      <p className="text-xs text-slate-400 mt-1">{alert.timestamp}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

