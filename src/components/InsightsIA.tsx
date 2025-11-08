import { CheckCircle2, AlertTriangle, Lightbulb, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface InsightAction {
  acao: string;
  impacto_estimado: string;
  dificuldade: 'baixa' | 'media' | 'alta';
}

interface InsightPrevisao {
  resultado_previsto: number;
  confianca: 'baixa' | 'media' | 'alta';
}

export type InsightPriority = 'critical' | 'warning' | 'info' | 'positive';

interface InsightItem {
  id: string;
  text: string;
  priority: InsightPriority;
  action?: string;
}

interface InsightsIAData {
  resumo?: string;
  principais_causas?: string[];
  anomalias?: string[];
  acoes_prioritarias?: InsightAction[];
  previsao_mes?: InsightPrevisao;
  insights?: InsightItem[];
}

interface InsightsIAProps {
  data: InsightsIAData | null;
  onVerDetalhe?: (insight?: InsightItem) => void;
  onCreateTarefa?: (insight?: InsightItem) => void;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

const priorityConfig: Record<InsightPriority, { icon: typeof AlertTriangle; color: string; bgColor: string; borderColor: string; label: string }> = {
  critical: {
    icon: AlertTriangle,
    color: 'text-rose-700',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    label: 'CRÍTICO',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'ATENÇÃO',
  },
  info: {
    icon: Info,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'INFORMATIVO',
  },
  positive: {
    icon: TrendingUp,
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    label: 'POSITIVO',
  },
};

export function InsightsIA({ data, onVerDetalhe, onCreateTarefa }: InsightsIAProps) {
  if (!data) {
    return (
      <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">Insights inteligentes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Carregando insights...</p>
        </CardContent>
      </Card>
    );
  }

  let insights: InsightItem[] = [];

  if (data.insights && data.insights.length > 0) {
    insights = data.insights.slice(0, 5);
  } else {
    if (data.anomalias && data.anomalias.length > 0) {
      data.anomalias.slice(0, 2).forEach((anomalia) => {
        if (insights.length < 5) {
          insights.push({
            id: `anomaly-${insights.length}`,
            text: truncateText(anomalia, 90),
            priority: 'critical',
          });
        }
      });
    }

    if (data.principais_causas && data.principais_causas.length > 0) {
      data.principais_causas.slice(0, 2).forEach((causa) => {
        if (insights.length < 5) {
          insights.push({
            id: `cause-${insights.length}`,
            text: truncateText(causa, 90),
            priority: 'warning',
          });
        }
      });
    }

    if (data.acoes_prioritarias && data.acoes_prioritarias.length > 0) {
      data.acoes_prioritarias.slice(0, 1).forEach((acao) => {
        if (insights.length < 5) {
          insights.push({
            id: `action-${insights.length}`,
            text: truncateText(acao.acao, 90),
            priority: 'info',
            action: acao.acao,
          });
        }
      });
    }

    if (data.resumo && insights.length < 5) {
      insights.push({
        id: 'resumo',
        text: truncateText(data.resumo, 90),
        priority: insights.length === 0 ? 'positive' : 'info',
      });
    }
  }

  const sortedInsights = [...insights].sort((a, b) => {
    const order: Record<InsightPriority, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
    return order[a.priority] - order[b.priority];
  });

  if (sortedInsights.length === 0) {
    return (
      <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">Insights inteligentes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Nenhum insight disponível no momento.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">Insights inteligentes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {sortedInsights.map((insight) => {
            const config = priorityConfig[insight.priority];
            const Icon = config.icon;
            return (
              <li
                key={insight.id}
                className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${config.bgColor} ${config.borderColor}`}
              >
                <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-semibold uppercase ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  <span className="text-slate-700">{insight.text}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onVerDetalhe?.()}
            className="text-xs"
            aria-label="Ver detalhes dos insights"
          >
            Ver detalhe
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCreateTarefa?.()}
            className="text-xs"
            aria-label="Criar tarefa baseada nos insights"
          >
            Criar tarefa
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

