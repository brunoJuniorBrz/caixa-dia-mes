import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { subDays, formatISO, format, parseISO, differenceInDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, Loader2, LogOut, Calendar, BarChart3, DollarSign, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
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
import { useAuth } from '@/hooks/useAuth';
import { KpiCard } from '@/components/KpiCard';
import { InsightsIA } from '@/components/InsightsIA';
import { AlertsList, type AlertItem } from '@/components/AlertsList';
import { ChartWaterfall } from '@/components/charts/ChartWaterfall';
import { ChartHeatmap } from '@/components/charts/ChartHeatmap';
import { MarginBarChart } from '@/components/charts/MarginBarChart';
import { MarginPercentageChart } from '@/components/charts/MarginPercentageChart';
import { DREVisual } from '@/components/DREVisual';
import { DetailModal } from '@/components/DetailModal';
import { formatCurrency, formatPercent } from '@/utils/format';

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

type PeriodPreset = 'hoje' | '7dias' | '30dias' | 'esteMes' | 'mesAnterior';

function getPeriodPreset(preset: PeriodPreset): { start: string; end: string } {
  const today = new Date();
  const now = endOfDay(today);
  
  switch (preset) {
    case 'hoje':
      return {
        start: formatISO(startOfDay(today), { representation: 'date' }),
        end: formatISO(now, { representation: 'date' }),
      };
    case '7dias':
      return {
        start: formatISO(startOfDay(subDays(today, 6)), { representation: 'date' }),
        end: formatISO(now, { representation: 'date' }),
      };
    case '30dias':
      return {
        start: formatISO(startOfDay(subDays(today, 29)), { representation: 'date' }),
        end: formatISO(now, { representation: 'date' }),
      };
    case 'esteMes':
      return {
        start: formatISO(startOfMonth(today), { representation: 'date' }),
        end: formatISO(endOfMonth(today), { representation: 'date' }),
      };
    case 'mesAnterior': {
      const lastMonth = subDays(startOfMonth(today), 1);
      return {
        start: formatISO(startOfMonth(lastMonth), { representation: 'date' }),
        end: formatISO(endOfMonth(lastMonth), { representation: 'date' }),
      };
    }
    default:
      return getDefaultDateRange();
  }
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

function calculateDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function generateSparkline(data: CashBoxWithRelations[], days: number, getValue: (box: CashBoxWithRelations) => number): number[] {
  const endDate = new Date();
  const sparkline: number[] = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const targetDate = subDays(endDate, i);
    const dateStr = formatISO(targetDate, { representation: 'date' });
    const dayBoxes = data.filter((box) => box.date === dateStr);
    const dayValue = dayBoxes.reduce((sum, box) => sum + getValue(box), 0);
    sparkline.push(dayValue);
  }
  
  return sparkline;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userDisplayName = user?.name || user?.email || 'Usuário';
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
  const [detailModal, setDetailModal] = useState<{ type: string; open: boolean }>({ type: '', open: false });

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

  const periodDays = useMemo(() => {
    if (!appliedFilters?.startDate || !appliedFilters?.endDate) return 0;
    return differenceInDays(parseISO(appliedFilters.endDate), parseISO(appliedFilters.startDate)) + 1;
  }, [appliedFilters]);

  const previousPeriodFilters = useMemo(() => {
    if (!appliedFilters?.startDate || !appliedFilters?.endDate) return null;
    const start = parseISO(appliedFilters.startDate);
    const end = parseISO(appliedFilters.endDate);
    const days = differenceInDays(end, start) + 1;
    const prevEnd = subDays(start, 1);
    const prevStart = subDays(prevEnd, days - 1);
    return {
      ...appliedFilters,
      startDate: formatISO(prevStart, { representation: 'date' }),
      endDate: formatISO(prevEnd, { representation: 'date' }),
    };
  }, [appliedFilters]);

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

  const previousCashBoxesQuery = useQuery<CashBoxWithRelations[]>({
    queryKey: [
      'admin-metrics-cash-boxes-prev',
      previousPeriodFilters?.storeId,
      previousPeriodFilters?.vistoriadorId,
      previousPeriodFilters?.startDate,
      previousPeriodFilters?.endDate,
    ],
    queryFn: () => fetchCashBoxesByRange(previousPeriodFilters!),
    enabled: Boolean(previousPeriodFilters && appliedFilters?.startDate && appliedFilters?.endDate),
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

    // Separa fechamentos mensais dos caixas diários
    const monthlyClosures = boxes.filter(
      (box) => box.note && box.note.startsWith('Fechamento manual'),
    );
    const dailyBoxes = boxes.filter(
      (box) => !box.note || !box.note.startsWith('Fechamento manual'),
    );

    // Mapa de meses que têm fechamento mensal (para ignorar caixas diários desses meses)
    const monthsWithClosure = new Set<string>();
    monthlyClosures.forEach((closure) => {
      const monthKey = monthKeyFrom(closure.date);
      monthsWithClosure.add(monthKey);
    });

    // Filtra caixas diários: remove os que são de meses que têm fechamento
    const boxesToProcess = dailyBoxes.filter((box) => {
      const monthKey = monthKeyFrom(box.date);
      return !monthsWithClosure.has(monthKey);
    });

    // Combina fechamentos mensais com caixas diários (apenas dos meses sem fechamento)
    const allBoxes = [...monthlyClosures, ...boxesToProcess];

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

    allBoxes.forEach((box) => {
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

        // Verifica se o serviço conta no faturamento (counts_in_gross)
        const countsInGross = serviceType?.counts_in_gross ?? true;

        // Só soma no faturamento se counts_in_gross for true
        if (countsInGross) {
          boxServiceTotalCents += totalCents;
        }
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

    // Filtra despesas variáveis: se o mês tem fechamento, só conta despesas do fechamento
    const variableExpensesToProcess = variableExpenses.filter((expense) => {
      const monthKey = monthKeyFrom(expense.cash_box.date);
      const hasClosure = monthsWithClosure.has(monthKey);
      if (!hasClosure) return true; // Sem fechamento, conta todas as despesas
      
      // Com fechamento, só conta despesas que vêm do fechamento (caixa com note "Fechamento manual")
      return expense.cash_box.note && expense.cash_box.note.startsWith('Fechamento manual');
    });

    variableExpensesToProcess.forEach((expense) => {
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

    // Calcula totalValueCents somando apenas os serviços que contam no faturamento (counts_in_gross = true)
    // Isso é feito somando os monthly.serviceCents que já foram calculados corretamente
    const totalValueCents = Array.from(monthlyAggregates.values()).reduce(
      (acc, month) => acc + month.serviceCents,
      0,
    );
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

  const handlePeriodPreset = (preset: PeriodPreset) => {
    const range = getPeriodPreset(preset);
    const newFilters = {
      ...filters,
      startDate: range.start,
      endDate: range.end,
    };
    setFilters(newFilters);
    setAppliedFilters(newFilters);
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

  const previousMetrics = useMemo(() => {
    const boxes = previousCashBoxesQuery.data ?? [];
    const totalValueCents = boxes.reduce((sum, box) => {
      const services = box.cash_box_services ?? [];
      return sum + services.reduce((s, svc) => {
        // Verifica se o serviço conta no faturamento (counts_in_gross)
        const countsInGross = svc.service_types?.counts_in_gross ?? true;
        if (!countsInGross) return s;
        return s + (svc.total_cents ?? 0);
      }, 0);
    }, 0);
    const totalQuantity = boxes.reduce((sum, box) => {
      const services = box.cash_box_services ?? [];
      return sum + services.reduce((s, svc) => s + (svc.quantity ?? 0), 0);
    }, 0);
    const avgTicketCents = totalQuantity > 0 ? Math.round(totalValueCents / totalQuantity) : 0;
    const variableCents = boxes.reduce((sum, box) => {
      const expenses = box.cash_box_expenses ?? [];
      return sum + expenses.reduce((s, exp) => s + (exp.amount_cents ?? 0), 0);
    }, 0);
    return { totalValueCents, totalQuantity, avgTicketCents, variableCents, netResultCents: totalValueCents - variableCents };
  }, [previousCashBoxesQuery.data]);

  const kpiDeltas = useMemo(() => {
    return {
      servicos_pct: calculateDelta(metrics.totalQuantity, previousMetrics.totalQuantity),
      faturamento_pct: calculateDelta(metrics.totalValueCents, previousMetrics.totalValueCents),
      ticketMedio_pct: calculateDelta(metrics.avgTicketCents, previousMetrics.avgTicketCents),
      variaveis_pct: calculateDelta(metrics.variableExpensesTotalCents, previousMetrics.variableCents),
      fixas_pct: 0,
      resultado_pct: calculateDelta(metrics.netResultCents, previousMetrics.netResultCents),
    };
  }, [metrics, previousMetrics]);

  const sparklines = useMemo(() => {
    const boxes = cashBoxesQuery.data ?? [];
    return {
      faturamento7d: generateSparkline(boxes, 7, (box) => {
        const services = box.cash_box_services ?? [];
        return services.reduce((sum, svc) => {
          // Verifica se o serviço conta no faturamento (counts_in_gross)
          const countsInGross = svc.service_types?.counts_in_gross ?? true;
          if (!countsInGross) return sum;
          return sum + (svc.total_cents ?? (svc.unit_price_cents ?? 0) * (svc.quantity ?? 0));
        }, 0);
      }),
      ticket7d: generateSparkline(boxes, 7, (box) => {
        const services = box.cash_box_services ?? [];
        const total = services.reduce((sum, svc) => {
          // Verifica se o serviço conta no faturamento (counts_in_gross)
          const countsInGross = svc.service_types?.counts_in_gross ?? true;
          if (!countsInGross) return sum;
          return sum + (svc.total_cents ?? (svc.unit_price_cents ?? 0) * (svc.quantity ?? 0));
        }, 0);
        const qty = services.reduce((sum, svc) => sum + (svc.quantity ?? 0), 0);
        return qty > 0 ? Math.round(total / qty) : 0;
      }),
      resultado7d: generateSparkline(boxes, 7, (box) => {
        const services = box.cash_box_services ?? [];
        const expenses = box.cash_box_expenses ?? [];
        const revenue = services.reduce((sum, svc) => {
          // Verifica se o serviço conta no faturamento (counts_in_gross)
          const countsInGross = svc.service_types?.counts_in_gross ?? true;
          if (!countsInGross) return sum;
          return sum + (svc.total_cents ?? (svc.unit_price_cents ?? 0) * (svc.quantity ?? 0));
        }, 0);
        const exp = expenses.reduce((sum, exp) => sum + (exp.amount_cents ?? 0), 0);
        return revenue - exp;
      }),
    };
  }, [cashBoxesQuery.data]);

  const marginChartData = useMemo(() => {
    const boxes = cashBoxesQuery.data ?? [];
    if (!appliedFilters.startDate || !appliedFilters.endDate || boxes.length === 0) {
      return [];
    }

    const endDate = parseISO(appliedFilters.endDate);
    const startDate = parseISO(appliedFilters.startDate);
    const dayData: Array<{ date: string; marginCents: number; label: string; revenueCents: number }> = [];

    let currentDate = startDate;
    while (currentDate <= endDate) {
      const dateStr = formatISO(currentDate, { representation: 'date' });
      const dayBoxes = boxes.filter(box => box.date === dateStr);
      
      const dayRevenueCents = dayBoxes.reduce((sum, box) => {
        const services = box.cash_box_services ?? [];
        return sum + services.reduce((s, svc) => {
          // Verifica se o serviço conta no faturamento (counts_in_gross)
          const countsInGross = svc.service_types?.counts_in_gross ?? true;
          if (!countsInGross) return s;
          return s + (svc.total_cents ?? (svc.unit_price_cents ?? 0) * (svc.quantity ?? 0));
        }, 0);
      }, 0);

      const dayVariableCents = dayBoxes.reduce((sum, box) => {
        const expenses = box.cash_box_expenses ?? [];
        return sum + expenses.reduce((s, exp) => s + (exp.amount_cents ?? 0), 0);
      }, 0);

      const dayMarginCents = dayRevenueCents - dayVariableCents;

      dayData.push({
        date: dateStr,
        marginCents: dayMarginCents,
        label: format(currentDate, 'dd/MM'),
        revenueCents: dayRevenueCents,
      });

      currentDate = new Date(currentDate.getTime() + 86400000);
    }

    return dayData.map(item => ({
      ...item,
      marginPercentage: item.revenueCents > 0 ? 
        ((item.marginCents / item.revenueCents) * 100) : 0,
    }));
  }, [cashBoxesQuery.data, appliedFilters]);

  const waterfallData = useMemo(() => {
    if (metrics.storeRanking.length === 0 && metrics.totalValueCents === 0) return null;
    const storeName = metrics.storeRanking.length > 0 ? metrics.storeRanking[0].name : 'Consolidado';
    return {
      loja: storeName,
      etapas: [
        { nome: 'Faturamento', valor: metrics.totalValueCents },
        { nome: 'Variáveis', valor: -metrics.variableExpensesTotalCents },
        { nome: 'Fixas', valor: -metrics.fixedExpensesTotalCents },
        { nome: 'Resultado', valor: metrics.netResultCents },
      ],
    };
  }, [metrics]);

  const heatmapData = useMemo(() => {
    const boxes = cashBoxesQuery.data ?? [];
    const heatmap: Record<string, number> = {};
    boxes.forEach((box) => {
      const date = parseISO(box.date);
      const dow = date.getDay();
      const hora = date.getHours();
      const key = `${dow}-${hora}`;
      const services = box.cash_box_services ?? [];
      const count = services.reduce((sum, svc) => sum + (svc.quantity ?? 0), 0);
      heatmap[key] = (heatmap[key] ?? 0) + count;
    });
    return Object.entries(heatmap).map(([key, vistorias]) => {
      const [dow, hora] = key.split('-').map(Number);
      return { dow, hora, vistorias };
    });
  }, [cashBoxesQuery.data]);

  const rankingMargem = useMemo(() => {
    return metrics.services
      .slice(0, 10)
      .map((service) => ({
        servico: service.code ?? service.name,
        margem: service.valueCents,
        margem_pct: metrics.totalValueCents > 0 ? (service.valueCents / metrics.totalValueCents) * 100 : 0,
        deltaMM_pct: 0,
      }));
  }, [metrics.services, metrics.totalValueCents]);

  const insightsData = useMemo(() => {
    const isNegative = metrics.netResultCents < 0;
    const isLowTicket = metrics.avgTicketCents < 5000;
    const hasHighExpenses = metrics.variableExpensesTotalCents > metrics.totalValueCents * 0.3;
    const marginPct = metrics.totalValueCents > 0 
      ? (metrics.netResultCents / metrics.totalValueCents) * 100 
      : 0;
    const isLowMargin = marginPct < 5 && marginPct >= 0;
    const isGoodMargin = marginPct >= 10;
    const ticketDelta = kpiDeltas.ticketMedio_pct;
    
    const insights: Array<{ id: string; text: string; priority: 'critical' | 'warning' | 'info' | 'positive' }> = [];
    
    if (isNegative) {
      insights.push({
        id: 'negative-result',
        text: `Resultado líquido negativo de ${formatCurrency(metrics.netResultCents / 100)}. Revise despesas e receitas.`,
        priority: 'critical',
      });
    }
    
    if (hasHighExpenses) {
      const expensePct = metrics.totalValueCents > 0 
        ? (metrics.variableExpensesTotalCents / metrics.totalValueCents) * 100 
        : 0;
      insights.push({
        id: 'high-expenses',
        text: `Despesas variáveis representam ${expensePct.toFixed(1)}% do faturamento (acima de 30%).`,
        priority: 'warning',
      });
    }
    
    if (isLowTicket && metrics.totalQuantity > 0) {
      insights.push({
        id: 'low-ticket',
        text: `Ticket médio de ${formatCurrency(metrics.avgTicketCents / 100)} abaixo do esperado.`,
        priority: 'warning',
      });
    }
    
    if (isLowMargin && !isNegative) {
      insights.push({
        id: 'low-margin',
        text: `Margem líquida de ${marginPct.toFixed(1)}% está abaixo do ideal (5%).`,
        priority: 'warning',
      });
    }
    
    if (ticketDelta > 10) {
      insights.push({
        id: 'ticket-increase',
        text: `Ticket médio aumentou ${ticketDelta.toFixed(1)}% vs período anterior. Estratégia funcionando.`,
        priority: 'positive',
      });
    }
    
    if (isGoodMargin && !isNegative) {
      insights.push({
        id: 'good-margin',
        text: `Margem líquida de ${marginPct.toFixed(1)}% está acima de 10%. Performance excelente.`,
        priority: 'positive',
      });
    }
    
    return {
      insights: insights.slice(0, 5),
      resumo: isNegative
        ? 'Resultado negativo detectado. Revise despesas e receitas.'
        : 'Performance estável. Continue monitorando.',
      principais_causas: [
        isLowTicket ? 'Ticket médio abaixo do esperado' : '',
        hasHighExpenses ? 'Despesas variáveis acima de 30% do faturamento' : '',
      ].filter(Boolean),
      anomalias: isNegative ? ['Resultado líquido negativo no período'] : [],
      acoes_prioritarias: isNegative
        ? [
            {
              acao: 'Revisar despesas variáveis',
              impacto_estimado: 'Alto',
              dificuldade: 'baixa' as const,
            },
          ]
        : [],
    };
  }, [metrics, kpiDeltas]);

  const alerts: AlertItem[] = useMemo(() => {
    const items: AlertItem[] = [];
    if (metrics.netResultCents < 0) {
      items.push({
        id: 'negative-result',
        title: 'Resultado negativo',
        message: `Resultado líquido de ${formatCurrency(metrics.netResultCents)} no período.`,
        severity: 'danger',
      });
    }
    if (metrics.variableExpensesTotalCents > metrics.totalValueCents * 0.3) {
      items.push({
        id: 'high-expenses',
        title: 'Despesas elevadas',
        message: 'Despesas variáveis acima de 30% do faturamento.',
        severity: 'warning',
      });
    }
    if (metrics.avgTicketCents < 5000 && metrics.totalQuantity > 0) {
      items.push({
        id: 'low-ticket',
        title: 'Ticket médio baixo',
        message: `Ticket médio de ${formatCurrency(metrics.avgTicketCents)} abaixo do esperado.`,
        severity: 'warning',
      });
    }
    return items;
  }, [metrics]);

  const isLoading =
    cashBoxesQuery.isLoading || fixedExpensesQuery.isLoading || variableExpensesQuery.isLoading;

  const hasAnyData =
    metrics.services.length > 0 ||
    metrics.variableExpensesTop.length > 0 ||
    metrics.fixedExpensesTop.length > 0;

  const hasMultiplePeriods = metrics.monthlyPerformance.length > 1;
  const totalExpensesCents = metrics.variableExpensesTotalCents + metrics.fixedExpensesTotalCents;
  const pdfDisabled = isLoading || !hasAnyData;
  const temVariasLojas = metrics.storeRanking.length > 1;

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

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 md:px-6 md:py-5">
        <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 p-2 shadow-sm">
          <img src="/logo.png" alt="TOP Vistorias" className="h-8 w-8 object-contain" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">TOP Vistorias</p>
          <p className="text-xs text-slate-500">Administração</p>
        </div>
      </div>

      <div className="border-b border-slate-200 px-4 py-3 md:px-6 md:py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Usuário</p>
        <p className="mt-1 text-sm font-medium text-slate-900">{userDisplayName}</p>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4 md:px-3">
        <button
          onClick={() => {
            navigate('/admin');
            if (isMobile) setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200"
        >
          <BarChart3 className="h-5 w-5" />
          Dashboard
        </button>
        <button
          onClick={() => {
            navigate('/admin/historico');
            if (isMobile) setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          <BarChart3 className="h-5 w-5" />
          Histórico
        </button>
        <button
          onClick={() => {
            navigate('/admin/fechamento');
            if (isMobile) setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          <Calendar className="h-5 w-5" />
          Fechamento Mensal
        </button>
        <button
          onClick={() => {
            navigate('/admin/receber');
            if (isMobile) setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          <DollarSign className="h-5 w-5" />
          A Receber
        </button>
      </nav>

      <div className="border-t border-slate-200 p-2 md:p-3">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 bg-white">
        <SidebarContent />
      </aside>

      {/* Sidebar Mobile */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-full flex-col bg-white">
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Mobile Menu Button - Sticky */}
        <div className="sticky top-0 z-50 md:hidden bg-[#f5f5f7] border-b border-slate-200 px-4 py-3">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>
        </div>
        <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Dashboard Administrativo</h1>
              <p className="mt-1 text-sm text-slate-600">
                Métricas consolidadas por tipo de serviço. Período: {periodLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePeriodPreset('hoje')}
                  className="text-xs h-8"
                >
                  Hoje
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePeriodPreset('7dias')}
                  className="text-xs h-8"
                >
                  7 dias
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePeriodPreset('30dias')}
                  className="text-xs h-8"
                >
                  30 dias
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePeriodPreset('esteMes')}
                  className="text-xs h-8"
                >
                  Este mês
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePeriodPreset('mesAnterior')}
                  className="text-xs h-8"
                >
                  Mês anterior
                </Button>
              </div>
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
          </div>

        <div ref={exportRef} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
              <CardTitle>Filtros do período</CardTitle>
          </CardHeader>
            <CardContent className="grid gap-4 grid-cols-1 md:grid-cols-5">
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
                  Aplicar
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
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  title="Total de serviços"
                  value={metrics.totalQuantity.toLocaleString('pt-BR')}
                  deltaPct={kpiDeltas.servicos_pct}
                  helper="Quantidade total lançada"
                />
                <KpiCard
                  title="Faturamento em serviços"
                  value={metrics.totalValueCents / 100}
                  deltaPct={kpiDeltas.faturamento_pct}
                  sparkline={sparklines.faturamento7d.map((v) => v / 100)}
                  helper="Inclui caixas diários e fechamentos"
                />
                <KpiCard
                  title="Ticket médio"
                  value={metrics.avgTicketCents / 100}
                  deltaPct={kpiDeltas.ticketMedio_pct}
                  sparkline={sparklines.ticket7d.map((v) => v / 100)}
                  helper="Valor médio por serviço"
                />
                <KpiCard
                  title="Serviço destaque"
                  value={
                    metrics.topByValue
                      ? `${metrics.topByValue.code ?? metrics.topByValue.name}`
                      : 'Sem dados'
                  }
                  helper={
                    metrics.topByValue
                      ? `${metrics.topByValue.quantity.toLocaleString('pt-BR')} un - ${formatCurrencyFromCents(metrics.topByValue.valueCents)}`
                      : 'Não há serviços registrados'
                  }
                />
              </div>

              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                <div
                  className="cursor-pointer transition-transform hover:scale-[1.02]"
                  onClick={() => setDetailModal({ type: 'variable-expenses', open: true })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setDetailModal({ type: 'variable-expenses', open: true });
                    }
                  }}
                  aria-label="Ver detalhes das despesas variáveis"
                >
                  <KpiCard
                    title="Despesas variáveis"
                    value={metrics.variableExpensesTotalCents / 100}
                    deltaPct={kpiDeltas.variaveis_pct}
                    helper={
                      metrics.totalValueCents > 0
                        ? `${((metrics.variableExpensesTotalCents / metrics.totalValueCents) * 100).toFixed(1)}% do faturamento • ${metrics.variableExpensesTop.reduce((acc, item) => acc + item.occurrences, 0)} lançamentos • Clique para detalhes`
                        : `${metrics.variableExpensesTop.reduce((acc, item) => acc + item.occurrences, 0)} lançamentos no período • Clique para detalhes`
                    }
                  />
                </div>
                <div
                  className="cursor-pointer transition-transform hover:scale-[1.02]"
                  onClick={() => setDetailModal({ type: 'fixed-expenses', open: true })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setDetailModal({ type: 'fixed-expenses', open: true });
                    }
                  }}
                  aria-label="Ver detalhes das despesas fixas"
                >
                  <KpiCard
                    title="Despesas fixas"
                    value={metrics.fixedExpensesTotalCents / 100}
                    deltaPct={kpiDeltas.fixas_pct}
                    helper={
                      metrics.totalValueCents > 0
                        ? `${((metrics.fixedExpensesTotalCents / metrics.totalValueCents) * 100).toFixed(1)}% do faturamento • Compromissos mensais • Clique para detalhes`
                        : 'Compromissos mensais registrados • Clique para detalhes'
                    }
                  />
                </div>
                <div
                  className="cursor-pointer transition-transform hover:scale-[1.02]"
                  onClick={() => setDetailModal({ type: 'net-result', open: true })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setDetailModal({ type: 'net-result', open: true });
                    }
                  }}
                  aria-label="Ver detalhes do resultado líquido"
                >
                  <KpiCard
                    title="Resultado líquido"
                    value={metrics.netResultCents / 100}
                    deltaPct={kpiDeltas.resultado_pct}
                    sparkline={sparklines.resultado7d.map((v) => v / 100)}
                    negativeIsBad={true}
                    helper={
                      metrics.totalValueCents > 0
                        ? `Margem: ${((metrics.netResultCents / metrics.totalValueCents) * 100).toFixed(1)}% • Serviços - Despesas • Clique para detalhes`
                        : 'Serviços - despesas variáveis - fixas • Clique para detalhes'
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <InsightsIA data={insightsData} onVerDetalhe={() => {}} onCreateTarefa={() => {}} />
                <AlertsList alerts={alerts} isLoading={isLoading} onClick={(alert) => console.log('Alert clicked:', alert)} />
              </div>

              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <DREVisual 
                  data={{
                    totalRevenueCents: metrics.totalValueCents,
                    variableExpensesCents: metrics.variableExpensesTotalCents,
                    fixedExpensesCents: metrics.fixedExpensesTotalCents,
                    netResultCents: metrics.netResultCents,
                  }}
                  title="DRE Visual - Fluxo Financeiro"
                />
                {waterfallData && (
                  <ChartWaterfall 
                    loja={waterfallData.loja} 
                    etapas={waterfallData.etapas}
                    title="Cascata de Receitas e Custos" 
                  />
                )}
              </div>

              {marginChartData.length > 0 && (
                <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                  <MarginBarChart 
                    data={marginChartData}
                    title="Margem em Reais por Dia"
                  />
                  <MarginPercentageChart 
                    data={marginChartData}
                    title="Margem Percentual sobre Faturamento"
                  />
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-1">
                <ChartHeatmap data={heatmapData} title="Mapa de Calor: Volume de Vendas por Horário" />
              </div>

              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <Card>
                  <CardHeader>
                    <CardTitle>Ranking de serviços</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
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
                  </div>
                </CardContent>
              </Card>

              {temVariasLojas ? (
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
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Top serviços por margem</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {rankingMargem.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum serviço registrado no período.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {rankingMargem.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-center justify-between rounded-md border p-3"
                          >
                            <div>
                              <p className="font-medium text-slate-900">{item.servico}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatPercent(item.margem_pct)} do faturamento
                              </p>
                            </div>
                            <span className="font-semibold text-emerald-600">
                              {formatCurrency(item.margem / 100)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}
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

              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
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

              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Insights por período</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {metrics.monthlyPerformance.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem dados suficientes.</p>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
                          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
                <CardContent>
                  <div className="overflow-x-auto">
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
                  </div>
                </CardContent>
              </Card>
            </>
          )}
          </div>
          </div>
      </main>

      <DetailModal
        open={detailModal.open && detailModal.type === 'variable-expenses'}
        onOpenChange={(open) => setDetailModal({ type: 'variable-expenses', open })}
        title="Detalhamento de Despesas Variáveis"
        description={`Total: ${formatCurrency(metrics.variableExpensesTotalCents / 100)} • ${metrics.variableExpensesTop.reduce((acc, item) => acc + item.occurrences, 0)} lançamentos`}
      >
        <div className="space-y-3">
          {metrics.variableExpensesTop.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma despesa variável registrada no período.</p>
          ) : (
            <div className="space-y-2">
              {metrics.variableExpensesTop.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-medium text-slate-900">{expense.name}</p>
                    <p className="text-xs text-slate-500">
                      {expense.occurrences} lançamentos
                      {expense.storeName ? ` • ${expense.storeName}` : ''}
                      {expense.monthLabel ? ` • ${expense.monthLabel}` : ''}
                    </p>
                  </div>
                  <span className="font-semibold text-rose-600">
                    {formatCurrencyFromCents(expense.totalCents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DetailModal>

      <DetailModal
        open={detailModal.open && detailModal.type === 'fixed-expenses'}
        onOpenChange={(open) => setDetailModal({ type: 'fixed-expenses', open })}
        title="Detalhamento de Despesas Fixas"
        description={`Total: ${formatCurrency(metrics.fixedExpensesTotalCents / 100)} • Compromissos mensais`}
      >
        <div className="space-y-3">
          {metrics.fixedExpensesTop.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma despesa fixa registrada no período.</p>
          ) : (
            <div className="space-y-2">
              {metrics.fixedExpensesTop.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-medium text-slate-900">{expense.name}</p>
                    <p className="text-xs text-slate-500">
                      {expense.occurrences} lançamentos
                      {expense.storeName ? ` • ${expense.storeName}` : ''}
                      {expense.monthLabel ? ` • ${expense.monthLabel}` : ''}
                    </p>
                  </div>
                  <span className="font-semibold text-rose-600">
                    {formatCurrencyFromCents(expense.totalCents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DetailModal>

      <DetailModal
        open={detailModal.open && detailModal.type === 'net-result'}
        onOpenChange={(open) => setDetailModal({ type: 'net-result', open })}
        title="Detalhamento do Resultado Líquido"
        description={`Margem: ${metrics.totalValueCents > 0 ? ((metrics.netResultCents / metrics.totalValueCents) * 100).toFixed(1) : '0.0'}%`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Faturamento</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatCurrency(metrics.totalValueCents / 100)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Despesas Totais</p>
              <p className="text-lg font-semibold text-rose-600">
                {formatCurrency((metrics.variableExpensesTotalCents + metrics.fixedExpensesTotalCents) / 100)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Resultado Líquido</p>
              <p className={`text-lg font-semibold ${metrics.netResultCents >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                {formatCurrency(metrics.netResultCents / 100)}
              </p>
            </div>
          </div>
          <div className="rounded-lg border p-4 bg-slate-50">
            <p className="text-sm font-medium text-slate-900 mb-2">Composição</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Despesas Variáveis:</span>
                <span className="font-medium">{formatCurrency(metrics.variableExpensesTotalCents / 100)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Despesas Fixas:</span>
                <span className="font-medium">{formatCurrency(metrics.fixedExpensesTotalCents / 100)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-900 font-medium">Total de Despesas:</span>
                <span className="font-semibold text-rose-600">
                  {formatCurrency((metrics.variableExpensesTotalCents + metrics.fixedExpensesTotalCents) / 100)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DetailModal>
          </div>
  );
};

export default AdminDashboard;
