import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Plus,
  DollarSign,
  LogOut,
  PenSquare,
  CheckCircle,
  BadgeCheck,
  BarChart3,
  Calendar,
  Menu,
} from 'lucide-react';
import type { Receivable, ServiceType } from '@/types/database';

interface ReceivableWithRelations extends Receivable {
  receivable_payments: {
    id: string;
    paid_on: string;
    amount_cents: number;
    method: 'pix' | 'cartao' | null;
  }[];
}

export default function Receber() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isMobile = useIsMobile();
  
  const [receivableSearch, setReceivableSearch] = useState('');
  const deferredReceivableSearch = useDeferredValue(receivableSearch);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        .limit(200);

      if (!isAdmin && user?.store_id) {
        query.eq('store_id', user.store_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ReceivableWithRelations[];
    },
    enabled: !!user,
  });

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

  const filteredReceivables = useMemo(() => {
    let filtered = activeReceivables;

    // Filtro de data
    if (startDate || endDate) {
      filtered = filtered.filter((receivable) => {
        if (!receivable.due_date) return false;
        if (startDate && receivable.due_date < startDate) return false;
        if (endDate && receivable.due_date > endDate) return false;
        return true;
      });
    }

    // Filtro de busca
    const term = deferredReceivableSearch.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((receivable) => {
        const serviceName = receivable.service_type_id
          ? serviceTypeMap.get(receivable.service_type_id)?.name ?? ''
          : '';
        const latestPayment = receivable.receivable_payments?.[0];

        const fields = [
          receivable.customer_name.toLowerCase(),
          receivable.plate?.toLowerCase() ?? '',
          serviceName.toLowerCase(),
        ];

        return fields.some((field) => field.includes(term));
      });
    }

    return filtered;
  }, [activeReceivables, deferredReceivableSearch, startDate, endDate, serviceTypeMap]);

  const invalidateReceivables = () => {
    queryClient.invalidateQueries({ queryKey: ['receivables', user?.store_id, user?.role] });
  };

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

  const SidebarContent = () => {
    const isAdminUser = isAdmin;
    const historicoPath = isAdminUser ? '/admin/historico' : '/historico';
    const dashboardPath = isAdminUser ? '/admin' : '/dashboard';
    const receberPath = isAdminUser ? '/admin/receber' : '/receber';

    return (
      <>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 md:px-6 md:py-5">
          <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 p-2 shadow-sm">
            <img src="/logo.png" alt="TOP Vistorias" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">TOP Vistorias</p>
            <p className="text-xs text-slate-500">{isAdminUser ? 'Administração' : 'A Receber'}</p>
          </div>
        </div>

        <div className="border-b border-slate-200 px-4 py-3 md:px-6 md:py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Usuário</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{user?.name}</p>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4 md:px-3">
          <button
            onClick={() => {
              navigate(dashboardPath);
              if (isMobile) setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <BarChart3 className="h-5 w-5" />
            Dashboard
          </button>
          <button
            onClick={() => {
              navigate(historicoPath);
              if (isMobile) setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <BarChart3 className="h-5 w-5" />
            Histórico
          </button>
          {isAdminUser ? (
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
          ) : (
            <button
              onClick={() => {
                navigate('/caixas/novo');
                if (isMobile) setSidebarOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Plus className="h-5 w-5" />
              Novo Caixa
            </button>
          )}
          <button
            onClick={() => {
              navigate(receberPath);
              if (isMobile) setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200"
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
  };

  return (
    <>
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
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">A Receber</h1>
            <p className="mt-1 text-sm text-slate-600">Gerencie pagamentos pendentes e acompanhe recebíveis</p>
          </div>

          {/* Filters */}
          <div className="rounded-2xl bg-white p-4 md:p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-4">
              <div className="flex-1">
                <Label className="text-xs font-medium text-slate-600">Buscar por nome ou placa</Label>
                <Input
                  value={receivableSearch}
                  onChange={(event) => setReceivableSearch(event.target.value)}
                  placeholder="Digite o nome do cliente ou placa..."
                  className="mt-2 h-10 rounded-lg border-slate-200"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-slate-600">Vencimento inicial</Label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-slate-600">Vencimento final</Label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <Button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setReceivableSearch('');
                }}
                variant="outline"
                className="h-10 rounded-lg"
              >
                Limpar Filtros
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-white p-4 md:p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h2 className="text-base md:text-lg font-semibold text-slate-900">
                {filteredReceivables.length} recebíve{filteredReceivables.length !== 1 ? 'is' : 'l'}
              </h2>
              <Badge variant="outline" className="text-xs w-fit">
                {activeReceivables.length} em aberto
              </Badge>
            </div>

            {isLoadingReceivables ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-cyan-600 border-t-transparent" />
                  <p className="text-sm text-slate-500">Carregando recebíveis...</p>
                </div>
              </div>
            ) : filteredReceivables.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-slate-500">
                Nenhum recebível encontrado
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Último pagamento</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReceivables.map((receivable) => {
                      const statusInfo = statusStyles[receivable.status];
                      const serviceName = receivable.service_type_id
                        ? serviceTypeMap.get(receivable.service_type_id)?.name ?? 'Serviço'
                        : 'Sem vínculo';
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
                          <TableCell className="text-right">
                            <div className="flex flex-wrap gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingReceivable(receivable);
                                setEditForm({
                                  customer_name: receivable.customer_name,
                                  plate: receivable.plate ?? '',
                                  original_amount_cents: receivable.original_amount_cents ?? 0,
                                  due_date: receivable.due_date ?? '',
                                  service_type_id: receivable.service_type_id ?? '',
                                });
                              }}
                              className="text-xs"
                            >
                              <PenSquare className="mr-1 h-3 w-3 md:h-4 md:w-4" />
                              <span className="hidden sm:inline">Editar</span>
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
                                className="text-xs"
                              >
                                <CheckCircle className="mr-1 h-3 w-3 md:h-4 md:w-4" />
                                <span className="hidden sm:inline">Marcar pago</span>
                              </Button>
                            )}
                            {isAdmin && receivable.status === 'pago_pendente_baixa' && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => setConfirmReceivable(receivable)}
                                className="text-xs"
                              >
                                <BadgeCheck className="mr-1 h-3 w-3 md:h-4 md:w-4" />
                                <span className="hidden sm:inline">Dar baixa</span>
                              </Button>
                            )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>

    {/* Dialogs */}
    <Dialog open={editingReceivable !== null} onOpenChange={(open) => !open && setEditingReceivable(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar recebível</DialogTitle>
          <DialogDescription>Atualize as informações deste cliente.</DialogDescription>
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
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Serviço relacionado</Label>
              <Select
                value={(editForm.service_type_id ?? '') === '' ? 'none' : (editForm.service_type_id as string)}
                onValueChange={(value) => handleEditChange('service_type_id', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
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
              <Label>Método</Label>
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
                  <SelectItem value="cartao">Cartão</SelectItem>
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
    </>
  );
}

