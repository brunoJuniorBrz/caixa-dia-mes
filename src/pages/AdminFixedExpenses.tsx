import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { MoneyInput } from '@/components/MoneyInput';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  deleteFixedExpense,
  fetchFixedExpenses,
  fetchStores,
  upsertFixedExpense,
} from '@/features/admin/api';
import type { FixedExpenseRecord } from '@/features/admin/types';
import { formatCurrencyFromCents } from '@/features/admin/utils';
import type { Store } from '@/types/database';
import {
  BarChart3,
  Calendar,
  ClipboardList,
  DollarSign,
  Loader2,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

const DEFAULT_MONTH = format(new Date(), 'yyyy-MM');

interface FormState {
  id: string | null;
  storeId: string;
  month: string;
  title: string;
  amount_cents: number;
}

function parseMonthInput(month: string) {
  if (!month) return null;
  const date = parse(`${month}-01`, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function monthRangeFrom(month: string | null) {
  if (!month) return null;
  const parsed = parseMonthInput(month);
  if (!parsed) return null;
  const startDate = format(startOfMonth(parsed), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(parsed), 'yyyy-MM-dd');
  const label = format(parsed, "MMMM 'de' yyyy", { locale: ptBR });
  return { startDate, endDate, label };
}

function toMonthInput(value: string) {
  if (!value) return '';
  try {
    return format(parseISO(value), 'yyyy-MM');
  } catch {
    return value.slice(0, 7);
  }
}

function formatMonthLabel(value: string) {
  if (!value) return 'Sem data';
  try {
    return format(parseISO(value), "MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return value;
  }
}

export default function AdminFixedExpenses() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<string | 'all'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(DEFAULT_MONTH);
  const [searchTerm, setSearchTerm] = useState('');
  const [formState, setFormState] = useState<FormState>({
    id: null,
    storeId: '',
    month: DEFAULT_MONTH,
    title: '',
    amount_cents: 0,
  });

  const { data: stores = [], isLoading: isLoadingStores } = useQuery<Store[]>({
    queryKey: ['admin-stores'],
    queryFn: fetchStores,
  });

  useEffect(() => {
    if (formState.id) return;
    if (selectedStore !== 'all') {
      setFormState((prev) => ({ ...prev, storeId: selectedStore }));
      return;
    }
    if (!formState.storeId && stores.length > 0) {
      setFormState((prev) => ({ ...prev, storeId: stores[0].id }));
    }
  }, [selectedStore, stores, formState.id, formState.storeId]);

  useEffect(() => {
    if (formState.id) return;
    setFormState((prev) => ({
      ...prev,
      month: selectedMonth || prev.month,
    }));
  }, [selectedMonth, formState.id]);

  const storeIdFilter = selectedStore === 'all' ? null : selectedStore;
  const monthRange = useMemo(() => monthRangeFrom(selectedMonth), [selectedMonth]);

  const { data: fixedExpenses = [], isLoading: isLoadingExpenses } = useQuery<
    FixedExpenseRecord[]
  >({
    queryKey: ['admin-fixed-expenses', storeIdFilter, monthRange?.startDate, monthRange?.endDate],
    queryFn: () =>
      fetchFixedExpenses({
        storeId: storeIdFilter ?? null,
        startDate: monthRange?.startDate ?? '',
        endDate: monthRange?.endDate ?? '',
      }),
    enabled: Boolean(monthRange),
  });

  const upsertExpense = useMutation({
    mutationFn: upsertFixedExpense,
    onSuccess: () => {
      toast.success(formState.id ? 'Conta fixa atualizada.' : 'Conta fixa adicionada.');
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['admin-fixed-expenses'] });
    },
    onError: (error: unknown) => {
      console.error('Erro ao salvar conta fixa:', error);
      toast.error('Não foi possível salvar a conta fixa.');
    },
  });

  const deleteExpense = useMutation({
    mutationFn: deleteFixedExpense,
    onSuccess: () => {
      toast.success('Conta fixa excluída.');
      void queryClient.invalidateQueries({ queryKey: ['admin-fixed-expenses'] });
    },
    onError: (error: unknown) => {
      console.error('Erro ao excluir conta fixa:', error);
      toast.error('Não foi possível excluir a conta fixa.');
    },
  });

  const storeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach((store) => map.set(store.id, store.name));
    return map;
  }, [stores]);

  const filteredExpenses = useMemo(() => {
    if (!searchTerm.trim()) return fixedExpenses;
    const normalized = searchTerm.trim().toLowerCase();
    return fixedExpenses.filter((expense) => {
      const titleMatch = expense.title.toLowerCase().includes(normalized);
      const storeName = storeNameMap.get(expense.store_id)?.toLowerCase() ?? '';
      return titleMatch || storeName.includes(normalized);
    });
  }, [fixedExpenses, searchTerm, storeNameMap]);

  const totalForPeriod = useMemo(
    () => fixedExpenses.reduce((acc, expense) => acc + (expense.amount_cents ?? 0), 0),
    [fixedExpenses],
  );

  const isEditing = Boolean(formState.id);
  const canSubmit =
    Boolean(formState.storeId) &&
    Boolean(formState.month) &&
    Boolean(formState.title.trim()) &&
    formState.amount_cents > 0;

  function resetForm() {
    setFormState({
      id: null,
      storeId:
        selectedStore !== 'all'
          ? selectedStore
          : stores.length > 0
            ? stores[0].id
            : '',
      month: selectedMonth || DEFAULT_MONTH,
      title: '',
      amount_cents: 0,
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    const monthPayload = `${formState.month}-01`;
    upsertExpense.mutate({
      id: formState.id ?? undefined,
      store_id: formState.storeId,
      month_year: monthPayload,
      title: formState.title.trim(),
      amount_cents: formState.amount_cents,
    });
  }

  function handleEdit(expense: FixedExpenseRecord) {
    setFormState({
      id: expense.id,
      storeId: expense.store_id,
      month: toMonthInput(expense.month_year),
      title: expense.title,
      amount_cents: expense.amount_cents ?? 0,
    });
  }

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
        <p className="mt-1 text-sm font-medium text-slate-900">{user?.name ?? 'Admin'}</p>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4 md:px-3">
        <button
          onClick={() => {
            navigate('/admin');
            if (isMobile) setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
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
            navigate('/admin/contas-fixas');
            if (isMobile) setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200"
        >
          <ClipboardList className="h-5 w-5" />
          Contas fixas
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
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 bg-white">
        <SidebarContent />
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-full flex-col bg-white">
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-50 md:hidden bg-[#f5f5f7] border-b border-slate-200 px-4 py-3">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>
        </div>

        <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Contas fixas</h1>
              <p className="mt-1 text-sm text-slate-600">
                Cadastre, edite e acompanhe as despesas fixas utilizadas no fechamento mensal.
              </p>
            </div>
          </div>

          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-4 md:gap-6 md:p-6">
              <div className="space-y-2">
                <Label htmlFor="store-filter">Loja</Label>
                <Select
                  value={selectedStore}
                  onValueChange={(value) => setSelectedStore(value)}
                  disabled={isLoadingStores}
                >
                  <SelectTrigger id="store-filter">
                    <SelectValue placeholder="Todas as lojas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as lojas</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="month-filter">Competência</Label>
                <Input
                  id="month-filter"
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="search-filter">Busca</Label>
                <Input
                  id="search-filter"
                  placeholder="Nome da conta ou loja"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total planejado {monthRange ? `(${monthRange.label})` : ''}
                </p>
                <p className="text-2xl font-semibold text-slate-900">
                  {formatCurrencyFromCents(totalForPeriod)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle>{isEditing ? 'Editar conta fixa' : 'Adicionar nova conta fixa'}</CardTitle>
              <p className="text-sm text-slate-500">
                Informe a loja, mês de competência, descrição e valor da despesa fixa.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Loja</Label>
                    <Select
                      value={formState.storeId}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          storeId: value,
                        }))
                      }
                      disabled={isLoadingStores || stores.length === 0}
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
                    <Label>Competência</Label>
                    <Input
                      type="month"
                      value={formState.month}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          month: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={formState.title}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Ex.: Aluguel, Contador..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Valor</Label>
                    <MoneyInput
                      value={formState.amount_cents}
                      onChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          amount_cents: value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {isEditing && (
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancelar edição
                    </Button>
                  )}
                  <Button type="submit" disabled={!canSubmit || upsertExpense.isPending}>
                    {upsertExpense.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    )}
                    {isEditing ? 'Atualizar conta' : 'Adicionar conta'}
                    {!upsertExpense.isPending &&
                      (isEditing ? (
                        <Pencil className="ml-2 h-4 w-4" />
                      ) : (
                        <Plus className="ml-2 h-4 w-4" />
                      ))}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Contas cadastradas</CardTitle>
                <p className="text-sm text-slate-500">
                  {filteredExpenses.length} conta(s) encontrada(s) no período selecionado.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingExpenses ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                </div>
              ) : filteredExpenses.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Nenhuma conta fixa encontrada para os filtros selecionados.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Loja</TableHead>
                        <TableHead>Competência</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell className="font-medium">{expense.title}</TableCell>
                          <TableCell>{storeNameMap.get(expense.store_id) ?? 'Loja'}</TableCell>
                          <TableCell>{formatMonthLabel(expense.month_year)}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-900">
                            {formatCurrencyFromCents(expense.amount_cents ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEdit(expense)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir conta fixa</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Essa ação não pode ser desfeita. Deseja remover{' '}
                                      <span className="font-medium text-slate-900">
                                        {expense.title}
                                      </span>{' '}
                                      da competência {formatMonthLabel(expense.month_year)}?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={deleteExpense.isPending}>
                                      Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteExpense.mutate(expense.id)}
                                      disabled={deleteExpense.isPending}
                                    >
                                      {deleteExpense.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      )}
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
