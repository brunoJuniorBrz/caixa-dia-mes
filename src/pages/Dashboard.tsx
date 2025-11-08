import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/money';
import { formatDate, getTodayISO } from '@/lib/date';
import { MoneyInput } from '@/components/MoneyInput';
import { toast } from 'sonner';
import {
  Plus,
  DollarSign,
  CreditCard,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  LogOut,
  PenSquare,
  CheckCircle,
  BadgeCheck,
  Trash2,
  BarChart3,
} from 'lucide-react';
import type {
  CashBox,
  CashBoxSummary,
  CashBoxService,
  CashBoxElectronicEntry,
  CashBoxExpense,
  ServiceType,
  Receivable,
} from '@/types/database';

interface CashBoxServiceWithType extends CashBoxService {
  service_types?: ServiceType | null;
}

interface CashBoxWithRelations extends CashBox {
  cash_box_services: CashBoxServiceWithType[] | null;
  cash_box_electronic_entries: CashBoxElectronicEntry[] | null;
  cash_box_expenses: CashBoxExpense[] | null;
}

interface ReceivableWithRelations extends Receivable {
  receivable_payments: {
    id: string;
    paid_on: string;
    amount_cents: number;
    method: 'pix' | 'cartao' | null;
  }[];
}

function computeBoxTotals(box: CashBoxWithRelations) {
  const services = box.cash_box_services ?? [];
  const electronicEntries = box.cash_box_electronic_entries ?? [];
  const expenses = box.cash_box_expenses ?? [];

  const gross = services
    .filter((service) => service.service_types?.counts_in_gross)
    .reduce(
      (total, service) =>
        total + (service.total_cents ?? service.unit_price_cents * service.quantity),
      0,
    );

  const returnCount = services
    .filter((service) => service.service_types && !service.service_types.counts_in_gross)
    .reduce((total, service) => total + service.quantity, 0);

  const pix = electronicEntries
    .filter((entry) => entry.method === 'pix')
    .reduce((total, entry) => total + entry.amount_cents, 0);

  const cartao = electronicEntries
    .filter((entry) => entry.method === 'cartao')
    .reduce((total, entry) => total + entry.amount_cents, 0);

  const expensesTotal = expenses.reduce(
    (total, expense) => total + (expense.amount_cents ?? 0),
    0,
  );

  const net = gross - expensesTotal;

  return {
    gross,
    pix,
    cartao,
    expenses: expensesTotal,
    net,
    returnCount,
  };
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(getTodayISO());
  const [endDate, setEndDate] = useState(getTodayISO());
  const [cashBoxSearch, setCashBoxSearch] = useState('');
  const [receivableSearch, setReceivableSearch] = useState('');
  const deferredCashSearch = useDeferredValue(cashBoxSearch);
  const deferredReceivableSearch = useDeferredValue(receivableSearch);
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isVistoriador = user?.role === 'vistoriador';
  const isDateRangeValid = useMemo(() => startDate <= endDate, [startDate, endDate]);

  const [editingReceivable, setEditingReceivable] = useState<ReceivableWithRelations | null>(null);
  const [editForm, setEditForm] = useState({
    customer_name: '',
    plate: '',
    original_amount_cents: 0,
    due_date: '',
    service_type_id: '' as string | null,
  });
  const [paymentDialog, setPaymentDialog] = useState<{
    receivable: ReceivableWithRelations;
    amount_cents: number;
    method: 'pix' | 'cartao';
    paid_on: string;
  } | null>(null);

  const [confirmReceivable, setConfirmReceivable] = useState<ReceivableWithRelations | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [isSavingBaixa, setIsSavingBaixa] = useState(false);
  const [cashBoxToDelete, setCashBoxToDelete] = useState<CashBoxWithRelations | null>(null);

  useEffect(() => {
    if (editingReceivable) {
      setEditForm({
        customer_name: editingReceivable.customer_name,
        plate: editingReceivable.plate ?? '',
        original_amount_cents: editingReceivable.original_amount_cents ?? 0,
        due_date: editingReceivable.due_date ?? '',
        service_type_id: editingReceivable.service_type_id ?? '',
      });
    }
  }, [editingReceivable]);
  const [shouldFetch, setShouldFetch] = useState(true);
  const {
    data: cashBoxesData = [],
    isLoading,
    isFetching,
  } = useQuery<CashBoxWithRelations[]>({
    queryKey: ['cash-boxes', user?.store_id, user?.role, startDate, endDate],
    queryFn: async (): Promise<CashBoxWithRelations[]> => {
      if (!isAdmin && !user?.store_id) return [];

      let query = supabase
        .from('cash_boxes')
        .select(`
          *,
          cash_box_services(*, service_types(*)),
          cash_box_electronic_entries(*),
          cash_box_expenses(*)
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      // Se não for admin, filtra por store_id
      if (!isAdmin && user?.store_id) {
        query = query.eq('store_id', user.store_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as CashBoxWithRelations[];
    },
    enabled: (isAdmin || !!user?.store_id) && isDateRangeValid && shouldFetch,
    onSuccess: () => setShouldFetch(false),
    onError: () => setShouldFetch(false),
  });
  const cashBoxes = isDateRangeValid ? cashBoxesData : [];

  const { data: serviceTypes = [] } = useQuery<ServiceType[]>({
    queryKey: ['service-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data ?? []) as ServiceType[];
    },
    staleTime: 1000 * 60 * 10,
  });

  const { data: receivables = [], isLoading: isLoadingReceivables } = useQuery<ReceivableWithRelations[]>({
    queryKey: ['receivables', user?.store_id, user?.role],
    queryFn: async () => {
      const query = supabase
        .from('receivables')
        .select('*, receivable_payments(*)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!isAdmin && user?.store_id) {
        query.eq('store_id', user.store_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ReceivableWithRelations[];
    },
    enabled: !!user,
  });

  const summary: CashBoxSummary = cashBoxes.reduce<CashBoxSummary>(
    (accumulator, box) => {
      const services = box.cash_box_services ?? [];
      const electronicEntries = box.cash_box_electronic_entries ?? [];
      const expenses = box.cash_box_expenses ?? [];

      const grossServices = services.filter(
        (service) => service.service_types?.counts_in_gross,
      );
      const gross = grossServices.reduce(
        (total, service) => total + (service.total_cents ?? service.unit_price_cents * service.quantity),
        0,
      );

      const returnServices = services.filter(
        (service) => service.service_types && !service.service_types.counts_in_gross,
      );
      const returnCount = returnServices.reduce(
        (total, service) => total + service.quantity,
        0,
      );

      const pix = electronicEntries
        .filter((entry) => entry.method === 'pix')
        .reduce((total, entry) => total + entry.amount_cents, 0);

      const cartao = electronicEntries
        .filter((entry) => entry.method === 'cartao')
        .reduce((total, entry) => total + entry.amount_cents, 0);

      const expensesTotal = expenses.reduce(
        (total, expense) => total + expense.amount_cents,
        0,
      );

      return {
        gross_total: accumulator.gross_total + gross,
        pix_total: accumulator.pix_total + pix,
        cartao_total: accumulator.cartao_total + cartao,
        expenses_total: accumulator.expenses_total + expensesTotal,
        net_total: accumulator.net_total + (gross - expensesTotal),
        return_count: accumulator.return_count + returnCount,
      };
    },
    {
      gross_total: 0,
      pix_total: 0,
      cartao_total: 0,
      expenses_total: 0,
      net_total: 0,
      return_count: 0,
    },
  );

  const serviceTypeMap = useMemo(() => new Map(serviceTypes.map((service) => [service.id, service])), [serviceTypes]);
  const statusStyles: Record<Receivable['status'], { label: string; badgeClass: string }> = {
    aberto: { label: 'Aberto', badgeClass: 'bg-amber-100 text-amber-800' },
    pago_pendente_baixa: { label: 'Pago (pendente baixa)', badgeClass: 'bg-blue-100 text-blue-800' },
    baixado: { label: 'Baixado', badgeClass: 'bg-emerald-100 text-emerald-800' },
  };
  const activeReceivables = useMemo(
    () => receivables.filter((receivable) => receivable.status !== 'baixado'),
    [receivables],
  );
  const filteredCashBoxes = useMemo(() => {
    const term = deferredCashSearch.trim().toLowerCase();
    if (!term) return cashBoxes;
    return cashBoxes.filter((box) => {
      const values: string[] = [
        formatDate(box.date).toLowerCase(),
        box.note?.toLowerCase() ?? '',
      ];

      const serviceNames = (box.cash_box_services ?? [])
        .map((service) => service.service_types?.name?.toLowerCase() ?? service.service_types?.code?.toLowerCase() ?? '')
        .filter(Boolean)
        .join(' ');
      if (serviceNames) values.push(serviceNames);

      const expenseTitles = (box.cash_box_expenses ?? [])
        .map((expense) => expense.title.toLowerCase())
        .join(' ');
      if (expenseTitles) values.push(expenseTitles);

      return values.some((value) => value.includes(term));
    });
  }, [cashBoxes, deferredCashSearch]);

  const filteredReceivables = useMemo(() => {
    const term = deferredReceivableSearch.trim().toLowerCase();
    if (!term) return activeReceivables;
    return activeReceivables.filter((receivable) => {
      const serviceName = receivable.service_type_id
        ? serviceTypeMap.get(receivable.service_type_id)?.name ?? ''
        : '';
      const latestPayment = receivable.receivable_payments?.[0];

      const fields = [
        receivable.customer_name,
        receivable.plate ?? '',
        serviceName,
        statusStyles[receivable.status].label,
        formatCurrency(receivable.original_amount_cents ?? 0),
      ];

      if (receivable.due_date) {
        fields.push(formatDate(receivable.due_date));
      }

      if (latestPayment) {
        fields.push(formatDate(latestPayment.paid_on));
        fields.push(formatCurrency(latestPayment.amount_cents));
      }

      return fields.some((field) => field.toLowerCase().includes(term));
    });
  }, [activeReceivables, deferredReceivableSearch, serviceTypeMap]);

  const hasCashBoxSearch = deferredCashSearch.trim().length > 0;
  const hasReceivableSearch = deferredReceivableSearch.trim().length > 0;
  const totalReceivablesCount = activeReceivables.length;
  const filteredReceivablesCount = filteredReceivables.length;
  const receivablesBadgeLabel =
    totalReceivablesCount === filteredReceivablesCount
      ? `${filteredReceivablesCount} registros`
      : `${filteredReceivablesCount} de ${totalReceivablesCount} registros`;

  const invalidateReceivables = () => {
    queryClient.invalidateQueries({ queryKey: ['receivables', user?.store_id, user?.role] });
  };

  const deleteCashBoxMutation = useMutation({
    mutationFn: async (cashBoxId: string) => {
      const { error } = await supabase.from('cash_boxes').delete().eq('id', cashBoxId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-boxes', user?.store_id, user?.role, startDate, endDate] });
      toast.success('Caixa excluído.');
      setCashBoxToDelete(null);
    },
    onError: (error: unknown) => {
      console.error('Erro ao excluir caixa:', error);
      toast.error('Não foi possível excluir o caixa.');
    },
  });

  const handleEditChange = (field: keyof typeof editForm, value: string | number) => {
    setEditForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSaveEdit = async () => {
    if (!editingReceivable) return;
    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from('receivables')
        .update({
          customer_name: editForm.customer_name,
          plate: editForm.plate || null,
          original_amount_cents: editForm.original_amount_cents,
          due_date: editForm.due_date || null,
          service_type_id: editForm.service_type_id || null,
        })
        .eq('id', editingReceivable.id);

      if (error) throw error;
      toast.success('Recebivel atualizado.');
      setEditingReceivable(null);
      invalidateReceivables();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível atualizar o recebível.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleRegisterPayment = async () => {
    if (!paymentDialog || !user) return;
    setIsSavingPayment(true);
    try {
      const { receivable, amount_cents, method, paid_on } = paymentDialog;
      const { error: paymentError } = await supabase.from('receivable_payments').insert({
        receivable_id: receivable.id,
        amount_cents,
        method,
        paid_on,
        recorded_by_user_id: user.id,
      });
      if (paymentError) throw paymentError;

      const { error: updateError } = await supabase
        .from('receivables')
        .update({ status: 'pago_pendente_baixa' })
        .eq('id', receivable.id);
      if (updateError) throw updateError;

      toast.success('Pagamento registrado. Status aguardando baixa.');
      setPaymentDialog(null);
      invalidateReceivables();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível registrar o pagamento.');
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleConfirmBaixa = async () => {
    if (!confirmReceivable) return;
    setIsSavingBaixa(true);
    try {
      const { error } = await supabase
        .from('receivables')
        .update({ status: 'baixado' })
        .eq('id', confirmReceivable.id);
      if (error) throw error;

      toast.success('Recebivel baixado.');
      setConfirmReceivable(null);
      invalidateReceivables();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível concluir a baixa.');
    } finally {
      setIsSavingBaixa(false);
    }
  };

  const isInitialLoading = isLoading && cashBoxes.length === 0;

  if (isInitialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      {/* Sidebar estilo Apple */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        {/* Logo/Header */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
          <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 p-2 shadow-sm">
            <img src="/logo.png" alt="TOP Vistorias" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">TOP Vistorias</p>
            <p className="text-xs text-slate-500">Dashboard</p>
          </div>
        </div>

        {/* User Info */}
        <div className="border-b border-slate-200 px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Usuário</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{user?.name}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex w-full items-center gap-3 rounded-lg bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200"
          >
            <BarChart3 className="h-5 w-5" />
            Balanço
          </button>
          <button
            onClick={() => navigate('/historico')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <BarChart3 className="h-5 w-5" />
            Histórico
          </button>
          <button
            onClick={() => navigate('/caixas/novo')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Plus className="h-5 w-5" />
            Novo Caixa
          </button>
          <button
            onClick={() => navigate('/receber')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <DollarSign className="h-5 w-5" />
            A Receber
          </button>
        </nav>

        {/* Logout at bottom */}
        <div className="border-t border-slate-200 p-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-5 w-5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-6 p-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">Visão geral dos seus caixas</p>
          </div>

        {/* Date Selector - Estilo Apple */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Período</h2>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-slate-600">Data inicial</Label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setShouldFetch(false);
                }}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-slate-600">Data final</Label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setShouldFetch(false);
                }}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const today = getTodayISO();
                  setStartDate(today);
                  setEndDate(today);
                  setShouldFetch(true);
                }}
                className="h-10 rounded-lg"
              >
                Hoje
              </Button>
              <Button
                onClick={() => {
                  if ((!isAdmin && !user?.store_id) || !isDateRangeValid) return;
                  setShouldFetch(true);
                  queryClient.invalidateQueries({
                    queryKey: ['cash-boxes', user?.store_id, user?.role, startDate, endDate],
                    exact: true,
                  });
                }}
                disabled={(!isAdmin && !user?.store_id) || !isDateRangeValid || isFetching}
                className="h-10 rounded-lg bg-[#0A7EA4] hover:bg-[#0A6B8A]"
              >
                {isFetching ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </div>
          {!isDateRangeValid && (
            <p className="mt-3 text-sm text-red-600">
              A data inicial deve ser menor ou igual à data final.
            </p>
          )}
        </div>

        {/* Dashboard Cards - Minimalista */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Faturamento Bruto */}
          <div className="rounded-2xl bg-emerald-500 p-8 shadow-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium uppercase tracking-wide text-emerald-50">Faturamento Bruto</p>
                <p className="mt-3 text-4xl font-bold text-white">
                  {formatCurrency(summary.gross_total)}
                </p>
                <p className="mt-2 text-sm text-emerald-100">
                  Total de entradas no período
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
                <TrendingUp className="h-7 w-7 text-white" />
              </div>
            </div>
          </div>

          {/* Valor Líquido */}
          <div className="rounded-2xl bg-blue-500 p-8 shadow-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium uppercase tracking-wide text-blue-50">Valor Líquido</p>
                <p className="mt-3 text-4xl font-bold text-white">
                  {formatCurrency(summary.net_total)}
                </p>
                <p className="mt-2 text-sm text-blue-100">
                  Faturamento após despesas
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
                <DollarSign className="h-7 w-7 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Cards Secundários */}
        <div className="grid gap-4 md:grid-cols-4">
          {/* PIX */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
              <svg className="h-7 w-7 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">PIX</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatCurrency(summary.pix_total)}
            </p>
          </div>

          {/* Cartão */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
              <CreditCard className="h-7 w-7 text-blue-600" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">CARTÃO</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatCurrency(summary.cartao_total)}
            </p>
          </div>

          {/* Despesas */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <TrendingDown className="h-7 w-7 text-red-600" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">DESPESAS</p>
            <p className="mt-2 text-2xl font-bold text-red-600">
              {formatCurrency(summary.expenses_total)}
            </p>
          </div>

          {/* Retornos */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <RotateCcw className="h-7 w-7 text-slate-600" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">RETORNOS</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {summary.return_count}
            </p>
          </div>
        </div>
        </div>
      </main>
    </div>

    {/* Dialogs */}
    <Dialog open={editingReceivable !== null} onOpenChange={(open) => !open && setEditingReceivable(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar recebível</DialogTitle>
          <DialogDescription>Atualize as informacoes deste cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Input
              value={editForm.customer_name}
              onChange={(event) => handleEditChange('customer_name', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Placa</Label>
            <Input value={editForm.plate} onChange={(event) => handleEditChange('plate', event.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Servico relacionado</Label>
              <Select
                value={(editForm.service_type_id ?? '') === '' ? 'none' : (editForm.service_type_id as string)}
                onValueChange={(value) => handleEditChange('service_type_id', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vinculo</SelectItem>
                  {serviceTypes.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vencimento</Label>
              <Input
                type="date"
                value={editForm.due_date ?? ''}
                onChange={(event) => handleEditChange('due_date', event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Valor</Label>
            <MoneyInput
              value={editForm.original_amount_cents}
              onChange={(value) => handleEditChange('original_amount_cents', value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingReceivable(null)}>
            Cancelar
          </Button>
          <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
            {isSavingEdit ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={paymentDialog !== null} onOpenChange={(open) => !open && setPaymentDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>Informe os detalhes do pagamento recebido.</DialogDescription>
        </DialogHeader>
        {paymentDialog && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor pago</Label>
              <MoneyInput
                value={paymentDialog.amount_cents}
                onChange={(value) =>
                  setPaymentDialog((previous) => (previous ? { ...previous, amount_cents: value } : previous))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Metodo</Label>
              <Select
                value={paymentDialog.method}
                onValueChange={(value: 'pix' | 'cartao') =>
                  setPaymentDialog((previous) => (previous ? { ...previous, method: value } : previous))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="cartao">Cartao</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={paymentDialog.paid_on}
                onChange={(event) =>
                  setPaymentDialog((previous) => (previous ? { ...previous, paid_on: event.target.value } : previous))
                }
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setPaymentDialog(null)}>
            Cancelar
          </Button>
          <Button onClick={handleRegisterPayment} disabled={isSavingPayment}>
            {isSavingPayment ? 'Registrando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={confirmReceivable !== null} onOpenChange={(open) => !open && setConfirmReceivable(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar baixa</DialogTitle>
          <DialogDescription>Confirme para concluir a baixa deste recebível.</DialogDescription>
        </DialogHeader>
        {confirmReceivable && (
          <div className="space-y-2 text-sm">
            <p>
              Cliente: <span className="font-medium">{confirmReceivable.customer_name}</span>
            </p>
            <p>Valor: {formatCurrency(confirmReceivable.original_amount_cents ?? 0)}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmReceivable(null)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmBaixa} disabled={isSavingBaixa}>
            {isSavingBaixa ? 'Confirmando...' : 'Confirmar baixa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog
      open={cashBoxToDelete !== null}
      onOpenChange={(open) => {
        if (!open && !deleteCashBoxMutation.isPending) {
          setCashBoxToDelete(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir caixa</AlertDialogTitle>
          <AlertDialogDescription>
            {cashBoxToDelete
              ? `Confirme para remover o caixa de ${formatDate(cashBoxToDelete.date)}. Todos os serviços, entradas e despesas associados serão excluídos permanentemente.`
              : 'Confirme para remover o caixa selecionado.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteCashBoxMutation.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteCashBoxMutation.isPending || !cashBoxToDelete}
            onClick={() => {
              if (!cashBoxToDelete) return;
              deleteCashBoxMutation.mutate(cashBoxToDelete.id);
            }}
          >
            {deleteCashBoxMutation.isPending ? 'Excluindo...' : 'Confirmar exclusão'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );

}


