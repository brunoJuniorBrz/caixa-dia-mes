import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { subDays, formatISO, format, parseISO } from 'date-fns';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fetchStores,
  fetchUsers,
  fetchCashBoxesByRange,
  fetchFixedExpenses,
  fetchVariableExpenses,
} from '@/features/admin/api';
import type {
  AdminFilters,
  CashBoxWithRelations,
  FixedExpenseRecord,
  VariableExpenseRecord,
} from '@/features/admin/types';
import { fetchServiceTypes } from '@/features/cash-box/api';
import type { ServiceType } from '@/types/database';
import { formatCurrencyFromCents } from '@/features/admin/utils';
import { formatDate } from '@/lib/date';

interface MetricCardProps {
  title: string;
  value: string;
  helper?: string;
}

interface ServiceAggregate {
  id: string;
  name: string;
  code?: string | null;
  quantity: number;
  valueCents: number;
  avgValueCents: number;
}

interface StoreAggregate {
  storeId: string;
  name: string;
  valueCents: number;
  quantity: number;
}

interface ExpenseAggregate {
  id: string;
  name: string;
  totalCents: number;
  occurrences: number;
  storeName?: string;
  monthLabel?: string;
}

interface PeriodPerformance {
  monthKey: string;
  label: string;
  serviceCents: number;
  variableCents: number;
  fixedCents: number;
  netCents: number;
  serviceQuantity: number;
}

function getDefaultDateRange(): { start: string; end: string } {
  const endDate = new Date();
  const startDate = subDays(endDate, 29);
  return {
    start: formatISO(startDate, { representation: 'date' }),
    end: formatISO(endDate, { representation: 'date' }),
  };
}

function parseMonth(value: string): Date {
  if (!value) return new Date();
  const normalized = value.length === 7 ? `${value}-01` : value;
  return parseISO(normalized);
}

function monthKeyFrom(date: string): string {
  return format(parseMonth(date), 'yyyy-MM');
}

function monthLabelFrom(date: string): string {
  return format(parseMonth(date), "MMMM 'de' yyyy");
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesSearchTerm(search: string, ...targets: Array<string | undefined | null>): boolean {
  const normalizedSearch = normalizeText(search).trim();
  if (!normalizedSearch) {
    return true;
  }

  const tokens = normalizedSearch.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  return targets.some((target) => {
    if (!target) return false;
    const normalizedTarget = normalizeText(target);
    return tokens.every((token) => normalizedTarget.includes(token));
  });
}

function MetricCard({ title, value, helper }: MetricCardProps) {
  return (
    <Card className="bg-slate-900 text-slate-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-slate-200">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-2xl font-semibold">{value}</p>
        {helper ? <p className="mt-1 text-xs text-slate-300">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

function ChartFallback({ label }: { label: string }) {
  return (
    <div className="flex h-72 w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function formatChartCurrency(reais: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(reais);
}

const AdminMetrics = () => {
  const navigate = useNavigate();
  const defaultRange = getDefaultDateRange();

  const createInitialFilters = () =>
    ({
      storeId: null,
      vistoriadorId: null,
      startDate: defaultRange.start,
      endDate: defaultRange.end,
    }) satisfies AdminFilters;

  const [filters, setFilters] = useState<AdminFilters>(() => createInitialFilters());
  const [appliedFilters, setAppliedFilters] = useState<AdminFilters>(() => createInitialFilters());
  const [expenseSearch, setExpenseSearch] = useState('');
  const exportRef = useRef<HTMLDivElement>(null);

  const { data: stores = [] } = useQuery({
    queryKey: ['admin-stores'],
    queryFn: fetchStores,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin-metrics-users', filters.storeId],
    queryFn: () => fetchUsers(filters.storeId ?? undefined),
  });

  const { data: serviceCatalog = [] } = useQuery<ServiceType[]>({
    queryKey: ['admin-metrics-service-types'],
    queryFn: fetchServiceTypes,
  });

  const cashBoxesQuery = useQuery<CashBoxWithRelations[]>({
    queryKey: [
      'admin-metrics-cash-boxes',
      appliedFilters.storeId,
      appliedFilters.vistoriadorId,
      appliedFilters.startDate,
      appliedFilters.endDate,
  ],
  queryFn: () => fetchCashBoxesByRange(appliedFilters),
  enabled: Boolean(appliedFilters?.startDate && appliedFilters?.endDate),
});

  const fixedExpensesQuery = useQuery<FixedExpenseRecord[]>({
    queryKey: [
      'admin-metrics-fixed-expenses',
      appliedFilters.storeId,
      appliedFilters.startDate,
      appliedFilters.endDate,
    ],
    queryFn: () =>
      fetchFixedExpenses({
        storeId: appliedFilters?.storeId ?? null,
        startDate: appliedFilters?.startDate ?? '',
        endDate: appliedFilters?.endDate ?? '',
      }),
    enabled: Boolean(appliedFilters?.startDate && appliedFilters?.endDate),
  });

  const variableExpensesQuery = useQuery<VariableExpenseRecord[]>({
    queryKey: [
      'admin-metrics-variable-expenses',
      appliedFilters.storeId,
      appliedFilters.vistoriadorId,
      appliedFilters.startDate,
      appliedFilters.endDate,
    ],
    queryFn: () =>
      fetchVariableExpenses({
        storeId: appliedFilters?.storeId ?? null,
        vistoriadorId: appliedFilters?.vistoriadorId ?? null,
        startDate: appliedFilters?.startDate ?? '',
        endDate: appliedFilters?.endDate ?? '',
      }),
    enabled: Boolean(appliedFilters?.startDate && appliedFilters?.endDate),
  });

  const serviceTypeMap = useMemo(() => {
    const map = new Map<string, ServiceType>();
    serviceCatalog.forEach((service) => {
      map.set(service.id, service);
    });
    return map;
  }, [serviceCatalog]);

  const storeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach((store) => {
      map.set(store.id, store.name);
    });
    return map;
  }, [stores]);

  const metrics = useMemo(() => {
    const boxes = cashBoxesQuery.data ?? [];
    const fixedExpenses = fixedExpensesQuery.data ?? [];
    const variableExpenses = variableExpensesQuery.data ?? [];

    const emptyMetrics = {
      totalQuantity: 0,
      totalValueCents: 0,
      avgTicketCents: 0,
      services: [] as ServiceAggregate[],
      topByQuantity: null as ServiceAggregate | null,
      topByValue: null as ServiceAggregate | null,
      storeRanking: [] as StoreAggregate[],
      variableExpensesTotalCents: 0,
      fixedExpensesTotalCents: 0,
      netResultCents: 0,
      variableExpensesTop: [] as ExpenseAggregate[],
      fixedExpensesTop: [] as ExpenseAggregate[],
      monthlyPerformance: [] as PeriodPerformance[],
      bestPeriod: null as PeriodPerformance | null,
      worstPeriod: null as PeriodPerformance | null,
      topPeriods: [] as PeriodPerformance[],
      bottomPeriods: [] as PeriodPerformance[],
    };

    if (!boxes.length && !fixedExpenses.length && !variableExpenses.length) {
      return emptyMetrics;
    }

    const serviceAggregates = new Map<string, ServiceAggregate>();
    const storeAggregates = new Map<string, StoreAggregate>();
    const monthlyAggregates = new Map<string, PeriodPerformance>();
    const variableAggregateMap = new Map<string, ExpenseAggregate>();
    const fixedAggregateMap = new Map<string, ExpenseAggregate>();

    let totalVariableCents = 0;
    let totalFixedCents = 0;

    const ensureMonthlyAggregate = (monthKey: string, label: string) => {
      const current =
        monthlyAggregates.get(monthKey) ??
        {
          monthKey,
          label,
          serviceCents: 0,
          variableCents: 0,
          fixedCents: 0,
          netCents: 0,
          serviceQuantity: 0,
        };
      monthlyAggregates.set(monthKey, current);
      return current;
    };

    boxes.forEach((box) => {
      const services = box.cash_box_services ?? [];
      const monthKey = monthKeyFrom(box.date);
      const monthLabel = monthLabelFrom(box.date);
      const monthly = ensureMonthlyAggregate(monthKey, monthLabel);

      let boxServiceTotalCents = 0;
      let boxServiceQuantity = 0;

      services.forEach((service) => {
        const quantity = service.quantity ?? 0;
        if (quantity <= 0) return;

        const serviceTypeId =
          service.service_type_id ??
          (service.service_types ? service.service_types.id : null) ??
          service.id;
        const serviceType =
          (service.service_type_id ? serviceTypeMap.get(service.service_type_id) : undefined) ??
          service.service_types ??
          null;

        const name = serviceType?.name ?? serviceType?.code ?? 'Servico';
        const code = serviceType?.code ?? serviceType?.name ?? null;
        const unitPrice =
          service.unit_price_cents ??
          service.total_cents ??
          serviceType?.default_price_cents ??
          0;
        const totalCents = service.total_cents ?? unitPrice * quantity;

        boxServiceTotalCents += totalCents;
        boxServiceQuantity += quantity;

        const aggregate =
          serviceAggregates.get(serviceTypeId) ??
          {
            id: serviceTypeId,
            name,
            code,
            quantity: 0,
            valueCents: 0,
            avgValueCents: 0,
          };

        aggregate.quantity += quantity;
        aggregate.valueCents += totalCents;
        aggregate.avgValueCents =
          aggregate.quantity > 0 ? Math.round(aggregate.valueCents / aggregate.quantity) : 0;

        serviceAggregates.set(serviceTypeId, aggregate);

        if (box.store_id) {
          const currentStore =
            storeAggregates.get(box.store_id) ??
            {
              storeId: box.store_id,
              name: storeNameMap.get(box.store_id) ?? 'Loja',
              valueCents: 0,
              quantity: 0,
            };

          currentStore.valueCents += totalCents;
          currentStore.quantity += quantity;
          storeAggregates.set(box.store_id, currentStore);
        }
      });

      monthly.serviceCents += boxServiceTotalCents;
      monthly.serviceQuantity += boxServiceQuantity;
    });

    variableExpenses.forEach((expense) => {
      const amount = expense.amount_cents ?? 0;
      if (amount <= 0) return;
      totalVariableCents += amount;

      const monthKey = monthKeyFrom(expense.cash_box.date);
      const monthLabel = monthLabelFrom(expense.cash_box.date);
      const monthly = ensureMonthlyAggregate(monthKey, monthLabel);
      monthly.variableCents += amount;

      const key = expense.title.trim() || 'Despesa variavel';
      const storeName = storeNameMap.get(expense.cash_box.store_id) ?? 'Loja';
      const aggregate =
        variableAggregateMap.get(key) ??
        {
          id: key,
          name: key,
          totalCents: 0,
          occurrences: 0,
          storeName,
          monthLabel,
        };

      aggregate.totalCents += amount;
      aggregate.occurrences += 1;
      aggregate.storeName =
        aggregate.storeName && aggregate.storeName !== storeName ? 'Diversas lojas' : storeName;
      aggregate.monthLabel =
        aggregate.monthLabel && aggregate.monthLabel !== monthLabel ? 'Multiplos períodos' : monthLabel;

      variableAggregateMap.set(key, aggregate);
    });

    fixedExpenses.forEach((expense) => {
      const amount = expense.amount_cents ?? 0;
      if (amount <= 0) return;
      totalFixedCents += amount;

      const monthKey = monthKeyFrom(expense.month_year);
      const monthLabel = monthLabelFrom(expense.month_year);
      const monthly = ensureMonthlyAggregate(monthKey, monthLabel);
      monthly.fixedCents += amount;

      const key = expense.title.trim() || 'Despesa fixa';
      const storeName = storeNameMap.get(expense.store_id) ?? 'Loja';
      const aggregate =
        fixedAggregateMap.get(key) ??
        {
          id: key,
          name: key,
          totalCents: 0,
          occurrences: 0,
          storeName,
          monthLabel,
        };

      aggregate.totalCents += amount;
      aggregate.occurrences += 1;
      aggregate.storeName =
        aggregate.storeName && aggregate.storeName !== storeName ? 'Diversas lojas' : storeName;
      aggregate.monthLabel =
        aggregate.monthLabel && aggregate.monthLabel !== monthLabel ? 'Multiplos períodos' : monthLabel;

      fixedAggregateMap.set(key, aggregate);
    });

    const servicesArray = Array.from(serviceAggregates.values()).sort(
      (a, b) => b.valueCents - a.valueCents,
    );
    const storeArray = Array.from(storeAggregates.values()).sort(
      (a, b) => b.valueCents - a.valueCents,
    );

    const totalValueCents = servicesArray.reduce((acc, item) => acc + item.valueCents, 0);
    const totalQuantity = servicesArray.reduce((acc, item) => acc + item.quantity, 0);
    const avgTicketCents = totalQuantity > 0 ? Math.round(totalValueCents / totalQuantity) : 0;

    const topByQuantity = [...servicesArray].sort((a, b) => b.quantity - a.quantity)[0] ?? null;
    const topByValue = servicesArray[0] ?? null;

    const monthlyPerformance = Array.from(monthlyAggregates.values())
      .map((month) => ({
        ...month,
        netCents: month.serviceCents - month.variableCents - month.fixedCents,
      }))
      .sort((a, b) => b.netCents - a.netCents);

    const variableExpensesTop = Array.from(variableAggregateMap.values()).sort(
      (a, b) => b.totalCents - a.totalCents,
    );
    const fixedExpensesTop = Array.from(fixedAggregateMap.values()).sort(
      (a, b) => b.totalCents - a.totalCents,
    );

    const topPeriods = monthlyPerformance.slice(0, Math.min(3, monthlyPerformance.length));
    const bottomPeriods = [...monthlyPerformance]
      .reverse()
      .slice(0, Math.min(3, monthlyPerformance.length));

    const bestPeriod = monthlyPerformance[0] ?? null;
    const worstPeriod =
      monthlyPerformance.length > 0
        ? monthlyPerformance[monthlyPerformance.length - 1]
        : null;

    return {
      totalQuantity,
      totalValueCents,
      avgTicketCents,
      services: servicesArray,
      topByQuantity,
      topByValue,
      storeRanking: storeArray,
      variableExpensesTotalCents: totalVariableCents,
      fixedExpensesTotalCents: totalFixedCents,
      netResultCents: totalValueCents - totalVariableCents - totalFixedCents,
      variableExpensesTop,
      fixedExpensesTop,
      monthlyPerformance,
      bestPeriod,
      worstPeriod,
      topPeriods,
      bottomPeriods,
    };
  }, [
    cashBoxesQuery.data,
    serviceTypeMap,
    storeNameMap,
    fixedExpensesQuery.data,
    variableExpensesQuery.data,
  ]);

  const quantityChartData = useMemo(
    () =>
      metrics.services.slice(0, 12).map((item) => ({
        service: item.code ? `${item.code}` : item.name,
        quantity: item.quantity,
        valueReais: Number((item.valueCents / 100).toFixed(2)),
        valueCents: item.valueCents,
      })),
    [metrics.services],
  );

  const valueChartData = useMemo(
    () =>
      metrics.services.slice(0, 12).map((item) => ({
        service: item.code ? `${item.code}` : item.name,
        value: Number((item.valueCents / 100).toFixed(2)),
        valueCents: item.valueCents,
        quantity: item.quantity,
      })),
    [metrics.services],
  );

  const periodLabel = useMemo(() => {
    if (!appliedFilters?.startDate || !appliedFilters?.endDate) {
      return 'Selecione um período';
    }
    return `${formatDate(appliedFilters.startDate)} a ${formatDate(appliedFilters.endDate)}`;
  }, [appliedFilters]);

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const handleResetFilters = () => {
    const freshFilters = createInitialFilters();
    setFilters(freshFilters);
    setAppliedFilters(freshFilters);
  };

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
    const imageData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imageData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position -= pdfHeight;
      pdf.addPage();
      pdf.addImage(imageData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    const start = appliedFilters.startDate ?? defaultRange.start;
    const end = appliedFilters.endDate ?? defaultRange.end;
    pdf.save(`metricas-${start}-${end}.pdf`);
  };

  const isLoading =
    cashBoxesQuery.isLoading || fixedExpensesQuery.isLoading || variableExpensesQuery.isLoading;

  const hasAnyData =
    metrics.services.length > 0 ||
    metrics.variableExpensesTop.length > 0 ||
    metrics.fixedExpensesTop.length > 0;

  const hasMultiplePeriods = metrics.monthlyPerformance.length > 1;
  const totalExpensesCents = metrics.variableExpensesTotalCents + metrics.fixedExpensesTotalCents;
  const pdfDisabled = isLoading || !hasAnyData;

  const filteredVariableExpenses = useMemo(() => {
    if (!expenseSearch.trim()) {
      return metrics.variableExpensesTop;
    }
    return metrics.variableExpensesTop.filter((expense) =>
      matchesSearchTerm(expenseSearch, expense.name, expense.storeName, expense.monthLabel),
    );
  }, [metrics.variableExpensesTop, expenseSearch]);

  const filteredFixedExpenses = useMemo(() => {
    if (!expenseSearch.trim()) {
      return metrics.fixedExpensesTop;
    }
    return metrics.fixedExpensesTop.filter((expense) =>
      matchesSearchTerm(expenseSearch, expense.name, expense.storeName, expense.monthLabel),
    );
  }, [metrics.fixedExpensesTop, expenseSearch]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => navigate('/admin')}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Inteligência de Serviços</h1>
              <p className="text-sm text-muted-foreground">
                Métricas consolidadas por tipo de serviço. Período: {periodLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleExportPdf}
              disabled={pdfDisabled}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Gerar PDF
            </Button>
          </div>
        </header>

        <div ref={exportRef} className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Filtros do período</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-5">
              <div className="space-y-1">
                <Label>Loja</Label>
                <Select
                  value={filters.storeId ?? 'all'}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      storeId: value === 'all' ? null : value,
                      vistoriadorId: null,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Vistoriador</Label>
                <Select
                  value={filters.vistoriadorId ?? 'all'}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      vistoriadorId: value === 'all' ? null : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Data inicial</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  max={filters.endDate}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Data final</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  min={filters.startDate}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex items-end justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleResetFilters}>
                  Limpar
                </Button>
                <Button type="button" onClick={handleApplyFilters}>
                  Buscar
                </Button>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculando métricas...
            </div>
          ) : !hasAnyData ? (
            <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              Nenhum dado encontrado para o período selecionado.
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Total de serviços"
                  value={metrics.totalQuantity.toLocaleString('pt-BR')}
                  helper="Quantidade total lançada"
                />
                <MetricCard
                  title="Faturamento em serviços"
                  value={formatCurrencyFromCents(metrics.totalValueCents)}
                  helper="Inclui caixas diários e fechamentos"
                />
                <MetricCard
                  title="Ticket médio"
                  value={formatCurrencyFromCents(metrics.avgTicketCents)}
                  helper="Valor médio por serviço"
                />
                <MetricCard
                  title="Serviço destaque"
                  value={
                    metrics.topByValue
                      ? metrics.topByValue.code ?? metrics.topByValue.name
                      : 'Sem dados'
                  }
                  helper={
                    metrics.topByValue
                      ? `${metrics.topByValue.quantity.toLocaleString('pt-BR')} un - ${formatCurrencyFromCents(metrics.topByValue.valueCents)}`
                      : 'Não há serviços registrados'
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  title="Despesas variáveis"
                  value={formatCurrencyFromCents(metrics.variableExpensesTotalCents)}
                  helper={`${metrics.variableExpensesTop.reduce((acc, item) => acc + item.occurrences, 0)} lançamentos no período`}
                />
                <MetricCard
                  title="Despesas fixas"
                  value={formatCurrencyFromCents(metrics.fixedExpensesTotalCents)}
                  helper="Compromissos mensais registrados"
                />
                <MetricCard
                  title="Resultado líquido"
                  value={formatCurrencyFromCents(metrics.netResultCents)}
                  helper="Serviços - despesas variáveis - fixas"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Top serviços por quantidade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {quantityChartData.length === 0 ? (
                      <ChartFallback label="Sem dados suficientes para exibir o gráfico." />
                    ) : (
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={quantityChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="service" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={80} />
                            <YAxis />
                            <Tooltip
                              formatter={(value: number, _, payload) =>
                                payload?.payload
                                  ? [
                                      `${value.toLocaleString('pt-BR')} unidades`,
                                      `${payload.payload.service}`,
                                    ]
                                  : value
                              }
                            />
                            <Legend />
                            <Bar dataKey="quantity" name="Quantidade" fill="#0284c7" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Top serviços por faturamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {valueChartData.length === 0 ? (
                      <ChartFallback label="Sem dados suficientes para exibir o gráfico." />
                    ) : (
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={valueChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="service" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={80} />
                            <YAxis tickFormatter={(value: number) => formatChartCurrency(value)} />
                            <Tooltip
                              formatter={(value: number, _, payload) =>
                                payload?.payload
                                  ? [
                                      formatCurrencyFromCents(payload.payload.valueCents),
                                      `${payload.payload.service}`,
                                    ]
                                  : formatChartCurrency(value)
                              }
                            />
                            <Legend />
                            <Bar dataKey="value" name="Faturamento (R$)" fill="#22c55e" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Ranking de serviços</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Servico</TableHead>
                          <TableHead className="text-right">Quantidade</TableHead>
                          <TableHead className="text-right">Ticket medio</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metrics.services.slice(0, 15).map((service) => (
                          <TableRow key={service.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-900">
                                  {service.code ?? service.name}
                                </span>
                                {service.code && service.code !== service.name ? (
                                  <span className="text-xs text-muted-foreground">{service.name}</span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {service.quantity.toLocaleString('pt-BR')}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrencyFromCents(service.avgValueCents)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrencyFromCents(service.valueCents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Performance por loja</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {metrics.storeRanking.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma loja com serviços no período.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {metrics.storeRanking.slice(0, 10).map((store) => (
                          <li
                            key={store.storeId}
                            className="flex items-center justify-between rounded-md border p-3"
                          >
                            <div>
                              <p className="font-medium text-slate-900">{store.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {store.quantity.toLocaleString('pt-BR')} serviços
                              </p>
                            </div>
                            <span className="font-semibold text-emerald-600">
                              {formatCurrencyFromCents(store.valueCents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col gap-3 rounded-md border border-dashed p-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold text-slate-900">Despesas por nome</h2>
                  <p className="text-sm text-muted-foreground">
                    Filtre despesas fixas e variaveis digitando qualquer trecho do nome, loja ou período.
                  </p>
                </div>
                <div className="w-full md:w-80">
                  <Label className="text-xs uppercase text-muted-foreground">Buscar despesas</Label>
                  <Input
                    value={expenseSearch}
                    placeholder="Ex: desconto, aluguel..."
                    onChange={(event) => setExpenseSearch(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Maiores despesas variaveis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {filteredVariableExpenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {expenseSearch.trim()
                          ? 'Nenhuma despesa variavel encontrada para a pesquisa.'
                          : 'Nenhuma despesa variavel registrada no período.'}
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {filteredVariableExpenses.slice(0, 8).map((expense) => (
                          <li
                            key={expense.id}
                            className="flex items-center justify-between rounded-md border p-3"
                          >
                            <div>
                              <p className="font-medium text-slate-900">{expense.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {expense.occurrences} lançamentos
                                {expense.storeName ? ` - ${expense.storeName}` : ''}
                                {expense.monthLabel ? ` - ${expense.monthLabel}` : ''}
                              </p>
                            </div>
                            <span className="font-semibold text-rose-600">
                              {formatCurrencyFromCents(expense.totalCents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Maiores despesas fixas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {filteredFixedExpenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {expenseSearch.trim()
                          ? 'Nenhuma despesa fixa encontrada para a pesquisa.'
                          : 'Nenhuma despesa fixa registrada no período.'}
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {filteredFixedExpenses.slice(0, 8).map((expense) => (
                          <li
                            key={expense.id}
                            className="flex items-center justify-between rounded-md border p-3"
                          >
                            <div>
                              <p className="font-medium text-slate-900">{expense.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {expense.occurrences} lançamentos
                                {expense.storeName ? ` - ${expense.storeName}` : ''}
                                {expense.monthLabel ? ` - ${expense.monthLabel}` : ''}
                              </p>
                            </div>
                            <span className="font-semibold text-rose-600">
                              {formatCurrencyFromCents(expense.totalCents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Insights por período</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {metrics.monthlyPerformance.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem dados suficientes.</p>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          {metrics.bestPeriod ? (
                            <div className="rounded-md border p-3">
                              <p className="text-xs uppercase text-muted-foreground">Melhor resultado</p>
                              <p className="text-lg font-semibold text-emerald-600">
                                {formatCurrencyFromCents(metrics.bestPeriod.netCents)}
                              </p>
                              <p className="text-sm text-muted-foreground">{metrics.bestPeriod.label}</p>
                            </div>
                          ) : null}
                          {metrics.worstPeriod ? (
                            <div className="rounded-md border p-3">
                              <p className="text-xs uppercase text-muted-foreground">Pior resultado</p>
                              <p className="text-lg font-semibold text-rose-600">
                                {formatCurrencyFromCents(metrics.worstPeriod.netCents)}
                              </p>
                              <p className="text-sm text-muted-foreground">{metrics.worstPeriod.label}</p>
                            </div>
                          ) : null}
                        </div>

                        {hasMultiplePeriods ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs uppercase text-muted-foreground">Melhores meses</p>
                              <ul className="space-y-2">
                                {metrics.topPeriods.slice(0, 3).map((period) => (
                                  <li key={`top-${period.monthKey}`} className="flex items-center justify-between text-sm">
                                    <span>{period.label}</span>
                                    <span className="font-semibold text-emerald-600">
                                      {formatCurrencyFromCents(period.netCents)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="mb-2 text-xs uppercase text-muted-foreground">Piores meses</p>
                              <ul className="space-y-2">
                                {metrics.bottomPeriods.slice(0, 3).map((period) => (
                                  <li key={`bottom-${period.monthKey}`} className="flex items-center justify-between text-sm">
                                    <span>{period.label}</span>
                                    <span className="font-semibold text-rose-600">
                                      {formatCurrencyFromCents(period.netCents)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Resumo financeiro</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center justify-between">
                        <span>Total de serviços</span>
                        <span className="font-semibold text-slate-900">
                          {formatCurrencyFromCents(metrics.totalValueCents)}
                        </span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>Despesas totais</span>
                        <span className="font-semibold text-rose-600">
                          {formatCurrencyFromCents(totalExpensesCents)}
                        </span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>Resultado líquido</span>
                        <span className={`font-semibold ${metrics.netResultCents >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatCurrencyFromCents(metrics.netResultCents)}
                        </span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Performance mensal</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {metrics.monthlyPerformance.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados de meses anteriores.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Periodo</TableHead>
                          <TableHead className="text-right">Serviços</TableHead>
                          <TableHead className="text-right">Variaveis</TableHead>
                          <TableHead className="text-right">Fixas</TableHead>
                          <TableHead className="text-right">Resultado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metrics.monthlyPerformance.map((month) => (
                          <TableRow key={month.monthKey}>
                            <TableCell>{month.label}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrencyFromCents(month.serviceCents)}
                            </TableCell>
                            <TableCell className="text-right text-rose-600">
                              {formatCurrencyFromCents(month.variableCents)}
                            </TableCell>
                            <TableCell className="text-right text-rose-600">
                              {formatCurrencyFromCents(month.fixedCents)}
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${month.netCents >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatCurrencyFromCents(month.netCents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>      </div>
    </div>
  );
};

export default AdminMetrics;







