import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/format';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface DREData {
  totalRevenueCents: number;
  variableExpensesCents: number;
  fixedExpensesCents: number;
  netResultCents: number;
}

interface DREVisualProps {
  data: DREData;
  title?: string;
}

export function DREVisual({ data, title = 'DRE Visual' }: DREVisualProps) {
  const contributionMarginCents = data.totalRevenueCents - data.variableExpensesCents;
  const contributionMarginPct = data.totalRevenueCents > 0 
    ? (contributionMarginCents / data.totalRevenueCents) * 100 
    : 0;
  
  const netMarginPct = data.totalRevenueCents > 0 
    ? (data.netResultCents / data.totalRevenueCents) * 100 
    : 0;

  const breakEvenCents = data.fixedExpensesCents;
  const currentVsBreakEvenPct = breakEvenCents > 0
    ? ((data.totalRevenueCents - breakEvenCents) / breakEvenCents) * 100
    : 0;

  const fixedExpensesVsRevenuePct = data.totalRevenueCents > 0
    ? (data.fixedExpensesCents / data.totalRevenueCents) * 100
    : 0;

  const isPositive = data.netResultCents >= 0;
  const isHealthy = netMarginPct >= 10;
  const isWarning = netMarginPct < 10 && netMarginPct >= 0;
  const isCritical = netMarginPct < 0;

  const getStatusIcon = () => {
    if (isCritical) return <AlertTriangle className="h-5 w-5 text-red-600" />;
    if (isWarning) return <Info className="h-5 w-5 text-amber-600" />;
    return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  };

  const getStatusColor = () => {
    if (isCritical) return 'text-red-600 bg-red-50 border-red-200';
    if (isWarning) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getInsights = () => {
    const insights = [];
    
    if (fixedExpensesVsRevenuePct > 100) {
      insights.push({
        icon: <AlertTriangle className="h-4 w-4" />,
        text: `Custos fixos representam ${fixedExpensesVsRevenuePct.toFixed(0)}% da receita`,
        severity: 'critical' as const,
      });
    }
    
    if (breakEvenCents > 0) {
      insights.push({
        icon: <Info className="h-4 w-4" />,
        text: `Ponto de equilíbrio: ${formatCurrency(breakEvenCents)} de faturamento necessário`,
        severity: 'info' as const,
      });
    }
    
    if (isCritical && fixedExpensesVsRevenuePct > 80) {
      // Calcula a redução necessária: Fixas Atuais - (Receita - Variáveis)
      // Para tornar resultado positivo: Receita - Variáveis - Fixas > 0
      // Logo: Fixas máximas = Receita - Variáveis
      const maxFixedExpenses = data.totalRevenueCents - data.variableExpensesCents;
      const reduction = data.fixedExpensesCents - maxFixedExpenses;
      if (reduction > 0) {
        insights.push({
          icon: <TrendingUp className="h-4 w-4" />,
          text: `Reduzir custos fixos em ${formatCurrency(reduction)} tornaria resultado positivo`,
          severity: 'suggestion' as const,
        });
      }
    }
    
    return insights;
  };

  const insights = getInsights();

  const maxValue = Math.max(
    data.totalRevenueCents,
    data.variableExpensesCents + data.fixedExpensesCents,
    Math.abs(data.netResultCents)
  );

  const getBarWidth = (value: number) => {
    if (maxValue === 0) return '0%';
    return `${Math.min((Math.abs(value) / maxValue) * 100, 100)}%`;
  };

  return (
    <Card className="bg-white border border-slate-200 rounded-md shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-md border ${getStatusColor()}`}>
            {getStatusIcon()}
            <span className="text-sm font-semibold">
              {isCritical ? 'Crítico' : isWarning ? 'Atenção' : 'Saudável'}
            </span>
          </div>
        </div>
        <p className="text-sm text-slate-500">Demonstrativo de Resultado do Exercício</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Receita Bruta</span>
              <span className="font-semibold text-green-700">{formatCurrency(data.totalRevenueCents)}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: getBarWidth(data.totalRevenueCents) }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">(-) Despesas Variáveis</span>
              <span className="font-semibold text-red-600">-{formatCurrency(data.variableExpensesCents)}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-400 rounded-full transition-all duration-500"
                style={{ width: getBarWidth(data.variableExpensesCents) }}
              />
            </div>
          </div>

          <div className="pl-4 py-2 bg-blue-50 border-l-4 border-blue-500 rounded-r-md">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">= Margem de Contribuição</span>
              <span className="font-bold text-blue-700">
                {formatCurrency(contributionMarginCents)} ({contributionMarginPct.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">(-) Despesas Fixas</span>
              <span className="font-semibold text-red-600">-{formatCurrency(data.fixedExpensesCents)}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: getBarWidth(data.fixedExpensesCents) }}
              />
            </div>
          </div>

          <div className={`pl-4 py-3 ${isPositive ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'} border-l-4 rounded-r-md`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPositive ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
                <span className="font-bold text-slate-900">= Resultado Líquido</span>
              </div>
              <span className={`text-lg font-bold ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(data.netResultCents)} ({netMarginPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        {insights.length > 0 && (
          <div className="pt-4 border-t space-y-2">
            <h4 className="text-sm font-semibold text-slate-700">Insights Automáticos</h4>
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 p-2 rounded-md text-sm ${
                  insight.severity === 'critical'
                    ? 'bg-red-50 text-red-700'
                    : insight.severity === 'suggestion'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-slate-50 text-slate-700'
                }`}
              >
                {insight.icon}
                <span>{insight.text}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
