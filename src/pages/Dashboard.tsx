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
    queryKey: ['cash-boxes', user?.store_id, startDate, endDate],
    queryFn: async (): Promise<CashBoxWithRelations[]> => {
      if (!user?.store_id) return [];

      const { data, error } = await supabase
        .from('cash_boxes')
        .select(`
          *,
          cash_box_services(*, service_types(*)),
          cash_box_electronic_entries(*),
          cash_box_expenses(*)
        `)
        .eq('store_id', user.store_id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as CashBoxWithRelations[];
    },
    enabled: !!user?.store_id && isDateRangeValid && shouldFetch,
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
      queryClient.invalidateQueries({ queryKey: ['cash-boxes', user?.store_id, startDate, endDate] });
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
      toast.error('Nao foi possivel atualizar o recebivel.');
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
      toast.error('Nao foi possivel registrar o pagamento.');
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
      toast.error('Nao foi possivel concluir a baixa.');
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
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Olá, {user?.name}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/receber')} variant="outline">
              A Receber
            </Button>
            <Button onClick={signOut} variant="outline" size="icon">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Date Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Período de Caixa</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6">
            <div className="flex w-full flex-col gap-2 md:w-auto">
              <Label className="text-sm font-medium text-slate-700">Data inicial</Label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setShouldFetch(false);
                }}
                className="rounded-md border border-input bg-background px-3 py-2"
              />
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto">
              <Label className="text-sm font-medium text-slate-700">Data final</Label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setShouldFetch(false);
                }}
                className="rounded-md border border-input bg-background px-3 py-2"
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
              >
                Hoje
              </Button>
              <Button
                onClick={() => {
                  if (!user?.store_id || !isDateRangeValid) return;
                  setShouldFetch(true);
                  queryClient.invalidateQueries({
                    queryKey: ['cash-boxes', user?.store_id, startDate, endDate],
                    exact: true,
                  });
                }}
                disabled={!isDateRangeValid || isFetching}
              >
                {isFetching ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </CardContent>
          {!isDateRangeValid && (
            <p className="px-6 pb-4 text-sm text-destructive">
              A data inicial deve ser menor ou igual à data final.
            </p>
          )}
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bruto</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {formatCurrency(summary.gross_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">PIX</CardTitle>
              <DollarSign className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(summary.pix_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cartão</CardTitle>
              <CreditCard className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(summary.cartao_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Despesas</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {formatCurrency(summary.expenses_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Líquido</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(summary.net_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Retornos</CardTitle>
              <RotateCcw className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.return_count}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* New Cash Box Button */}
        <Button onClick={() => navigate('/caixas/novo')} size="lg" className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Novo Caixa
        </Button>

        {/* Recent Cash Boxes */}
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Últimos Caixas do Dia</CardTitle>
            <Input
              value={cashBoxSearch}
              onChange={(event) => setCashBoxSearch(event.target.value)}
              placeholder="Buscar por nota, serviço ou despesa"
              aria-label="Buscar caixas"
              className="md:w-72"
            />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                Carregando caixas...
              </div>
            ) : filteredCashBoxes.length > 0 ? (
              <div className="space-y-2">
                {filteredCashBoxes.map((box) => {
                  const totals = computeBoxTotals(box);
                  const isDeletingCurrent = deleteCashBoxMutation.isPending && cashBoxToDelete?.id === box.id;
                  return (
                    <div
                      key={box.id}
                      onClick={() => navigate(`/caixas/${box.id}`)}
                      className="flex flex-col gap-3 rounded-lg border p-4 hover:bg-accent cursor-pointer transition-colors"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">{formatDate(box.date)}</p>
                          {box.note && (
                            <p className="text-sm text-muted-foreground">{box.note}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {box.cash_box_services?.length ?? 0} serviços · {box.cash_box_expenses?.length ?? 0}{' '}
                            despesas · Retornos {totals.returnCount}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <div>
                            <p className="uppercase tracking-wide text-[10px]">Bruto</p>
                            <p className="font-semibold text-slate-900">{formatCurrency(totals.gross)}</p>
                          </div>
                          <div>
                            <p className="uppercase tracking-wide text-[10px]">Líquido</p>
                            <p className="font-semibold text-slate-900">{formatCurrency(totals.net)}</p>
                          </div>
                          <div>
                            <p className="uppercase tracking-wide text-[10px]">PIX</p>
                            <p className="font-semibold text-slate-900">{formatCurrency(totals.pix)}</p>
                          </div>
                          <div>
                            <p className="uppercase tracking-wide text-[10px]">Cartão</p>
                            <p className="font-semibold text-slate-900">{formatCurrency(totals.cartao)}</p>
                          </div>
                          <div>
                            <p className="uppercase tracking-wide text-[10px]">Despesas</p>
                            <p className="font-semibold text-slate-900 text-destructive">
                              {formatCurrency(totals.expenses)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/caixas/${box.id}`);
                          }}
                        >
                          <PenSquare className="mr-1 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={isDeletingCurrent}
                          onClick={(event) => {
                            event.stopPropagation();
                            setCashBoxToDelete(box);
                          }}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                {hasCashBoxSearch ? "Nenhum caixa encontrado para a busca." : "Nenhum caixa registrado para esta data"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>A Receber</CardTitle>
              <p className="text-sm text-muted-foreground">
                Clientes com pagamento pendente. Registre pagamentos para atualizar o status.
              </p>
            </div>
            <div className="flex w-full flex-col items-start gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
              <Input
                value={receivableSearch}
                onChange={(event) => setReceivableSearch(event.target.value)}
                placeholder="Buscar por cliente, placa ou serviço"
                aria-label="Buscar recebíveis"
                className="md:w-72"
              />
              <Badge variant="outline" className="text-xs uppercase tracking-wide">
                {receivablesBadgeLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingReceivables ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Carregando recebiveis...
              </div>
            ) : filteredReceivables.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                {hasReceivableSearch ? 'Nenhum recebível encontrado para a busca.' : 'Nenhum recebível cadastrado'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Servico</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Ultimo pagamento</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReceivables.map((receivable) => {
                      const statusInfo = statusStyles[receivable.status];
                      const serviceName = receivable.service_type_id
                        ? serviceTypeMap.get(receivable.service_type_id)?.name ?? 'Servico'
                        : 'Sem vinculo';
                      const latestPayment = receivable.receivable_payments?.[0];

                      return (
                        <TableRow key={receivable.id}>
                          <TableCell className="font-medium">{receivable.customer_name}</TableCell>
                          <TableCell>{receivable.plate || '—'}</TableCell>
                          <TableCell>{serviceName}</TableCell>
                          <TableCell>
                            <Badge className={statusInfo.badgeClass}>{statusInfo.label}</Badge>
                          </TableCell>
                          <TableCell>{formatCurrency(receivable.original_amount_cents ?? 0)}</TableCell>
                          <TableCell>
                            {receivable.due_date ? formatDate(receivable.due_date) : '—'}
                          </TableCell>
                          <TableCell>
                            {latestPayment
                              ? `${formatCurrency(latestPayment.amount_cents)} em ${formatDate(latestPayment.paid_on)}`
                              : '—'}
                          </TableCell>
                          <TableCell className="space-x-1 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingReceivable(receivable)}
                            >
                              <PenSquare className="mr-1 h-4 w-4" />
                              Editar
                            </Button>
                            {receivable.status === 'aberto' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setPaymentDialog({
                                    receivable,
                                    amount_cents: receivable.original_amount_cents ?? 0,
                                    method: 'pix',
                                    paid_on: getTodayISO(),
                                  })
                                }
                              >
                                <CheckCircle className="mr-1 h-4 w-4" />
                                Marcar pago
                              </Button>
                            )}
                            {isAdmin && receivable.status === 'pago_pendente_baixa' && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => setConfirmReceivable(receivable)}
                              >
                                <BadgeCheck className="mr-1 h-4 w-4" />
                                Dar baixa
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editingReceivable !== null} onOpenChange={(open) => !open && setEditingReceivable(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar recebivel</DialogTitle>
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
            <DialogDescription>Confirme para concluir a baixa deste recebivel.</DialogDescription>
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
    </div>
  );

}
