import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Controller, FormProvider, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoneyInput } from '@/components/MoneyInput';
import { Loader2, Smartphone, CreditCard, Trash2, ClipboardList } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cashBoxSchema, cashBoxDefaultValues, type CashBoxFormData } from '@/schemas/cash-box';
import { formatCurrency } from '@/lib/money';
import { getTodayISO } from '@/lib/date';
import { SERVICE_BADGE_CLASSNAME, SERVICE_ICON_MAP } from '../constants';
import {
  buildOrderedServiceTypes,
  calculateCashBoxTotals,
  mapCashBoxToFormData,
  normalizeCashBoxFormData,
} from '../utils';
import {
  createCashBox,
  deleteCashBox,
  fetchCashBox,
  fetchServiceTypes,
  updateCashBox,
} from '../api';
import type { CashBoxTotals } from '../types';
import type { ServiceType } from '@/types/database';

interface CashBoxFormProps {
  mode: 'create' | 'edit';
  cashBoxId?: string;
  returnTo?: string;
  returnFilters?: {
    startDate?: string;
    endDate?: string;
    search?: string;
  };
}

const EMPTY_TOTALS: CashBoxTotals = {
  gross: 0,
  electronicTotal: 0,
  net: 0,
  cash: 0,
  expensesTotal: 0,
  receivablesTotal: 0,
  pix: 0,
  cartao: 0,
  returnQuantity: 0,
};

export function CashBoxForm({ mode, cashBoxId, returnTo, returnFilters }: CashBoxFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const form = useForm<CashBoxFormData>({
    resolver: zodResolver(cashBoxSchema),
    defaultValues: cashBoxDefaultValues,
    mode: 'onChange',
  });

  const expensesFieldArray = useFieldArray({
    control: form.control,
    name: 'expenses',
  });

  const receivablesFieldArray = useFieldArray({
    control: form.control,
    name: 'receivables',
  });

  const {
    data: serviceTypes = [],
    isLoading: isLoadingServiceTypes,
    isError: isServiceTypesError,
  } = useQuery({
    queryKey: ['service-types'],
    queryFn: fetchServiceTypes,
    staleTime: 1000 * 60 * 15,
  });

  const {
    data: cashBoxData,
    isLoading: isLoadingCashBox,
    isError: isCashBoxError,
  } = useQuery({
    queryKey: ['cash-box', cashBoxId],
    queryFn: () => fetchCashBox(cashBoxId!),
    enabled: mode === 'edit' && Boolean(cashBoxId),
  });

  const normalizedValues = useMemo(() => {
    if (!serviceTypes.length) return null;

    if (mode === 'edit') {
      if (!cashBoxData) return null;
      return mapCashBoxToFormData(cashBoxData, serviceTypes);
    }

    return normalizeCashBoxFormData({
      serviceTypes,
      data: cashBoxDefaultValues,
    });
  }, [mode, serviceTypes, cashBoxData]);

  const normalizedValuesKey = normalizedValues ? JSON.stringify(normalizedValues) : null;
  const lastAppliedDefaults = useRef<string | null>(null);

  useEffect(() => {
    if (!normalizedValues || !normalizedValuesKey) return;
    if (normalizedValuesKey === lastAppliedDefaults.current) return;
    form.reset(normalizedValues);
    lastAppliedDefaults.current = normalizedValuesKey;
    void form.trigger();
  }, [form, normalizedValues, normalizedValuesKey]);

  const services = useWatch({
    control: form.control,
    name: 'services',
    defaultValue: cashBoxDefaultValues.services,
  });
  const servicesByTypeId = useMemo(() => {
    const map = new Map<string, { index: number; service: CashBoxFormData['services'][number] }>();
    (services ?? []).forEach((service, index) => {
      if (!service?.service_type_id) {
        return;
      }
      map.set(service.service_type_id, { index, service });
    });
    return map;
  }, [services]);
  const electronicEntries = useWatch({
    control: form.control,
    name: 'electronicEntries',
    defaultValue: cashBoxDefaultValues.electronicEntries,
  });
  const expenses = useWatch({
    control: form.control,
    name: 'expenses',
    defaultValue: cashBoxDefaultValues.expenses,
  });
  const receivables = useWatch({
    control: form.control,
    name: 'receivables',
    defaultValue: cashBoxDefaultValues.receivables,
  });

  const orderedServiceTypes = useMemo(
    () => buildOrderedServiceTypes(serviceTypes),
    [serviceTypes],
  );

  const totals = orderedServiceTypes.length
    ? calculateCashBoxTotals({
        services: services ?? [],
        electronicEntries: electronicEntries ?? [],
        expenses: expenses ?? [],
        receivables: receivables ?? [],
        serviceTypes: orderedServiceTypes,
      })
    : EMPTY_TOTALS;

  const mutation = useMutation({
    mutationFn: async (values: CashBoxFormData) => {
      if (!user?.store_id || !user?.id) {
        throw new Error('Usuário sem loja configurada.');
      }

      if (mode === 'create') {
        return createCashBox({
          data: values,
          storeId: user.store_id,
          vistoriadorId: user.id,
        });
      }

      if (!cashBoxId) {
        throw new Error('Caixa não encontrado.');
      }

      return updateCashBox({
        cashBoxId,
        data: values,
        storeId: user.store_id,
        vistoriadorId: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['cash-boxes-history'] });
      if (cashBoxId) {
        queryClient.invalidateQueries({ queryKey: ['cash-box', cashBoxId] });
      }
      toast.success(
        mode === 'create' ? 'Caixa criado com sucesso!' : 'Caixa atualizado com sucesso!',
      );
      if (returnTo) {
        navigate(returnTo, { state: { filters: returnFilters } });
      } else {
        navigate('/dashboard');
      }
    },
    onError: (error) => {
      console.error('Erro ao salvar caixa:', error);
      const message =
        error instanceof Error ? error.message : 'Não foi possível salvar o caixa.';
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!cashBoxId) {
        throw new Error('Caixa não encontrado.');
      }
      await deleteCashBox(cashBoxId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['cash-boxes-history'] });
      toast.success('Caixa excluído com sucesso.');
      if (returnTo) {
        navigate(returnTo, { state: { filters: returnFilters } });
      } else {
        navigate('/dashboard');
      }
    },
    onError: (error) => {
      console.error('Erro ao excluir caixa:', error);
      const message =
        error instanceof Error ? error.message : 'Não foi possível excluir o caixa.';
      toast.error(message);
    },
  });

  const isLoading = isLoadingServiceTypes || (mode === 'edit' && isLoadingCashBox);

  if (isLoading) {
    return <LoadingState />;
  }

  if (isServiceTypesError || (mode === 'edit' && isCashBoxError)) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-destructive">
          Não foi possível carregar as informações do caixa.
        </p>
        <p className="text-sm text-slate-600">
          Recarregue a página ou tente novamente mais tarde.
        </p>
      </div>
    );
  }

  if (mode === 'edit' && !cashBoxData) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-lg border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <p className="text-xl font-semibold text-slate-800">Caixa não encontrado</p>
        <p className="text-sm text-slate-600">
          O caixa solicitado pode ter sido removido. Volte para o dashboard e selecione outro
          registro.
        </p>
        <Button variant="outline" onClick={() => {
          if (returnTo) {
            navigate(returnTo, { state: { filters: returnFilters } });
          } else {
            navigate('/dashboard');
          }
        }}>
          {returnTo ? 'Voltar' : 'Voltar ao dashboard'}
        </Button>
      </div>
    );
  }

  const handleAddExpense = () => {
    expensesFieldArray.append({ title: '', amount_cents: 0 });
  };

  const handleRemoveExpense = (index: number) => {
    expensesFieldArray.remove(index);
  };

  const handleAddReceivable = () => {
    receivablesFieldArray.append({
      customer_name: '',
      plate: '',
      service_type_id: '',
      original_amount_cents: 0,
      due_date: getTodayISO(),
    });
  };

  const handleRemoveReceivable = (index: number) => {
    receivablesFieldArray.remove(index);
  };

  const handleQuantityChange = (index: number, value: string) => {
    if (index < 0) return;
    const parsed = Number.parseInt(value, 10);
    const quantity = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
    form.setValue(`services.${index}.quantity`, quantity, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleCancel = () => {
    if (returnTo) {
      navigate(returnTo, { state: { filters: returnFilters } });
    } else {
      navigate('/dashboard');
    }
  };

  const isSubmitting = mutation.isPending;
  const isDeleting = deleteMutation.isPending;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="mx-auto w-full max-w-7xl space-y-6 pb-12"
      >
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-slate-900">
              {mode === 'create' ? 'Novo Caixa' : 'Editar Caixa'}
            </h1>
            <p className="text-sm text-slate-600">
              Preencha os dados para {mode === 'create' ? 'registrar' : 'atualizar'} o fechamento do
              dia.
            </p>
          </div>

          {mode === 'edit' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="flex items-center gap-2 border-destructive text-destructive hover:bg-destructive/10"
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir Caixa
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deseja excluir este caixa?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Essa ação removerá o registro do caixa. As entradas e despesas relacionadas serão
                    excluídas automaticamente. Essa operação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={isDeleting}
                    onClick={() => deleteMutation.mutate()}
                  >
                    {isDeleting ? 'Excluindo...' : 'Excluir caixa'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </header>

        <Card>
          <CardHeader className="space-y-1 border-b border-slate-100">
            <CardTitle className="text-lg">Informações gerais</CardTitle>
            <CardDescription>Defina a data do caixa e uma observação para identificação.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cash-box-date">Data</Label>
              <Input
                id="cash-box-date"
                type="date"
                {...form.register('date')}
              />
              {form.formState.errors.date && (
                <p className="text-sm text-destructive">{form.formState.errors.date.message}</p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cash-box-note">Descrição</Label>
              <Input
                id="cash-box-note"
                placeholder="Identifique o caixa (ex: Vistoriador João)"
                {...form.register('note')}
              />
              {form.formState.errors.note && (
                <p className="text-sm text-destructive">{form.formState.errors.note.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Entradas</CardTitle>
              <CardDescription>Registre os serviços realizados para compor o valor bruto.</CardDescription>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-2 text-right">
              <p className="text-xs font-semibold uppercase text-sky-700">Total de Entradas</p>
              <p className="text-xl font-semibold text-sky-700">{formatCurrency(totals.gross)}</p>
              <p className="text-xs text-slate-600">Retornos: {totals.returnQuantity}</p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {orderedServiceTypes.map((serviceType) => {
              if (!services?.length) {
                return null;
              }

              const mappedService = servicesByTypeId.get(serviceType.id);
              const fallbackIndex =
                mappedService?.index ??
                (services ?? []).findIndex(
                  (service) => service?.service_type_id === serviceType.id,
                );

              if (fallbackIndex === undefined || fallbackIndex < 0) {
                return null;
              }

              const service = mappedService?.service ?? services?.[fallbackIndex];
              const Icon =
                SERVICE_ICON_MAP[serviceType.code as keyof typeof SERVICE_ICON_MAP] ?? ClipboardList;
              const unitPrice = service?.unit_price_cents ?? serviceType.default_price_cents;
              const quantity = service?.quantity ?? 0;
              const total = unitPrice * quantity;

              return (
                <div
                  key={serviceType.id}
                  className="flex flex-col gap-2 rounded-lg border border-sky-100 bg-white/95 p-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-100">
                        <Icon className="h-3.5 w-3.5 text-sky-700" />
                      </span>
                      <div>
                        <span className={SERVICE_BADGE_CLASSNAME}>{serviceType.code}</span>
                        <p className="text-[11px] font-semibold text-slate-700">{serviceType.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-slate-500">Total</p>
                      <p className="text-xs font-semibold text-slate-900">
                        {formatCurrency(total)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Controller
                      control={form.control}
                      name={`services.${fallbackIndex}.unit_price_cents`}
                      render={({ field }) => (
                        <MoneyInput
                          value={field.value ?? 0}
                          onChange={(cents) => field.onChange(cents)}
                          className="h-8 w-20 text-right text-xs"
                          placeholder="0,00"
                        />
                      )}
                    />
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="h-8 w-16 rounded border-slate-200 text-center text-xs"
                      value={quantity}
                      onChange={(event) => handleQuantityChange(fallbackIndex, event.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Pagamentos eletrônicos</CardTitle>
              <CardDescription>Informe os recebimentos via PIX ou cartão.</CardDescription>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-2 text-right">
              <p className="text-xs font-semibold uppercase text-sky-700">
                Total Eletrônico
              </p>
              <p className="text-xl font-semibold text-sky-700">
                {formatCurrency(totals.electronicTotal)}
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {(['pix', 'cartao'] as const).map((method) => {
              const entryArray = electronicEntries ?? [];
              const entryIndex = entryArray.findIndex((entry) => entry.method === method);
              const entry = entryIndex >= 0 ? entryArray[entryIndex] : undefined;
              const Icon = method === 'pix' ? Smartphone : CreditCard;
              const title = method === 'pix' ? 'PIX' : 'Cartão';
              const subtitle =
                method === 'pix'
                  ? 'Entradas digitais por transferência instantânea.'
                  : 'Pagamentos realizados no cartão.';

              return (
                <div
                  key={method}
                  className="flex items-center justify-between rounded-lg border border-sky-100 bg-white/95 p-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center rounded-md bg-sky-100 p-1.5">
                      <Icon className="h-4 w-4 text-sky-700" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase text-sky-700">{title}</p>
                      <p className="text-[11px] text-slate-500">{subtitle}</p>
                    </div>
                  </div>
                  {entryIndex >= 0 && (
                    <Controller
                      control={form.control}
                      name={`electronicEntries.${entryIndex}.amount_cents`}
                      render={({ field }) => (
                        <MoneyInput
                          value={field.value ?? 0}
                          onChange={(cents) => field.onChange(cents)}
                          className="w-32 text-right text-sm"
                          placeholder="0,00"
                        />
                      )}
                    />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Despesas</CardTitle>
              <CardDescription>Cadastre despesas operacionais relacionadas ao fechamento.</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={handleAddExpense}>
              Adicionar despesa
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {expensesFieldArray.fields.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                Nenhuma despesa registrada. Clique em â€œAdicionar despesaâ€ para incluir.
              </p>
            )}

            {expensesFieldArray.fields.map((field, index) => {
              return (
                <div
                  key={field.id}
                  className="grid gap-4 rounded-lg border border-slate-200/70 p-4 md:grid-cols-12"
                >
                  <div className="md:col-span-6">
                    <Label htmlFor={`expense-title-${field.id}`} className="text-xs uppercase text-slate-500">
                      Título
                    </Label>
                    <Input
                      id={`expense-title-${field.id}`}
                      placeholder="Descrição da despesa"
                      {...form.register(`expenses.${index}.title` as const)}
                    />
                    {form.formState.errors.expenses?.[index]?.title && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.expenses[index]?.title?.message}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-4">
                    <Label className="text-xs uppercase text-slate-500">Valor</Label>
                    <Controller
                      control={form.control}
                      name={`expenses.${index}.amount_cents`}
                      render={({ field }) => (
                        <MoneyInput
                          value={field.value ?? 0}
                          onChange={(cents) => field.onChange(cents)}
                          className="mt-2 w-full"
                          placeholder="0,00"
                        />
                      )}
                    />
                    {form.formState.errors.expenses?.[index]?.amount_cents && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.expenses[index]?.amount_cents?.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center md:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-center text-destructive"
                      onClick={() => handleRemoveExpense(index)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">A Receber</CardTitle>
              <CardDescription>
                Novos registros são adicionados ao painel â€œA Receberâ€. Itens existentes devem ser ajustados no dashboard.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={handleAddReceivable}>
              Adicionar a receber
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {receivablesFieldArray.fields.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                Nenhum item cadastrado. Clique em â€œAdicionar a receberâ€ para incluir.
              </p>
            )}

            {receivablesFieldArray.fields.map((field, index) => {
              const receivable = receivables?.[index];

              return (
                <div
                  key={field.id}
                  className="space-y-4 rounded-lg border border-slate-200/70 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-slate-500">Cliente *</Label>
                      <Input
                        placeholder="Nome do cliente"
                        {...form.register(`receivables.${index}.customer_name` as const)}
                      />
                      {form.formState.errors.receivables?.[index]?.customer_name && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.receivables[index]?.customer_name?.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-slate-500">Placa</Label>
                      <Input
                        placeholder="ABC1D23"
                        {...form.register(`receivables.${index}.plate` as const)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-slate-500">Serviço relacionado</Label>
              <Select
                value={
                  receivable?.service_type_id && receivable.service_type_id !== ''
                    ? receivable.service_type_id
                    : 'none'
                }
                onValueChange={(selected) => {
                  const value = selected === 'none' ? '' : selected;
                  form.setValue(`receivables.${index}.service_type_id`, value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
              >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem vínculo</SelectItem>
                          {orderedServiceTypes.map((serviceType) => (
                            <SelectItem key={`receivable-service-${serviceType.id}`} value={serviceType.id}>
                              {serviceType.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-slate-500">
                        Valor original
                      </Label>
                      <Controller
                        control={form.control}
                        name={`receivables.${index}.original_amount_cents`}
                        render={({ field }) => (
                          <MoneyInput
                            value={field.value ?? 0}
                            onChange={(cents) => field.onChange(cents)}
                            className="w-full"
                            placeholder="0,00"
                          />
                        )}
                      />
                      {form.formState.errors.receivables?.[index]?.original_amount_cents && (
                        <p className="text-sm text-destructive">
                          {
                            form.formState.errors.receivables[index]?.original_amount_cents
                              ?.message
                          }
                        </p>
                      )}
                    </div>
                    <input
                      type="hidden"
                      {...form.register(`receivables.${index}.due_date` as const)}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleRemoveReceivable(index)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryRow label="Total de Entradas" value={totals.gross} />
            <SummaryRow label="Pagamentos Eletrônicos" value={totals.electronicTotal} />
            <SummaryRow label="Total Líquido" value={totals.net} />
            <SummaryRow label="Total em Dinheiro" value={totals.cash} />
            <SummaryRow label="Despesas" value={totals.expensesTotal} />
            <SummaryRow label="A Receber" value={totals.receivablesTotal} />
            <SummaryRow label="PIX" value={totals.pix} />
            <SummaryRow label="Cartão" value={totals.cartao} />
            <div className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-xs uppercase text-slate-500">Retornos</p>
              <p className="text-xl font-semibold text-slate-900">{totals.returnQuantity}</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Salvando...'
              : mode === 'create'
                ? 'Salvar Caixa'
                : 'Salvar Alterações'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900">{formatCurrency(value)}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex w-full items-center justify-center py-24">
      <div className="flex items-center gap-3 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin text-sky-700" />
        <span>Carregando formulário...</span>
      </div>
    </div>
  );
}

