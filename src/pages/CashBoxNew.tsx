import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { MoneyInput } from '@/components/MoneyInput';
import { formatCurrency } from '@/lib/money';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { ServiceType } from '@/types/database';

const serviceSchema = z.object({
  service_type_id: z.string().min(1, 'Selecione um serviço'),
  quantity: z.number().int().min(0, 'Quantidade inválida'),
  unit_price_cents: z.number().int().min(0, 'Valor inválido'),
});

const electronicEntrySchema = z.object({
  method: z.enum(['pix', 'cartao'], {
    errorMap: () => ({ message: 'Selecione o método' }),
  }),
  amount_cents: z.number().int().min(0, 'Valor inválido'),
});

const expenseSchema = z.object({
  title: z.string().min(1, 'Informe a descrição'),
  amount_cents: z.number().int().min(0, 'Valor inválido'),
});

const receivableSchema = z.object({
  customer_name: z.string().min(1, 'Informe o cliente'),
  plate: z.string().optional(),
  service_type_id: z.string().optional(),
  original_amount_cents: z.number().int().min(0, 'Valor inválido'),
  due_date: z.string().optional(),
});

const cashBoxSchema = z.object({
  date: z.string().min(1, 'Informe a data'),
  note: z
    .string()
    .trim()
    .min(1, 'Informe o nome do caixa'),
  services: z.array(serviceSchema),
  electronicEntries: z.array(electronicEntrySchema),
  expenses: z.array(expenseSchema),
  receivables: z.array(receivableSchema),
});

type CashBoxFormData = z.infer<typeof cashBoxSchema>;

const defaultFormValues: CashBoxFormData = {
  date: format(new Date(), 'yyyy-MM-dd'),
  note: '',
  services: [],
  electronicEntries: [],
  expenses: [],
  receivables: [],
};

interface ServiceTypeOption extends ServiceType {
  label: string;
}

export default function CashBoxNew() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role !== 'vistoriador') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const form = useForm<CashBoxFormData>({
    resolver: zodResolver(cashBoxSchema),
    defaultValues: defaultFormValues,
    mode: 'onChange',
  });

  const servicesFieldArray = useFieldArray({
    control: form.control,
    name: 'services',
  });

  const electronicFieldArray = useFieldArray({
    control: form.control,
    name: 'electronicEntries',
  });

  const expensesFieldArray = useFieldArray({
    control: form.control,
    name: 'expenses',
  });

  const receivablesFieldArray = useFieldArray({
    control: form.control,
    name: 'receivables',
  });

  const { data: serviceTypes = [], isLoading: loadingServiceTypes } = useQuery({
    queryKey: ['service-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data ?? []) as ServiceType[];
    },
  });

  const serviceTypeOptions: ServiceTypeOption[] = useMemo(
    () =>
      serviceTypes.map((service) => ({
        ...service,
        label: `${service.name} • ${formatCurrency(service.default_price_cents)}`,
      })),
    [serviceTypes],
  );

  const mutation = useMutation({
    mutationFn: async (values: CashBoxFormData) => {
      if (!user?.store_id || !user?.id) {
        throw new Error('Usuário sem loja configurada.');
      }

      const { data: createdCashBox, error: cashBoxError } = await supabase
        .from('cash_boxes')
        .insert({
          store_id: user.store_id,
          date: values.date,
          vistoriador_id: user.id,
          note: values.note.trim(),
        })
        .select('id')
        .single();

      if (cashBoxError || !createdCashBox) {
        throw cashBoxError ?? new Error('Não foi possível criar o caixa.');
      }

      const cashBoxId = createdCashBox.id;

      if (values.services.length > 0) {
        const servicesPayload = values.services.map((service) => ({
          cash_box_id: cashBoxId,
          service_type_id: service.service_type_id,
          unit_price_cents: service.unit_price_cents,
          quantity: service.quantity,
          total_cents: service.unit_price_cents * service.quantity,
        }));

        const { error: servicesError } = await supabase.from('cash_box_services').insert(servicesPayload);
        if (servicesError) throw servicesError;
      }

      if (values.electronicEntries.length > 0) {
        const electronicPayload = values.electronicEntries.map((entry) => ({
          cash_box_id: cashBoxId,
          method: entry.method,
          amount_cents: entry.amount_cents,
        }));

        const { error: electronicError } = await supabase
          .from('cash_box_electronic_entries')
          .insert(electronicPayload);
        if (electronicError) throw electronicError;
      }

      if (values.expenses.length > 0) {
        const expensesPayload = values.expenses.map((expense) => ({
          cash_box_id: cashBoxId,
          title: expense.title,
          amount_cents: expense.amount_cents,
        }));

        const { error: expensesError } = await supabase.from('cash_box_expenses').insert(expensesPayload);
        if (expensesError) throw expensesError;
      }

      if (values.receivables.length > 0) {
        const receivablesPayload = values.receivables.map((receivable) => ({
          store_id: user.store_id,
          created_by_user_id: user.id,
          customer_name: receivable.customer_name,
          plate: receivable.plate?.trim() || null,
          service_type_id: receivable.service_type_id || null,
          original_amount_cents: receivable.original_amount_cents,
          due_date: receivable.due_date || null,
          status: 'aberto',
        }));

        const { error: receivableError } = await supabase.from('receivables').insert(receivablesPayload);
        if (receivableError) throw receivableError;
      }
    },
    onSuccess: () => {
      toast.success('Caixa criado com sucesso!');
      navigate('/dashboard');
    },
    onError: (error) => {
      console.error('Erro ao criar caixa:', error);
      const message = error instanceof Error ? error.message : 'Não foi possível criar o caixa.';
      toast.error(message);
    },
  });

  const handleAddService = () => {
    const defaultService = serviceTypeOptions[0];
    servicesFieldArray.append({
      service_type_id: defaultService?.id ?? '',
      quantity: 1,
      unit_price_cents: defaultService?.default_price_cents ?? 0,
    });
  };

  const handleAddElectronicEntry = () => {
    electronicFieldArray.append({
      method: 'pix',
      amount_cents: 0,
    });
  };

  const handleAddExpense = () => {
    expensesFieldArray.append({
      title: '',
      amount_cents: 0,
    });
  };

  const handleAddReceivable = () => {
    receivablesFieldArray.append({
      customer_name: '',
      plate: '',
      service_type_id: '',
      original_amount_cents: 0,
      due_date: '',
    });
  };

  const watchedServices = form.watch('services');
  const watchedElectronicEntries = form.watch('electronicEntries');
  const watchedExpenses = form.watch('expenses');
  const watchedReceivables = form.watch('receivables');

  const totals = useMemo(() => {
    const services = watchedServices ?? [];
    const electronicEntries = watchedElectronicEntries ?? [];
    const expenses = watchedExpenses ?? [];
    const receivables = watchedReceivables ?? [];

    const GrossTotal = services.reduce((sum, service) => {
      const serviceType = serviceTypes.find((type) => type.id === service.service_type_id);
      if (serviceType?.counts_in_gross) {
        return sum + service.unit_price_cents * service.quantity;
      }
      return sum;
    }, 0);

    const returnQuantity = services.reduce((sum, service) => {
      const serviceType = serviceTypes.find((type) => type.id === service.service_type_id);
      if (serviceType && !serviceType.counts_in_gross) {
        return sum + service.quantity;
      }
      return sum;
    }, 0);

    const pixTotal = electronicEntries
      .filter((entry) => entry.method === 'pix')
      .reduce((sum, entry) => sum + entry.amount_cents, 0);

    const cardTotal = electronicEntries
      .filter((entry) => entry.method === 'cartao')
      .reduce((sum, entry) => sum + entry.amount_cents, 0);

    const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount_cents, 0);

    const receivablesTotal = receivables.reduce(
      (sum, receivable) => sum + (receivable.original_amount_cents ?? 0),
      0,
    );

    const electronicTotal = pixTotal + cardTotal;
    const cashOnHand = GrossTotal - expensesTotal - receivablesTotal - electronicTotal;

    return {
      gross: GrossTotal,
      returnQuantity,
      pix: pixTotal,
      card: cardTotal,
      expenses: expensesTotal,
      receivables: receivablesTotal,
      net: GrossTotal - expensesTotal,
      electronic: electronicTotal,
      cash: cashOnHand,
    };
  }, [watchedServices, watchedElectronicEntries, watchedExpenses, watchedReceivables, serviceTypes]);

  const isSubmitting = mutation.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Novo Caixa</h1>
          <p className="text-muted-foreground">
            Preencha os dados do fechamento diário. Data e vistoriador são obrigatórios.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>

      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Detalhes do Caixa</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={form.watch('date')}
                onChange={(event) => form.setValue('date', event.target.value)}
              />
              {form.formState.errors.date && (
                <p className="text-sm text-destructive">{form.formState.errors.date.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Nome do caixa</Label>
              <Input
                id="note"
                placeholder="Ex.: Caixa Turno Manhã"
                {...form.register('note')}
              />
              {form.formState.errors.note && (
                <p className="text-sm text-destructive">{form.formState.errors.note.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Serviços</CardTitle>
              <p className="text-sm text-muted-foreground">
                Adicione os serviços prestados e ajuste valores se necessário.
              </p>
            </div>
            <Button type="button" onClick={handleAddService} disabled={loadingServiceTypes}>
              Adicionar serviço
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {servicesFieldArray.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum serviço adicionado. Clique em &ldquo;Adicionar serviço&rdquo;.
              </p>
            )}

            {servicesFieldArray.fields.length > 0 && (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="w-40 text-right">Valor unitário</TableHead>
                      <TableHead className="w-32 text-center">Quantidade</TableHead>
                      <TableHead className="w-40 text-right">Total</TableHead>
                      <TableHead className="w-20 text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {servicesFieldArray.fields.map((field, index) => {
                      const quantityValue = form.watch(`services.${index}.quantity`) ?? 0;
                      const unitPriceValue = form.watch(`services.${index}.unit_price_cents`) ?? 0;
                      const totalValue = quantityValue * unitPriceValue;

                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <Controller
                                control={form.control}
                                name={`services.${index}.service_type_id`}
                                render={({ field: selectField }) => (
                                  <Select
                                    value={selectField.value}
                                    onValueChange={(value) => {
                                      const chosen = serviceTypeOptions.find((service) => service.id === value);
                                      if (chosen) {
                                        form.setValue(
                                          `services.${index}.unit_price_cents`,
                                          chosen.default_price_cents,
                                        );
                                      }
                                      selectField.onChange(value);
                                    }}
                                  >
                                    <SelectTrigger aria-label="Serviço">
                                      <SelectValue placeholder="Selecione um serviço" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {serviceTypeOptions.map((service) => (
                                        <SelectItem key={service.id} value={service.id}>
                                          {service.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                              {form.formState.errors.services?.[index]?.service_type_id && (
                                <p className="text-xs text-destructive">
                                  {form.formState.errors.services[index]?.service_type_id?.message}
                                </p>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="align-middle">
                            <MoneyInput
                              value={unitPriceValue}
                              onChange={(value) => form.setValue(`services.${index}.unit_price_cents`, value)}
                            />
                            {form.formState.errors.services?.[index]?.unit_price_cents && (
                              <p className="text-xs text-destructive">
                                {form.formState.errors.services[index]?.unit_price_cents?.message}
                              </p>
                            )}
                          </TableCell>

                          <TableCell className="align-middle text-center">
                            <Input
                              type="number"
                              min={0}
                              className="w-24 text-center"
                              value={quantityValue}
                              onChange={(event) =>
                                form.setValue(`services.${index}.quantity`, Number(event.target.value ?? 0))
                              }
                              aria-label="Quantidade"
                            />
                            {form.formState.errors.services?.[index]?.quantity && (
                              <p className="text-xs text-destructive">
                                {form.formState.errors.services[index]?.quantity?.message}
                              </p>
                            )}
                          </TableCell>

                          <TableCell className="align-middle text-right font-semibold">
                            {formatCurrency(totalValue)}
                          </TableCell>

                          <TableCell className="align-middle text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => servicesFieldArray.remove(index)}
                            >
                              Remover
                            </Button>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Entradas Eletrônicas</CardTitle>
              <p className="text-sm text-muted-foreground">Registre PIX e Cartão vinculados ao caixa.</p>
            </div>
            <Button type="button" onClick={handleAddElectronicEntry}>
              Adicionar entrada
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {electronicFieldArray.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma entrada registrada. Clique em &ldquo;Adicionar entrada&rdquo;.
              </p>
            )}

            {electronicFieldArray.fields.map((field, index) => {
              const amountValue = form.watch(`electronicEntries.${index}.amount_cents`) ?? 0;

              return (
                <div key={field.id} className="grid gap-4 rounded-lg border p-4 md:grid-cols-12">
                <div className="md:col-span-3 space-y-2">
                  <Label>Método</Label>
                  <Controller
                    control={form.control}
                    name={`electronicEntries.${index}.method`}
                    render={({ field: selectField }) => (
                      <Select value={selectField.value} onValueChange={selectField.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="cartao">Cartão</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.electronicEntries?.[index]?.method && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.electronicEntries[index]?.method?.message}
                    </p>
                  )}
                </div>

                <div className="md:col-span-5 space-y-2">
                  <Label>Valor</Label>
                  <MoneyInput
                    value={amountValue}
                    onChange={(value) => form.setValue(`electronicEntries.${index}.amount_cents`, value)}
                  />
                  {form.formState.errors.electronicEntries?.[index]?.amount_cents && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.electronicEntries[index]?.amount_cents?.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end md:col-span-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => electronicFieldArray.remove(index)}
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Despesas</CardTitle>
              <p className="text-sm text-muted-foreground">Informe despesas do dia para calcular o líquido.</p>
            </div>
            <Button type="button" onClick={handleAddExpense}>
              Adicionar despesa
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {expensesFieldArray.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma despesa registrada. Clique em &ldquo;Adicionar despesa&rdquo;.
              </p>
            )}

            {expensesFieldArray.fields.map((field, index) => {
              const amountValue = form.watch(`expenses.${index}.amount_cents`) ?? 0;

              return (
                <div key={field.id} className="grid gap-4 rounded-lg border p-4 md:grid-cols-12">
                <div className="md:col-span-6 space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    placeholder="Descrição da despesa"
                    {...form.register(`expenses.${index}.title` as const)}
                  />
                  {form.formState.errors.expenses?.[index]?.title && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.expenses[index]?.title?.message}
                    </p>
                  )}
                </div>

                <div className="md:col-span-4 space-y-2">
                  <Label>Valor</Label>
                  <MoneyInput
                    value={amountValue}
                    onChange={(value) => form.setValue(`expenses.${index}.amount_cents`, value)}
                  />
                  {form.formState.errors.expenses?.[index]?.amount_cents && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.expenses[index]?.amount_cents?.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end md:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => expensesFieldArray.remove(index)}
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>A Receber</CardTitle>
              <p className="text-sm text-muted-foreground">
                Cadastre valores a receber para acompanhamento posterior.
              </p>
            </div>
            <Button type="button" onClick={handleAddReceivable}>
              Adicionar a receber
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {receivablesFieldArray.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum item cadastrado. Clique em &ldquo;Adicionar a receber&rdquo; para incluir.
              </p>
            )}

            {receivablesFieldArray.fields.map((field, index) => {
              const originalAmountValue = form.watch(`receivables.${index}.original_amount_cents`) ?? 0;

              return (
                <div key={field.id} className="space-y-4 rounded-lg border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Cliente</Label>
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
                    <Label>Placa</Label>
                    <Input
                      placeholder="ABC1D23"
                      {...form.register(`receivables.${index}.plate` as const)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Serviço relacionado</Label>
                    <Controller
                      control={form.control}
                      name={`receivables.${index}.service_type_id`}
                      render={({ field: selectField }) => (
                        <Select value={selectField.value ?? ''} onValueChange={selectField.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Sem vínculo</SelectItem>
                            {serviceTypeOptions.map((service) => (
                              <SelectItem key={service.id} value={service.id}>
                                {service.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Valor original</Label>
                    <MoneyInput
                      value={originalAmountValue}
                      onChange={(value) => form.setValue(`receivables.${index}.original_amount_cents`, value)}
                    />
                    {form.formState.errors.receivables?.[index]?.original_amount_cents && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.receivables[index]?.original_amount_cents?.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Vencimento</Label>
                    <Input
                      type="date"
                      {...form.register(`receivables.${index}.due_date` as const)}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => receivablesFieldArray.remove(index)}
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
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <SummaryRow label="Entradas Brutas" value={totals.gross} />
            <SummaryRow label="Despesas" value={totals.expenses} />
            <SummaryRow label="Líquido (Bruto − Despesas)" value={totals.net} />
            <SummaryRow label="PIX" value={totals.pix} />
            <SummaryRow label="Cartão" value={totals.card} />
            <SummaryRow label="Total Entradas Eletrônicas" value={totals.electronic} />
            <SummaryRow label="A Receber" value={totals.receivables} />
            <SummaryRow label="Valor em Dinheiro" value={totals.cash} />
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Retornos (Revistoria)</p>
              <p className="text-2xl font-semibold">{totals.returnQuantity}</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col items-stretch justify-end gap-3 md:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => toast.info('Geração de PDF será implementada em breve.')}
          >
            Gerar PDF
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || !form.formState.isValid}>
            {isSubmitting ? 'Salvando...' : 'Salvar Caixa'}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: number;
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{formatCurrency(value)}</p>
    </div>
  );
}
