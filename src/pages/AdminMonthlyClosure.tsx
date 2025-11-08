import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { format, parse } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MoneyInput } from '@/components/MoneyInput';
import { Loader2, Plus, Trash2, ClipboardList, LogOut, Calendar, BarChart3, DollarSign, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/money';
import { fetchStores, fetchMonthlyClosure, upsertMonthlyClosure, deleteMonthlyClosure } from '@/features/admin/api';
import type { Store } from '@/types/database';
import type { MonthlyClosureData, MonthlyClosurePayload } from '@/features/admin/types';
import { SERVICE_BADGE_CLASSNAME, SERVICE_ICON_MAP } from '@/features/cash-box/constants';

const MONTH_PLACEHOLDER = 'Selecione um mês';

interface VariableExpenseDraft {
  id?: string;
  title: string;
  amount_cents: number;
  source?: string;
}

function parseMonth(month: string): Date {
  return parse(`${month}-01`, 'yyyy-MM-dd', new Date());
}

export default function AdminMonthlyClosure() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();

  const [selectedStore, setSelectedStore] = useState<string | 'all'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [serviceQuantities, setServiceQuantities] = useState<Record<string, number>>({});
  const [variableExpenses, setVariableExpenses] = useState<VariableExpenseDraft[]>([]);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState<VariableExpenseDraft>({ title: '', amount_cents: 0, source: 'avulsa' });
  const [editingExpenseIndex, setEditingExpenseIndex] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const monthLabel = useMemo(() => {
    if (!selectedMonth) return MONTH_PLACEHOLDER;
    const date = parseMonth(selectedMonth);
    if (Number.isNaN(date.getTime())) return MONTH_PLACEHOLDER;
    return format(date, "MMMM 'de' yyyy");
  }, [selectedMonth]);

  const { data: stores = [], isLoading: isLoadingStores } = useQuery<Store[]>({
    queryKey: ['admin-stores'],
    queryFn: fetchStores,
  });

  const storeId = selectedStore === 'all' ? null : selectedStore;

  const { data: closureData, isLoading: isLoadingClosure } = useQuery<MonthlyClosureData>({
    queryKey: ['admin-monthly-closure', storeId, selectedMonth, user?.id],
    queryFn: () => fetchMonthlyClosure({ storeId, month: selectedMonth }),
    enabled: Boolean(storeId && selectedMonth && user),
  });

  const upsertClosure = useMutation({
    mutationFn: (payload: MonthlyClosurePayload) => upsertMonthlyClosure(payload),
    onSuccess: () => {
      toast.success('Fechamento mensal salvo com sucesso.');
      void queryClient.invalidateQueries({
        queryKey: ['admin-monthly-closure', storeId, selectedMonth, user?.id],
      });
    },
    onError: (error: unknown) => {
      console.error('Erro ao salvar fechamento mensal:', error);
      toast.error('Não foi possível salvar o fechamento mensal.');
    },
  });

  const deleteClosureMutation = useMutation({
    mutationFn: (cashBoxId: string) => deleteMonthlyClosure(cashBoxId),
    onSuccess: () => {
      toast.success('Fechamento mensal excluído.');
      setShowDeleteDialog(false);
      setServiceQuantities({});
      setVariableExpenses([]);
      resetExpenseDraft();
      setEditingExpenseIndex(null);
      void queryClient.invalidateQueries({
        queryKey: ['admin-monthly-closure', storeId, selectedMonth, user?.id],
      });
    },
    onError: (error: unknown) => {
      console.error('Erro ao excluir fechamento mensal:', error);
      toast.error('Não foi possível excluir o fechamento.');
    },
  });

  useEffect(() => {
    if (!closureData) {
      setServiceQuantities({});
      setVariableExpenses([]);
      setEditingExpenseIndex(null);
      setExpenseDraft({ title: '', amount_cents: 0, source: 'avulsa' });
      return;
    }

    const quantities = closureData.services.reduce<Record<string, number>>((acc, service) => {
      acc[service.service_type_id] = service.quantity;
      return acc;
    }, {});

    setServiceQuantities(quantities);

    const shouldUseDefaults =
      !closureData.cashBoxId &&
      closureData.defaultExpenses.length > 0 &&
      closureData.expenses.length === 0;

    const expensesSource = shouldUseDefaults ? closureData.defaultExpenses : closureData.expenses;

    setVariableExpenses(
      expensesSource.map((expense) => ({
        id: expense.id,
        title: expense.title,
        amount_cents: expense.amount_cents,
        source: expense.source ?? 'avulsa',
      })),
    );
    setEditingExpenseIndex(null);
    setExpenseDraft({ title: '', amount_cents: 0, source: 'avulsa' });
  }, [closureData]);

  const handleQuantityChange = (serviceId: string, quantity: number) => {
    const normalized = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
    setServiceQuantities((prev) => ({
      ...prev,
      [serviceId]: normalized,
    }));
  };

  const resetExpenseDraft = () => setExpenseDraft({ title: '', amount_cents: 0, source: 'avulsa' });

  const handleRemoveExpense = (index: number) => {
    setVariableExpenses((prev) => prev.filter((_, idx) => idx !== index));
    if (editingExpenseIndex === index) {
      setEditingExpenseIndex(null);
      resetExpenseDraft();
      setShowExpenseDialog(false);
    }
  };

  const handleOpenExpenseDialog = (index: number | null = null) => {
    if (index === null) {
      setEditingExpenseIndex(null);
      resetExpenseDraft();
    } else {
      const target = variableExpenses[index];
      if (target) {
        setExpenseDraft({
          id: target.id,
          title: target.title,
          amount_cents: target.amount_cents,
          source: target.source ?? 'avulsa',
        });
        setEditingExpenseIndex(index);
      }
    }
    setShowExpenseDialog(true);
  };

  const handlePersistExpense = () => {
    if (!expenseDraft.title.trim() || expenseDraft.amount_cents <= 0) {
      toast.error('Informe título e valor maior que zero.');
      return;
    }

    if (editingExpenseIndex !== null) {
      setVariableExpenses((prev) =>
        prev.map((expense, idx) =>
          idx === editingExpenseIndex
            ? {
                ...expense,
                title: expenseDraft.title.trim(),
                amount_cents: expenseDraft.amount_cents,
                source: expenseDraft.source ?? expense.source,
              }
            : expense,
        ),
      );
    } else {
      setVariableExpenses((prev) => [
        ...prev,
        {
          id: expenseDraft.id,
          title: expenseDraft.title.trim(),
          amount_cents: expenseDraft.amount_cents,
          source: expenseDraft.source ?? 'avulsa',
        },
      ]);
    }

    resetExpenseDraft();
    setEditingExpenseIndex(null);
    setShowExpenseDialog(false);
  };

  const handleSave = () => {
    if (!storeId) {
      toast.error('Selecione uma loja para continuar.');
      return;
    }
    if (!selectedMonth) {
      toast.error('Selecione o mês para continuar.');
      return;
    }
    if (!user) {
      toast.error('Usuário não autenticado.');
      return;
    }

    const payload: MonthlyClosurePayload = {
      storeId,
      month: selectedMonth,
      userId: user.id,
      services: Object.entries(serviceQuantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([serviceTypeId, quantity]) => ({
          service_type_id: serviceTypeId,
          quantity,
        })),
      expenses: variableExpenses.filter((expense) => expense.title.trim() && expense.amount_cents > 0),
    };

    upsertClosure.mutate(payload);
  };

  const handleConfirmDelete = () => {
    if (!closureData?.cashBoxId) return;
    deleteClosureMutation.mutate(closureData.cashBoxId);
  };

  const services = closureData?.serviceCatalog ?? [];
  const totalServicesCents = services.reduce((acc, service) => {
    const quantity = serviceQuantities[service.id] ?? 0;
    return acc + quantity * service.default_price_cents;
  }, 0);
  const totalExpensesCents = variableExpenses.reduce((acc, expense) => acc + expense.amount_cents, 0);
  const netTotalCents = totalServicesCents - totalExpensesCents;
  const defaultExpensesCount = closureData?.defaultExpenses.length ?? 0;
  const hasLoadedDefaultExpenses = !closureData?.cashBoxId && defaultExpensesCount > 0;
  const canDeleteClosure = Boolean(closureData?.cashBoxId);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
          <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 p-2 shadow-sm">
            <img src="/logo.png" alt="TOP Vistorias" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">TOP Vistorias</p>
            <p className="text-xs text-slate-500">Fechamento</p>
          </div>
        </div>

        <div className="border-b border-slate-200 px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Usuário</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{user?.name || user?.email || 'Usuário'}</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <button
            onClick={() => navigate('/admin')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <BarChart3 className="h-5 w-5" />
            Dashboard
          </button>
          <button
            onClick={() => navigate('/admin/historico')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <BarChart3 className="h-5 w-5" />
            Histórico
          </button>
          <button
            onClick={() => navigate('/admin/fechamento')}
            className="flex w-full items-center gap-3 rounded-lg bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200"
          >
            <Calendar className="h-5 w-5" />
            Fechamento Mensal
          </button>
          <button
            onClick={() => navigate('/admin/receber')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <DollarSign className="h-5 w-5" />
            A Receber
          </button>
        </nav>

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
        <div className="mx-auto max-w-5xl space-y-6 p-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Fechamento Mensal</h1>
              <p className="mt-1 text-sm text-slate-600">
                Lance quantidades dos serviços e despesas variáveis para meses anteriores sem fechar.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Mês selecionado</span>
              <p className="mt-1 text-sm font-semibold text-slate-900">{monthLabel}</p>
            </div>
          </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuração</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Loja</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore} disabled={isLoadingStores}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a loja" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" disabled>
                    Selecione
                  </SelectItem>
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
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                max="2100-12"
              />
            </div>
            <div className="space-y-2">
              <Label>Totais</Label>
              <div className="rounded-md border bg-muted/50 p-3">
                <p className="text-sm">
                  Serviços: <span className="font-semibold">{formatCurrency(totalServicesCents)}</span>
                </p>
                <p className="text-sm">
                  Despesas: <span className="font-semibold">{formatCurrency(totalExpensesCents)}</span>
                </p>
                <p className="text-sm">
                  Resultado:{' '}
                  <span className={`font-semibold ${netTotalCents >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(netTotalCents)}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {(!storeId || !selectedMonth) && (
          <div className="rounded-md border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            Selecione a loja e o mês para carregar os serviços disponíveis.
          </div>
        )}

        {storeId && selectedMonth && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Serviços do fechamento</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingClosure ? (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Carregando serviços...
                  </div>
                ) : services.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhum tipo de serviço cadastrado.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {services.map((service) => {
                      const quantity = serviceQuantities[service.id] ?? 0;
                      const total = quantity * service.default_price_cents;
                      const Icon =
                        SERVICE_ICON_MAP[service.code as keyof typeof SERVICE_ICON_MAP] ?? ClipboardList;

                      return (
                        <div
                          key={service.id}
                          className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100">
                                <Icon className="h-4 w-4 text-slate-600" />
                              </span>
                              <div>
                                <span className={SERVICE_BADGE_CLASSNAME}>{service.code}</span>
                                <p className="text-xs font-semibold text-slate-800">{service.name}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] uppercase text-muted-foreground">Total</p>
                              <p className="text-sm font-semibold text-slate-900">
                                {formatCurrency(total)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <p className="text-[11px] text-muted-foreground">Valor unitário</p>
                              <p className="text-xs font-semibold text-slate-900">
                                {formatCurrency(service.default_price_cents)}
                              </p>
                            </div>
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              className="h-9 w-20 rounded border-slate-200 text-center text-sm"
                              value={quantity}
                              onChange={(event) => {
                                const nextValue = Number.parseInt(event.target.value, 10);
                                handleQuantityChange(service.id, Number.isNaN(nextValue) ? 0 : nextValue);
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Despesas variáveis do mês</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Valores lançados aqui serão vinculados ao fechamento mensal manual.
                  </p>
                </div>
                <Button type="button" onClick={() => handleOpenExpenseDialog(null)} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar despesa
                </Button>
              </CardHeader>
              <CardContent>
                {hasLoadedDefaultExpenses && (
                  <div className="mb-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    Carregamos automaticamente {defaultExpensesCount} despesas cadastradas para {monthLabel}. Revise, ajuste ou exclua antes de salvar.
                  </div>
                )}
                {variableExpenses.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhuma despesa lançada para este mês.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {variableExpenses.map((expense, index) => (
                      <div
                        key={expense.id ?? `${expense.title}-${index}`}
                        className="flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{expense.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(expense.amount_cents)}
                          </p>
                          {expense.source === 'fixa' && (
                            <span className="mt-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              Despesa fixa
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-slate-600 hover:text-slate-900"
                            onClick={() => handleOpenExpenseDialog(index)}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveExpense(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {canDeleteClosure && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={deleteClosureMutation.isPending || upsertClosure.isPending}
                >
                  {deleteClosureMutation.isPending ? 'Excluindo...' : 'Excluir fechamento'}
                </Button>
              )}
              <Button
                type="button"
                onClick={handleSave}
                disabled={upsertClosure.isPending || isLoadingClosure || !services.length}
              >
                {upsertClosure.isPending ? 'Salvando...' : 'Salvar fechamento mensal'}
              </Button>
            </div>
          </>
        )}

        <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar despesa variável</DialogTitle>
              <DialogDescription>Informe os dados da despesa do mês selecionado.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={expenseDraft.title}
                  onChange={(event) => setExpenseDraft((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Ex: Serviços externos"
                />
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <MoneyInput
                  value={expenseDraft.amount_cents}
                  onChange={(value) => setExpenseDraft((prev) => ({ ...prev, amount_cents: value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handlePersistExpense}>Adicionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir fechamento</DialogTitle>
              <DialogDescription>Essa acao remove o fechamento do mes selecionado e permite refazer os lancamentos.</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-slate-600">Tem certeza que deseja excluir o fechamento de {monthLabel}? Essa acao nao pode ser desfeita.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteClosureMutation.isPending}>
                {deleteClosureMutation.isPending ? 'Excluindo...' : 'Excluir fechamento'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </main>
    </div>
  );
}




