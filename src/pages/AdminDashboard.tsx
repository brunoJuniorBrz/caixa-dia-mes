import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, formatISO, subDays } from 'date-fns';
import { toast } from 'sonner';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyInput } from '@/components/MoneyInput';
import { formatCurrency } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { useForm, Controller } from 'react-hook-form';
import type { SubmitHandler } from 'react-hook-form';
import { Loader2, Edit, Plus, Trash2, LogOut, Search, CheckCircle, BadgeCheck, Calendar } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import {
  fetchStores,
  fetchUsers,
  fetchCashBoxesByRange,
  fetchFixedExpenses,
  fetchVariableExpenses,
  upsertFixedExpense,
  deleteFixedExpense,
  updateVariableExpense,
  deleteVariableExpense,
  createVariableExpense,
} from '@/features/admin/api';
import { summarizeCashBoxes, formatCurrencyFromCents } from '@/features/admin/utils';
import type { AdminFilters, FixedExpenseRecord, VariableExpenseRecord } from '@/features/admin/types';
import type { Store, AppUser, Receivable, PaymentMethod } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type TabValue = 'overview' | 'cash';

interface ExpenseFormValues {
  title: string;
  amount: number;
  storeId: string | '';
  month: string;
}

interface VariableExpenseFormValues {
  cashBoxId: string;
  title: string;
  amount: number;
}

interface VariableExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashBoxes: Array<{ id: string; label: string }>;
  expense: VariableExpenseRecord | null;
  onSubmit: (values: VariableExpenseFormValues) => void;
  isSaving: boolean;
}

type ListMode = 'all' | 'top5' | 'top10' | 'highest' | 'lowest';

interface ReceivableWithPayments extends Receivable {
  receivable_payments: Array<{
    id: string;
    paid_on: string;
    amount_cents: number;
    method?: PaymentMethod;
  }>;
}

function getTodayISO(): string {
  return formatISO(new Date(), { representation: 'date' });
}

const RECEIVABLE_STATUS_STYLES: Record<Receivable['status'], { label: string; badgeClass: string }> = {
  aberto: { label: 'Aberto', badgeClass: 'bg-amber-100 text-amber-800' },
  pago_pendente_baixa: { label: 'Pago (pendente baixa)', badgeClass: 'bg-blue-100 text-blue-800' },
  baixado: { label: 'Baixado', badgeClass: 'bg-emerald-100 text-emerald-800' },
};

function applyViewMode<T extends { amount_cents: number }>(items: T[], mode: ListMode): T[] {
  const sortedDesc = [...items].sort((a, b) => b.amount_cents - a.amount_cents);
  switch (mode) {
    case 'top5':
      return sortedDesc.slice(0, 5);
    case 'top10':
      return sortedDesc.slice(0, 10);
    case 'highest':
      return sortedDesc;
    case 'lowest':
      return [...items].sort((a, b) => a.amount_cents - b.amount_cents);
    default:
      return items;
  }
}

function getDefaultDateRange(): { start: string; end: string } {
  const endDate = new Date();
  const startDate = subDays(endDate, 29);
  return {
    start: formatISO(startDate, { representation: 'date' }),
    end: formatISO(endDate, { representation: 'date' }),
  };
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { start, end } = getDefaultDateRange();
  const { user, signOut } = useAuth();
  const userDisplayName = user?.name || user?.email || 'Usuário';
  const canManageReceivables = user?.role === 'admin';

  const [filters, setFilters] = useState<AdminFilters>({
    storeId: null,
    vistoriadorId: null,
    startDate: start,
    endDate: end,
  });

  const [tab, setTab] = useState<TabValue>('overview');
  const [isExpenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FixedExpenseRecord | null>(null);
  const [fixedExpenseSearch, setFixedExpenseSearch] = useState('');
  const [cashSearchTerm, setCashSearchTerm] = useState('');
  const [showEntries, setShowEntries] = useState(true);
  const [showVariableExpenses, setShowVariableExpenses] = useState(true);
  const [appliedFilters, setAppliedFilters] = useState<AdminFilters | null>(null);
  const [variableExpenseSearch, setVariableExpenseSearch] = useState('');
  const [isVariableDialogOpen, setVariableDialogOpen] = useState(false);
  const [editingVariableExpense, setEditingVariableExpense] = useState<VariableExpenseRecord | null>(null);

  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const [fixedViewMode, setFixedViewMode] = useState<ListMode>('top5');
  const [variableViewMode, setVariableViewMode] = useState<ListMode>('top5');
  const [receivablesSearch, setReceivablesSearch] = useState('');
  const [receivablePaymentDialog, setReceivablePaymentDialog] = useState<{
    receivable: ReceivableWithPayments;
    amount_cents: number;
    method: PaymentMethod;
    paid_on: string;
  } | null>(null);
  const [receivableToConfirmBaixa, setReceivableToConfirmBaixa] = useState<ReceivableWithPayments | null>(null);

  const { data: stores = [], isLoading: isLoadingStores } = useQuery<Store[]>({
    queryKey: ['admin-stores'],
    queryFn: fetchStores,
  });

  const { data: users = [], isLoading: isLoadingUsers } = useQuery<AppUser[]>({
    queryKey: ['admin-users', filters.storeId],
    queryFn: () => fetchUsers(filters.storeId ?? undefined),
  });

  const receivablesQueryKey = [
    'admin-receivables',
    appliedFilters?.storeId,
    appliedFilters?.vistoriadorId,
    appliedFilters?.startDate,
    appliedFilters?.endDate,
  ] as const;

  const cashBoxesQuery = useQuery({
    queryKey: ['admin-cash-boxes', appliedFilters],
    queryFn: () => fetchCashBoxesByRange(appliedFilters!),
    enabled: Boolean(appliedFilters),
  });

  const fixedExpensesQuery = useQuery({
    queryKey: ['admin-fixed-expenses', appliedFilters?.storeId, appliedFilters?.startDate, appliedFilters?.endDate],
    queryFn: () =>
      fetchFixedExpenses({
        storeId: appliedFilters?.storeId ?? null,
        startDate: appliedFilters?.startDate ?? '',
        endDate: appliedFilters?.endDate ?? '',
      }),
    enabled: Boolean(appliedFilters),
  });
  const variableExpensesQuery = useQuery({
    queryKey: ['admin-variable-expenses', appliedFilters?.storeId, appliedFilters?.vistoriadorId, appliedFilters?.startDate, appliedFilters?.endDate],
    queryFn: () =>
      fetchVariableExpenses({
        storeId: appliedFilters?.storeId ?? null,
        vistoriadorId: appliedFilters?.vistoriadorId ?? null,
        startDate: appliedFilters?.startDate ?? '',
        endDate: appliedFilters?.endDate ?? '',
      }),
    enabled: Boolean(appliedFilters),
  });

  const {
    data: receivables = [],
    isLoading: isLoadingReceivables,
    isError: isReceivablesError,
  } = useQuery<ReceivableWithPayments[]>({
    queryKey: receivablesQueryKey,
    queryFn: async () => {
      if (!appliedFilters) {
        return [];
      }

      let query = supabase
        .from('receivables')
        .select('*, receivable_payments(*), service_types(*)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (appliedFilters.storeId) {
        query = query.eq('store_id', appliedFilters.storeId);
      }

      if (appliedFilters.vistoriadorId) {
        query = query.eq('created_by_user_id', appliedFilters.vistoriadorId);
      }

      if (appliedFilters.startDate) {
        query = query.gte('created_at', `${appliedFilters.startDate}T00:00:00`);
      }

      if (appliedFilters.endDate) {
        query = query.lte('created_at', `${appliedFilters.endDate}T23:59:59`);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      return (data ?? []) as ReceivableWithPayments[];
    },
    enabled: Boolean(appliedFilters),
  });

  const upsertExpenseMutation = useMutation({
    mutationFn: upsertFixedExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-fixed-expenses', appliedFilters?.storeId, appliedFilters?.startDate, appliedFilters?.endDate],
      });
      toast.success('Despesa fixa salva com sucesso.');
      setExpenseDialogOpen(false);
      setEditingExpense(null);
    },
    onError: (error: unknown) => {
      console.error('Erro ao salvar despesa fixa:', error);
      toast.error('Não foi possível salvar a despesa fixa.');
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: deleteFixedExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-fixed-expenses', appliedFilters?.storeId, appliedFilters?.startDate, appliedFilters?.endDate],
      });
      toast.success('Despesa removida.');
    },
    onError: (error: unknown) => {
      console.error('Erro ao remover despesa fixa:', error);
      toast.error('Não foi possível remover a despesa.');
    },
  });

  const updateVariableExpenseMutation = useMutation({
    mutationFn: ({ id, title, amount_cents }: { id: string; title: string; amount_cents: number }) =>
      updateVariableExpense(id, { title, amount_cents }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-variable-expenses', appliedFilters?.storeId, appliedFilters?.vistoriadorId, appliedFilters?.startDate, appliedFilters?.endDate] });
      queryClient.invalidateQueries({ queryKey: ['admin-cash-boxes', appliedFilters] });
      toast.success('Despesa variável atualizada.');
      setVariableDialogOpen(false);
      setEditingVariableExpense(null);
    },
    onError: (error: unknown) => {
      console.error('Erro ao atualizar despesa variável:', error);
      toast.error('Não foi possível atualizar a despesa variável.');
    },
  });

  const createVariableExpenseMutation = useMutation({
    mutationFn: ({ cash_box_id, title, amount_cents }: { cash_box_id: string; title: string; amount_cents: number }) =>
      createVariableExpense({ cash_box_id, title, amount_cents }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-variable-expenses', appliedFilters?.storeId, appliedFilters?.vistoriadorId, appliedFilters?.startDate, appliedFilters?.endDate] });
      queryClient.invalidateQueries({ queryKey: ['admin-cash-boxes', appliedFilters] });
      toast.success('Despesa variável adicionada.');
      setVariableDialogOpen(false);
      setEditingVariableExpense(null);
    },
    onError: (error: unknown) => {
      console.error('Erro ao adicionar despesa variável:', error);
      toast.error('Não foi possível adicionar a despesa variável.');
    },
  });

  const registerReceivablePaymentMutation = useMutation({
    mutationFn: async ({
      receivable,
      amount_cents,
      method,
      paid_on,
    }: {
      receivable: ReceivableWithPayments;
      amount_cents: number;
      method: PaymentMethod;
      paid_on: string;
    }) => {
      const { error: paymentError } = await supabase.from('receivable_payments').insert({
        receivable_id: receivable.id,
        amount_cents,
        method,
        paid_on,
        recorded_by_user_id: user?.id ?? receivable.created_by_user_id,
      });
      if (paymentError) throw paymentError;

      const { error: statusError } = await supabase
        .from('receivables')
        .update({ status: 'pago_pendente_baixa' })
        .eq('id', receivable.id);
      if (statusError) throw statusError;
    },
    onSuccess: () => {
      toast.success('Pagamento registrado. Status atualizado para aguardando baixa.');
      setReceivablePaymentDialog(null);
      queryClient.invalidateQueries({ queryKey: receivablesQueryKey });
    },
    onError: (error: unknown) => {
      console.error('Erro ao registrar pagamento:', error);
      toast.error('Não foi possível registrar o pagamento.');
    },
  });

  const baixaReceivableMutation = useMutation({
    mutationFn: async (receivableId: string) => {
      const { error } = await supabase.from('receivables').update({ status: 'baixado' }).eq('id', receivableId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Recebível baixado e removido da listagem.');
      setReceivableToConfirmBaixa(null);
      queryClient.invalidateQueries({ queryKey: receivablesQueryKey });
    },
    onError: (error: unknown) => {
      console.error('Erro ao dar baixa no recebível:', error);
      toast.error('Não foi possível concluir a baixa. Tente novamente.');
    },
  });

  const isRegisteringPayment = registerReceivablePaymentMutation.isPending;
  const isBaixandoRecebivel = baixaReceivableMutation.isPending;

  const deleteVariableExpenseMutation = useMutation({
    mutationFn: deleteVariableExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-variable-expenses', appliedFilters?.storeId, appliedFilters?.vistoriadorId, appliedFilters?.startDate, appliedFilters?.endDate] });
      queryClient.invalidateQueries({ queryKey: ['admin-cash-boxes', appliedFilters] });
      toast.success('Despesa variável removida.');
    },
    onError: (error: unknown) => {
      console.error('Erro ao remover despesa variável:', error);
      toast.error('Não foi possível remover a despesa variável.');
    },
  });

  const monthlySummary = useMemo(() => {
    if (!cashBoxesQuery.data || !fixedExpensesQuery.data) return [];
    return summarizeCashBoxes(cashBoxesQuery.data, fixedExpensesQuery.data);
  }, [cashBoxesQuery.data, fixedExpensesQuery.data]);

  useEffect(() => {
    if (monthlySummary.length > 0) {
      setActiveMonth((prev) => {
        if (prev && monthlySummary.some((month) => month.monthKey === prev)) {
          return prev;
        }
        return monthlySummary[0].monthKey;
      });
    } else {
      setActiveMonth(null);
    }
  }, [monthlySummary]);

  const storeMap = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach((store) => {
      map.set(store.id, store.name);
    });
    return map;
  }, [stores]);

  const filteredReceivables = useMemo(() => {
    const term = receivablesSearch.trim().toLowerCase();
    return receivables.filter((receivable) => {
      if (receivable.status === 'baixado') {
        return false;
      }

      if (!term) {
        return true;
      }

      const storeName = storeMap.get(receivable.store_id) ?? '';
      const plate = receivable.plate ?? '';

      return (
        receivable.customer_name.toLowerCase().includes(term) ||
        plate.toLowerCase().includes(term) ||
        storeName.toLowerCase().includes(term)
      );
    });
  }, [receivables, receivablesSearch, storeMap]);

  const receivablesTotalCents = useMemo(
    () =>
      filteredReceivables.reduce(
        (total, receivable) => total + (receivable.original_amount_cents ?? 0),
        0,
      ),
    [filteredReceivables],
  );

  useEffect(() => {
    setReceivablesSearch('');
  }, [appliedFilters]);

  const filteredFixedExpenses = useMemo(() => {
    const data = fixedExpensesQuery.data ?? [];
    const term = fixedExpenseSearch.trim().toLowerCase();
    if (!term) {
      return data;
    }
    return data.filter((expense) => {
      const storeName = storeMap.get(expense.store_id) ?? '';
      return (
        expense.title.toLowerCase().includes(term) ||
        storeName.toLowerCase().includes(term) ||
        formatDate(expense.month_year, 'MMMM/yyyy').toLowerCase().includes(term)
      );
    });
  }, [fixedExpensesQuery.data, fixedExpenseSearch, storeMap]);

  const filteredCashBoxes = useMemo(() => {
    const data = cashBoxesQuery.data ?? [];
    const term = cashSearchTerm.trim().toLowerCase();

    return data
      .map((box) => {
        const storeName = storeMap.get(box.store_id) ?? 'Loja';
        const services = (box.cash_box_services ?? []).filter((service) => service.quantity > 0);
        const expenses = box.cash_box_expenses ?? [];

        const servicesMatches = services.filter((service) => {
          const serviceName = service.service_types?.name ?? service.service_type_id;
          return serviceName.toLowerCase().includes(term);
        });

        const expensesMatches = expenses.filter((expense) =>
          expense.title.toLowerCase().includes(term),
        );

        const matches =
          term.length === 0 ||
          storeName.toLowerCase().includes(term) ||
          (box.note ?? '').toLowerCase().includes(term) ||
          formatDate(box.date).toLowerCase().includes(term) ||
          servicesMatches.length > 0 ||
          expensesMatches.length > 0;

        return {
          box,
          storeName,
          services: term.length > 0 ? servicesMatches : services,
          expenses: term.length > 0 ? expensesMatches : expenses,
          matches,
        };
      })
      .filter((item) => item.matches && (!activeMonth || item.box.date.startsWith(activeMonth ?? '')));
  }, [cashBoxesQuery.data, cashSearchTerm, storeMap, activeMonth]);

  const filteredVariableExpenses = useMemo(() => {
    const data = variableExpensesQuery.data ?? [];
    const term = variableExpenseSearch.trim().toLowerCase();
    if (!term) {
      return data;
    }

    return data.filter((expense) => {
      const storeName = storeMap.get(expense.cash_box.store_id) ?? '';
      const vistoriadorName = expense.cash_box.vistoriador?.name ?? '';
      return (
        expense.title.toLowerCase().includes(term) ||
        storeName.toLowerCase().includes(term) ||
        vistoriadorName.toLowerCase().includes(term) ||
        formatDate(expense.cash_box.date).toLowerCase().includes(term)
      );
    });
  }, [variableExpensesQuery.data, variableExpenseSearch, storeMap]);

  const fixedExpensesForMonth = useMemo(() => {
    const list = filteredFixedExpenses.filter((expense) =>
      !activeMonth || expense.month_year.startsWith(activeMonth),
    );
    return list;
  }, [filteredFixedExpenses, activeMonth]);

  const displayedFixedExpenses = useMemo(() => {
    return applyViewMode(fixedExpensesForMonth, fixedViewMode);
  }, [fixedExpensesForMonth, fixedViewMode]);

  const variableExpensesForMonth = useMemo(() => {
    const list = filteredVariableExpenses.filter((expense) =>
      !activeMonth || expense.cash_box.date.startsWith(activeMonth ?? ''),
    );
    return list;
  }, [filteredVariableExpenses, activeMonth]);

  const displayedVariableExpenses = useMemo(() => {
    return applyViewMode(variableExpensesForMonth, variableViewMode);
  }, [variableExpensesForMonth, variableViewMode]);

  const handleSearch = () => {
    if (!filters.startDate || !filters.endDate) {
      toast.error('Informe data inicial e final.');
      return;
    }
    setActiveMonth(null);
    setAppliedFilters({ ...filters });
  };

  const handleClearFilters = () => {
    const range = getDefaultDateRange();
    setFilters({
      storeId: null,
      vistoriadorId: null,
      startDate: range.start,
      endDate: range.end,
    });
    setAppliedFilters(null);
    setActiveMonth(null);
    setFixedExpenseSearch('');
    setVariableExpenseSearch('');
    setCashSearchTerm('');
  };

  const handleOpenVariableDialog = (expense: VariableExpenseRecord | null = null) => {
    setEditingVariableExpense(expense);
    setVariableDialogOpen(true);
  };

  const handleVariableSubmit = (values: { cashBoxId: string; title: string; amount: number }) => {
    if (!values.cashBoxId) {
      toast.error('Selecione o caixa.');
      return;
    }
    if (editingVariableExpense) {
      updateVariableExpenseMutation.mutate({
        id: editingVariableExpense.id,
        title: values.title,
        amount_cents: values.amount,
      });
    } else {
      createVariableExpenseMutation.mutate({
        cash_box_id: values.cashBoxId,
        title: values.title,
        amount_cents: values.amount,
      });
    }
  };

  const overallTotals = useMemo(() => {
    return monthlySummary.reduce(
      (acc, month) => {
        acc.gross += month.gross;
        acc.pix += month.pix;
        acc.cartao += month.cartao;
        acc.expensesVariable += month.expensesVariable;
        acc.net += month.net;
        acc.fixedExpenses += month.fixedExpenses;
        acc.netAfterFixed += month.netAfterFixed;
        return acc;
      },
      {
        gross: 0,
        pix: 0,
        cartao: 0,
        expensesVariable: 0,
        net: 0,
        fixedExpenses: 0,
        netAfterFixed: 0,
      },
    );
  }, [monthlySummary]);

  const isLoading =
    (appliedFilters &&
      (cashBoxesQuery.isLoading || fixedExpensesQuery.isLoading || variableExpensesQuery.isLoading)) ||
    isLoadingStores ||
    isLoadingUsers;

  const periodLabel = useMemo(() => {
    if (!appliedFilters) return 'selecione um período';
    return `${formatDate(appliedFilters.startDate)} a ${formatDate(appliedFilters.endDate)}`;
  }, [appliedFilters]);

  const cashBoxOptions = useMemo(() => {
    const boxes = cashBoxesQuery.data ?? [];
    return boxes
      .filter((box) => !activeMonth || box.date.startsWith(activeMonth ?? ''))
      .map((box) => ({
        id: box.id,
        label: `${formatDate(box.date)} • ${box.note ?? 'Sem descrição'}`,
      }));
  }, [cashBoxesQuery.data, activeMonth]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Administração</h1>
            <p className="text-muted-foreground">
              Visão consolidada das lojas e fechamentos. Período: {periodLabel}
            </p>
          </div>
          <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-end">
            <Button
              type="button"
              onClick={() => navigate('/admin/fechamento')}
              variant="default"
              size="sm"
              className="gap-2"
            >
              <Calendar className="h-4 w-4" />
              Fechamento mensal
            </Button>
            <div className="flex flex-col items-end text-right">
              <span className="text-xs text-muted-foreground">Usuário</span>
              <span className="max-w-[200px] truncate text-sm font-semibold text-slate-900 md:max-w-[240px]">
                {userDisplayName}
              </span>
            </div>
            <Button
              onClick={() => void signOut()}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
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
            <div className="md:col-span-4 flex flex-wrap items-center gap-3">
              <Button onClick={handleSearch}>Buscar</Button>
              <Button variant="outline" onClick={handleClearFilters}>Limpar</Button>
              {!appliedFilters && (
                <span className="text-sm text-muted-foreground">Defina os filtros e clique em Buscar.</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Accordion
          type="single"
          collapsible
          className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm"
        >
          <AccordionItem value="receivables">
            <AccordionTrigger className="px-6">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="text-left">
                  <p className="text-base font-semibold text-slate-900">Lista de A Receber</p>
                  <p className="text-sm text-muted-foreground">
                    {appliedFilters
                      ? 'Clique para visualizar e buscar recebíveis pendentes.'
                      : 'Defina os filtros acima e clique em Buscar para habilitar a lista.'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <Badge variant="outline">
                    {appliedFilters ? `${filteredReceivables.length} pendentes` : 'Aguardando filtros'}
                  </Badge>
                  {appliedFilters && (
                    <span className="text-xs text-muted-foreground">
                      Total {formatCurrency(receivablesTotalCents)}
                    </span>
                  )}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              {appliedFilters === null ? (
                <div className="rounded-md border border-dashed bg-muted/40 px-6 py-8 text-center text-sm text-muted-foreground">
                  Utilize os filtros acima e clique em{' '}
                  <span className="font-medium text-slate-900">Buscar</span> para carregar os recebíveis.
                </div>
              ) : isReceivablesError ? (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-6 text-sm text-destructive">
                  Não foi possível carregar a lista de recebíveis. Tente novamente em instantes.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="relative w-full md:w-80">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={receivablesSearch}
                        onChange={(event) => setReceivablesSearch(event.target.value)}
                        placeholder="Buscar por cliente, placa ou loja..."
                        disabled={!appliedFilters || isLoadingReceivables}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Somatório selecionado:</span>
                      <span className="font-semibold text-slate-900">{formatCurrency(receivablesTotalCents)}</span>
                    </div>
                  </div>
                  {isLoadingReceivables ? (
                    <div className="flex items-center justify-center rounded-md border border-dashed py-10 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Carregando recebíveis...
                    </div>
                  ) : filteredReceivables.length === 0 ? (
                    <div className="flex items-center justify-center rounded-md border border-dashed py-10 text-sm text-muted-foreground">
                      Nenhum recebível encontrado para os filtros aplicados.
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Loja</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Atualização</TableHead>
                            {canManageReceivables && <TableHead className="text-right">Ações</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredReceivables.map((receivable) => {
                            const storeName = storeMap.get(receivable.store_id) ?? 'Loja';
                            const statusInfo =
                              RECEIVABLE_STATUS_STYLES[receivable.status] ?? RECEIVABLE_STATUS_STYLES.aberto;
                            const payments = receivable.receivable_payments ?? [];
                            const latestPayment = payments.reduce<
                              ReceivableWithPayments['receivable_payments'][number] | null
                            >((latest, current) => {
                              if (!latest) {
                                return current;
                              }
                              return current.paid_on > latest.paid_on ? current : latest;
                            }, null);

                            return (
                              <TableRow key={receivable.id}>
                                <TableCell className="whitespace-nowrap text-sm font-medium text-slate-700">
                                  {storeName}
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {receivable.customer_name}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                                    {receivable.service_types?.name && (
                                      <span>{receivable.service_types.name}</span>
                                    )}
                                    {receivable.plate && (
                                      <span>Placa {receivable.plate.toUpperCase()}</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={statusInfo.badgeClass}>
                                    {statusInfo.label}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatCurrency(receivable.original_amount_cents ?? 0)}</TableCell>
                                <TableCell>
                                  {receivable.due_date ? formatDate(receivable.due_date) : '-'}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {latestPayment ? (
                                    <span>
                                      Pago em{' '}
                                      <span className="font-medium text-slate-900">
                                        {formatDate(latestPayment.paid_on)}
                                      </span>
                                    </span>
                                  ) : (
                                    <span>
                                      Criado em{' '}
                                      <span className="font-medium text-slate-900">
                                        {formatDate(receivable.created_at)}
                                      </span>
                                    </span>
                                  )}
                                </TableCell>
                                {canManageReceivables && (
                                  <TableCell className="text-right">
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      {receivable.status === 'aberto' && (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() =>
                                            setReceivablePaymentDialog({
                                              receivable,
                                              amount_cents: receivable.original_amount_cents ?? 0,
                                              method: 'pix',
                                              paid_on: getTodayISO(),
                                            })
                                          }
                                        >
                                          <CheckCircle className="mr-1 h-4 w-4" />
                                          Registrar pagamento
                                        </Button>
                                      )}
                                      {receivable.status === 'pago_pendente_baixa' && (
                                        <Button
                                          size="sm"
                                          variant="default"
                                          onClick={() => setReceivableToConfirmBaixa(receivable)}
                                        >
                                          <BadgeCheck className="mr-1 h-4 w-4" />
                                          Dar baixa
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {canManageReceivables && (
          <>
            <Dialog
              open={receivablePaymentDialog !== null}
              onOpenChange={(open) => {
                if (!open && !isRegisteringPayment) {
                  setReceivablePaymentDialog(null);
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar pagamento</DialogTitle>
                  <DialogDescription>Informe os detalhes para marcar o recebível como pago.</DialogDescription>
                </DialogHeader>
                {receivablePaymentDialog && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Cliente</Label>
                      <Input value={receivablePaymentDialog.receivable.customer_name} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor pago</Label>
                      <MoneyInput
                        value={receivablePaymentDialog.amount_cents}
                        onChange={(value) =>
                          setReceivablePaymentDialog((previous) =>
                            previous ? { ...previous, amount_cents: value } : previous,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Método</Label>
                      <Select
                        value={receivablePaymentDialog.method}
                        onValueChange={(value: PaymentMethod) =>
                          setReceivablePaymentDialog((previous) =>
                            previous ? { ...previous, method: value } : previous,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o método" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="cartao">Cartão</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Data do pagamento</Label>
                      <Input
                        type="date"
                        value={receivablePaymentDialog.paid_on}
                        onChange={(event) =>
                          setReceivablePaymentDialog((previous) =>
                            previous ? { ...previous, paid_on: event.target.value } : previous,
                          )
                        }
                      />
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setReceivablePaymentDialog(null)}
                    disabled={isRegisteringPayment}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      if (!receivablePaymentDialog) return;
                      registerReceivablePaymentMutation.mutate({
                        receivable: receivablePaymentDialog.receivable,
                        amount_cents: receivablePaymentDialog.amount_cents,
                        method: receivablePaymentDialog.method,
                        paid_on: receivablePaymentDialog.paid_on,
                      });
                    }}
                    disabled={
                      isRegisteringPayment ||
                      !receivablePaymentDialog ||
                      receivablePaymentDialog.amount_cents <= 0 ||
                      !receivablePaymentDialog.paid_on
                    }
                  >
                    {isRegisteringPayment ? 'Registrando...' : 'Confirmar pagamento'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={receivableToConfirmBaixa !== null}
              onOpenChange={(open) => {
                if (!open && !isBaixandoRecebivel) {
                  setReceivableToConfirmBaixa(null);
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirmar baixa</DialogTitle>
                  <DialogDescription>Dar baixa remove o recebível das listas ativas imediatamente.</DialogDescription>
                </DialogHeader>
                {receivableToConfirmBaixa && (
                  <div className="space-y-2 text-sm">
                    <p>
                      Cliente:{' '}
                      <span className="font-semibold text-slate-900">
                        {receivableToConfirmBaixa.customer_name}
                      </span>
                    </p>
                    <p>Valor: {formatCurrency(receivableToConfirmBaixa.original_amount_cents ?? 0)}</p>
                    {receivableToConfirmBaixa.plate && <p>Placa: {receivableToConfirmBaixa.plate.toUpperCase()}</p>}
                  </div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setReceivableToConfirmBaixa(null)}
                    disabled={isBaixandoRecebivel}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (!receivableToConfirmBaixa) return;
                      baixaReceivableMutation.mutate(receivableToConfirmBaixa.id);
                    }}
                    disabled={isBaixandoRecebivel || !receivableToConfirmBaixa}
                  >
                    {isBaixandoRecebivel ? 'Processando...' : 'Confirmar baixa'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        {!appliedFilters ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-muted-foreground">
              Utilize os filtros acima e clique em <span className="font-semibold text-slate-700">Buscar</span> para carregar os dados.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Carregando dados...</span>
            </div>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
            <TabsList>
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="cash">Consulta de Caixas</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <SummaryCard title="Bruto" value={overallTotals.gross} variant="success" />
                <SummaryCard title="PIX" value={overallTotals.pix} />
                <SummaryCard title="Cartão" value={overallTotals.cartao} />
                <SummaryCard title="Despesas Variáveis" value={overallTotals.expensesVariable} variant="destructive" />
                <SummaryCard title="Líquido" value={overallTotals.net} variant="primary" />
                <SummaryCard title="Líquido após fixas" value={overallTotals.netAfterFixed} variant="accent" />
              </section>

              <Card>
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Resumo mensal</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Consolidação dos caixas e despesas fixas no período selecionado.
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        <TableHead>Bruto</TableHead>
                        <TableHead>PIX</TableHead>
                        <TableHead>Cartão</TableHead>
                        <TableHead>Despesas Variáveis</TableHead>
                        <TableHead>Líquido</TableHead>
                        <TableHead>Fixas</TableHead>
                        <TableHead>Líquido após fixas</TableHead>
                        <TableHead className="text-right">Detalhes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlySummary.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                            Nenhum dado encontrado para o período selecionado.
                          </TableCell>
                        </TableRow>
                      ) : (
                        monthlySummary.map((month) => {
                          const isActive = activeMonth === month.monthKey;
                          return (
                            <TableRow key={month.monthKey} className={isActive ? 'bg-slate-100/70' : undefined}>
                              <TableCell>{month.monthLabel}</TableCell>
                              <TableCell>{formatCurrency(month.gross)}</TableCell>
                              <TableCell>{formatCurrency(month.pix)}</TableCell>
                              <TableCell>{formatCurrency(month.cartao)}</TableCell>
                              <TableCell>{formatCurrency(month.expensesVariable)}</TableCell>
                              <TableCell>{formatCurrency(month.net)}</TableCell>
                              <TableCell>{formatCurrency(month.fixedExpenses)}</TableCell>
                              <TableCell>{formatCurrency(month.netAfterFixed)}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant={isActive ? 'default' : 'outline'}
                                  onClick={() => setActiveMonth(month.monthKey)}
                                >
                                  {isActive ? 'Selecionado' : 'Ver detalhes'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Despesas fixas mensais</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Edite ou inclua despesas fixas para cada mês. Os valores impactam o líquido após fixas.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingExpense(null);
                      setExpenseDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova despesa fixa
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="w-full md:w-auto">
                      <Input
                        value={fixedExpenseSearch}
                        onChange={(event) => setFixedExpenseSearch(event.target.value)}
                        placeholder="Buscar por nome, mês ou loja..."
                        className="md:min-w-[260px]"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Select value={fixedViewMode} onValueChange={(value) => setFixedViewMode(value as ListMode)}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder="Exibição" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top5">Top 5 maiores</SelectItem>
                          <SelectItem value="top10">Top 10 maiores</SelectItem>
                          <SelectItem value="highest">Todos (maior primeiro)</SelectItem>
                          <SelectItem value="lowest">Todos (menor primeiro)</SelectItem>
                          <SelectItem value="all">Todos (ordem atual)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        {displayedFixedExpenses.length} de {fixedExpensesForMonth.length}{' '}
                        {fixedExpensesForMonth.length === 1 ? 'despesa exibida' : 'despesas exibidas'}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mês</TableHead>
                          <TableHead>Loja</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayedFixedExpenses.length > 0 ? (
                          displayedFixedExpenses.map((expense) => {
                            const storeName = storeMap.get(expense.store_id) ?? 'Todas';
                            return (
                              <TableRow key={expense.id}>
                                <TableCell>{formatDate(expense.month_year, 'MMMM/yyyy')}</TableCell>
                                <TableCell>{storeName}</TableCell>
                                <TableCell>{expense.title}</TableCell>
                                <TableCell>{formatCurrency(expense.amount_cents)}</TableCell>
                                <TableCell className="text-right space-x-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingExpense(expense);
                                      setExpenseDialogOpen(true);
                                    }}
                                  >
                                    <Edit className="mr-1 h-4 w-4" />
                                    Editar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => deleteExpenseMutation.mutate(expense.id)}
                                  >
                                    <Trash2 className="mr-1 h-4 w-4" />
                                    Remover
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                              Nenhuma despesa fixa encontrada para a busca atual.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Despesas variáveis</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Consulte, edite ou cadastre despesas variáveis dentro dos caixas do período selecionado.
                    </p>
                  </div>
                  <Button
                    onClick={() => handleOpenVariableDialog(null)}
                    disabled={!cashBoxOptions.length}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova despesa variável
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <Input
                      value={variableExpenseSearch}
                      onChange={(event) => setVariableExpenseSearch(event.target.value)}
                      placeholder="Buscar por nome, loja, vistoriador ou data..."
                      className="md:min-w-[260px]"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <Select value={variableViewMode} onValueChange={(value) => setVariableViewMode(value as ListMode)}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder="Exibição" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top5">Top 5 maiores</SelectItem>
                          <SelectItem value="top10">Top 10 maiores</SelectItem>
                          <SelectItem value="highest">Todos (maior primeiro)</SelectItem>
                          <SelectItem value="lowest">Todos (menor primeiro)</SelectItem>
                          <SelectItem value="all">Todos (ordem atual)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        {displayedVariableExpenses.length} de {variableExpensesForMonth.length}{' '}
                        {variableExpensesForMonth.length === 1 ? 'despesa exibida' : 'despesas exibidas'}
                      </p>
                    </div>
                  </div>
                  {!activeMonth ? (
                    <p className="py-6 text-center text-muted-foreground">
                      Selecione um mês no resumo para visualizar as despesas variáveis.
                    </p>
                  ) : variableExpensesQuery.isLoading ? (
                    <div className="flex min-h-[120px] items-center justify-center text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Carregando despesas...
                    </div>
                  ) : variableExpensesForMonth.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {displayedVariableExpenses.map((expense) => {
                        const storeName = storeMap.get(expense.cash_box.store_id) ?? 'Loja';
                        const vistoriadorName = expense.cash_box.vistoriador?.name ?? null;
                        return (
                          <div
                            key={expense.id}
                            className="space-y-3 rounded-lg border border-slate-200 bg-white/70 p-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-xs uppercase text-muted-foreground">{storeName}</p>
                                <p className="text-sm font-semibold text-slate-900">
                                  {formatDate(expense.cash_box.date)} • {expense.cash_box.note ?? 'Sem descrição'}
                                </p>
                                {vistoriadorName && (
                                  <p className="text-xs text-muted-foreground">Vistoriador: {vistoriadorName}</p>
                                )}
                              </div>
                              <p className="text-sm font-semibold text-destructive">
                                {formatCurrency(expense.amount_cents)}
                              </p>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm text-slate-700">{expense.title}</p>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenVariableDialog(expense)}
                                >
                                  <Edit className="mr-1 h-4 w-4" />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => deleteVariableExpenseMutation.mutate(expense.id)}
                                >
                                  <Trash2 className="mr-1 h-4 w-4" />
                                  Remover
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="py-6 text-center text-muted-foreground">
                      Nenhuma despesa variável encontrada para a busca atual.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cash">
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <CardTitle>Caixas filtrados</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Pesquise por loja, vistoriador, descrição, entradas ou despesas.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <Input
                      value={cashSearchTerm}
                      onChange={(event) => setCashSearchTerm(event.target.value)}
                      placeholder="Buscar por nome, descrição, serviço ou despesa..."
                      className="md:min-w-[280px]"
                    />
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox
                          checked={showEntries}
                          onCheckedChange={(checked) => setShowEntries(Boolean(checked))}
                        />
                        Mostrar entradas
                      </label>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox
                          checked={showVariableExpenses}
                          onCheckedChange={(checked) => setShowVariableExpenses(Boolean(checked))}
                        />
                        Mostrar despesas variáveis
                      </label>
                      <span className="text-sm text-muted-foreground">
                        {filteredCashBoxes.length}{' '}
                        {filteredCashBoxes.length === 1 ? 'caixa encontrado' : 'caixas encontrados'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {filteredCashBoxes.length > 0 ? (
                    filteredCashBoxes.map(({ box, storeName, services, expenses }) => {
                      const totals = summarizeCashBoxes([box], []);
                      const summary = totals[0];

                      return (
                        <div
                          key={box.id}
                          className="rounded-lg border border-slate-200 p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm uppercase text-muted-foreground">{storeName}</p>
                              <p className="text-lg font-semibold text-slate-900">
                                {formatDate(box.date)} • {box.note ?? 'Sem descrição'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm">
                              <span>Bruto {summary ? formatCurrencyFromCents(summary.gross) : '-'}</span>
                              <span>PIX {summary ? formatCurrencyFromCents(summary.pix) : '-'}</span>
                              <span>Cartão {summary ? formatCurrencyFromCents(summary.cartao) : '-'}</span>
                              <span>Líquido {summary ? formatCurrencyFromCents(summary.net) : '-'}</span>
                            </div>
                          </div>

                          {showEntries && services.length > 0 && (
                            <div className="mt-4 space-y-3">
                              <p className="text-sm font-semibold text-slate-800">Entradas</p>
                              <div className="grid gap-2 md:grid-cols-2">
                                {services.map((service) => {
                                  const serviceName = service.service_types?.name ?? service.service_type_id;
                                  const totalValue = service.unit_price_cents * service.quantity;
                                  return (
                                    <div
                                      key={service.id}
                                      className="rounded-lg border border-slate-200 bg-white/70 p-3 shadow-sm"
                                    >
                                      <p className="text-sm font-semibold text-slate-800">{serviceName}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {service.quantity} × {formatCurrency(service.unit_price_cents)}
                                      </p>
                                      <p className="text-sm font-semibold text-slate-900 mt-1">
                                        {formatCurrency(totalValue)}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {showVariableExpenses && expenses.length > 0 && (
                            <div className="mt-4 space-y-3">
                              <p className="text-sm font-semibold text-slate-800">Despesas variáveis</p>
                              <div className="grid gap-2 md:grid-cols-2">
                                {expenses.map((expense) => (
                                  <div
                                    key={expense.id}
                                    className="rounded-lg border border-slate-200 bg-white/70 p-3 shadow-sm"
                                  >
                                    <p className="text-sm font-semibold text-slate-800">{expense.title}</p>
                                    <p className="text-sm text-destructive font-semibold">
                                      {formatCurrency(expense.amount_cents)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {!showEntries && !showVariableExpenses && (
                            <p className="mt-4 text-sm text-muted-foreground">
                              Ative pelo menos uma das opções acima para visualizar detalhes deste caixa.
                            </p>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="py-8 text-center text-muted-foreground">
                      Nenhum caixa encontrado para os filtros/termos atuais.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <VariableExpenseDialog
        open={isVariableDialogOpen}
        onOpenChange={(open) => {
          setVariableDialogOpen(open);
          if (!open) {
            setEditingVariableExpense(null);
          }
        }}
        cashBoxes={cashBoxOptions}
        expense={editingVariableExpense}
        onSubmit={handleVariableSubmit}
        isSaving={updateVariableExpenseMutation.isPending || createVariableExpenseMutation.isPending}
      />

      <ExpenseDialog
        open={isExpenseDialogOpen}
        onOpenChange={(open) => {
          setExpenseDialogOpen(open);
          if (!open) {
            setEditingExpense(null);
          }
        }}
        stores={stores}
        defaultStoreId={filters.storeId ?? undefined}
        onSubmit={(values) => {
          const payload = {
            id: editingExpense?.id,
            store_id: values.storeId,
            month_year: addDays(new Date(`${values.month}-01`), 0).toISOString(),
            title: values.title,
            amount_cents: values.amount,
          };
          upsertExpenseMutation.mutate(payload);
        }}
        expense={editingExpense}
        isSaving={upsertExpenseMutation.isPending}
      />
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: number;
  variant?: 'default' | 'success' | 'primary' | 'accent' | 'destructive';
}

function SummaryCard({ title, value, variant = 'default' }: SummaryCardProps) {
  const valueFormatted = formatCurrency(value);

  const variantClasses: Record<string, string> = {
    default: 'text-slate-900',
    success: 'text-emerald-600',
    primary: 'text-primary',
    accent: 'text-sky-600',
    destructive: 'text-destructive',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold ${variantClasses[variant]}`}>
          {valueFormatted}
        </p>
      </CardContent>
    </Card>
  );
}

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: Store[];
  defaultStoreId?: string;
  expense: FixedExpenseRecord | null;
  onSubmit: (values: { title: string; amount: number; storeId: string; month: string }) => void;
  isSaving: boolean;
}

function VariableExpenseDialog({
  open,
  onOpenChange,
  cashBoxes,
  expense,
  onSubmit,
  isSaving,
}: VariableExpenseDialogProps) {
  const form = useForm<VariableExpenseFormValues>({
    defaultValues: {
      cashBoxId: expense?.cash_box_id ?? '',
      title: expense?.title ?? '',
      amount: expense?.amount_cents ?? 0,
    },
  });

  useEffect(() => {
    form.reset({
      cashBoxId: expense?.cash_box_id ?? '',
      title: expense?.title ?? '',
      amount: expense?.amount_cents ?? 0,
    });
  }, [expense, form]);

  const handleSubmit: SubmitHandler<VariableExpenseFormValues> = (values) => {
    if (!values.cashBoxId) {
      toast.error('Selecione o caixa.');
      return;
    }
    onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar despesa variável' : 'Nova despesa variável'}</DialogTitle>
          <DialogDescription>
            Escolha o caixa, informe a descrição e o valor da despesa variável.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="space-y-2">
            <Label>Caixa</Label>
            <Select
              value={form.watch('cashBoxId')}
              onValueChange={(value) => form.setValue('cashBoxId', value)}
              disabled={Boolean(expense)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o caixa" />
              </SelectTrigger>
              <SelectContent>
                {cashBoxes.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input {...form.register('title')} placeholder="Despesa variável" />
          </div>
          <div className="space-y-2">
            <Label>Valor</Label>
            <Controller
              control={form.control}
              name="amount"
              render={({ field }) => (
                <MoneyInput
                  value={field.value ?? 0}
                  onChange={(value) => field.onChange(value)}
                  className="w-full"
                />
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving || (!expense && cashBoxes.length === 0)}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({
  open,
  onOpenChange,
  stores,
  defaultStoreId,
  expense,
  onSubmit,
  isSaving,
}: ExpenseDialogProps) {
  const form = useForm<ExpenseFormValues>({
    defaultValues: {
      title: expense?.title ?? '',
      amount: expense?.amount_cents ?? 0,
      storeId: expense?.store_id ?? defaultStoreId ?? '',
      month: expense ? expense.month_year.slice(0, 7) : defaultMonth(),
    },
  });

  useEffect(() => {
    form.reset({
      title: expense?.title ?? '',
      amount: expense?.amount_cents ?? 0,
      storeId: expense?.store_id ?? defaultStoreId ?? '',
      month: expense ? expense.month_year.slice(0, 7) : defaultMonth(),
    });
  }, [expense, defaultStoreId, form]);

  const handleSubmit: SubmitHandler<ExpenseFormValues> = (values) => {
    if (!values.month || !values.storeId) {
      toast.error('Informe a loja e o mês da despesa fixa.');
      return;
    }
    onSubmit({
      title: values.title,
      amount: values.amount,
      storeId: values.storeId,
      month: values.month,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar despesa fixa' : 'Nova despesa fixa'}</DialogTitle>
          <DialogDescription>
            Informe o mês, a loja, o nome e o valor da despesa fixa.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Loja</Label>
              <Select
                value={form.watch('storeId')}
                onValueChange={(value) => form.setValue('storeId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a loja" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mês</Label>
              <Input
                type="month"
                value={form.watch('month')}
                onChange={(event) => form.setValue('month', event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nome da despesa</Label>
            <Input {...form.register('title')} placeholder="Despesa" />
          </div>

          <div className="space-y-2">
            <Label>Valor</Label>
            <Controller
              control={form.control}
              name="amount"
              render={({ field }) => (
                <MoneyInput
                  value={field.value ?? 0}
                  onChange={(value) => field.onChange(value)}
                  className="w-full"
                />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function defaultMonth(): string {
  const now = new Date();
  const iso = formatISO(now, { representation: 'date' });
  return iso.slice(0, 7);
}
