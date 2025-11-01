import { supabase } from '@/integrations/supabase/client';
import type { AppUser, ServiceType, Store } from '@/types/database';
import { endOfMonth, format } from 'date-fns';
import type {
  AdminFilters,
  CashBoxWithRelations,
  FixedExpenseRecord,
  MonthlyClosureData,
  MonthlyClosurePayload,
  MonthlyClosureServiceEntry,
  VariableExpenseRecord,
} from './types';

export async function fetchStores(): Promise<Store[]> {
  const { data, error } = await supabase.from('stores').select('*').order('name');
  if (error) {
    throw error;
  }
  return (data ?? []) as Store[];
}

export async function fetchUsers(storeId?: string): Promise<AppUser[]> {
  let query = supabase
    .from('users')
    .select('*')
    .eq('is_active', true)
    .in('role', ['vistoriador', 'admin'])
    .order('name');

  if (storeId) {
    query = query.eq('store_id', storeId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data ?? []) as AppUser[];
}

export async function fetchCashBoxesByRange({
  startDate,
  endDate,
  storeId,
  vistoriadorId,
}: AdminFilters): Promise<CashBoxWithRelations[]> {
  let query = supabase
    .from('cash_boxes')
    .select(
      `
        *,
        cash_box_services(*, service_types(*)),
        cash_box_electronic_entries(*),
        cash_box_expenses(*)
      `,
    )
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .limit(500);

  if (storeId) {
    query = query.eq('store_id', storeId);
  }

  if (vistoriadorId) {
    query = query.eq('vistoriador_id', vistoriadorId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data ?? []) as CashBoxWithRelations[];
}

export async function fetchFixedExpenses({
  storeId,
  startDate,
  endDate,
}: Pick<AdminFilters, 'storeId' | 'startDate' | 'endDate'>): Promise<FixedExpenseRecord[]> {
  let query = supabase
    .from('monthly_expenses')
    .select('id, store_id, month_year, title, amount_cents')
    .eq('source', 'fixa')
    .gte('month_year', startDate)
    .lte('month_year', endDate)
    .order('month_year', { ascending: false })
    .order('title', { ascending: true });

  if (storeId) {
    query = query.eq('store_id', storeId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data ?? []) as FixedExpenseRecord[];
}

export async function upsertFixedExpense(
  expense: Omit<FixedExpenseRecord, 'id'> & { id?: string },
): Promise<FixedExpenseRecord> {
  const payload = {
    id: expense.id,
    store_id: expense.store_id,
    month_year: expense.month_year,
    title: expense.title,
    amount_cents: expense.amount_cents,
    source: 'fixa',
  };

  const { data, error } = await supabase
    .from('monthly_expenses')
    .upsert(payload, { onConflict: 'id' })
    .select('id, store_id, month_year, title, amount_cents')
    .single();

  if (error) {
    throw error;
  }

  return data as FixedExpenseRecord;
}

export async function deleteFixedExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.from('monthly_expenses').delete().eq('id', expenseId);
  if (error) {
    throw error;
  }
}

export async function fetchVariableExpenses({
  storeId,
  startDate,
  endDate,
  vistoriadorId,
}: Pick<AdminFilters, 'storeId' | 'startDate' | 'endDate' | 'vistoriadorId'>): Promise<VariableExpenseRecord[]> {
  let query = supabase
    .from('cash_box_expenses')
    .select(
      `
        id,
        cash_box_id,
        title,
        amount_cents,
        cash_box:cash_boxes!inner(
          id,
          note,
          date,
          store_id,
          vistoriador_id,
          vistoriador:users(*)
        )
      `,
    )
    .gte('cash_box.date', startDate)
    .lte('cash_box.date', endDate)
    .order('date', { ascending: false, foreignTable: 'cash_box' })
    .order('title', { ascending: true });

  if (storeId) {
    query = query.eq('cash_box.store_id', storeId);
  }

  if (vistoriadorId) {
    query = query.eq('cash_box.vistoriador_id', vistoriadorId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as VariableExpenseRecord[];
}

export async function updateVariableExpense(expenseId: string, payload: { title: string; amount_cents: number }) {
  const { error } = await supabase
    .from('cash_box_expenses')
    .update({ title: payload.title, amount_cents: payload.amount_cents })
    .eq('id', expenseId);

  if (error) {
    throw error;
  }
}

export async function deleteVariableExpense(expenseId: string) {
  const { error } = await supabase.from('cash_box_expenses').delete().eq('id', expenseId);
  if (error) {
    throw error;
  }
}

export async function createVariableExpense(payload: {
  cash_box_id: string;
  title: string;
  amount_cents: number;
}) {
  const { error } = await supabase.from('cash_box_expenses').insert({
    cash_box_id: payload.cash_box_id,
    title: payload.title,
    amount_cents: payload.amount_cents,
  });

  if (error) {
    throw error;
  }
}

function buildMonthlyClosureNote(month: string): string {
  return `Fechamento manual ${month}`;
}

function getMonthRange(month: string): { startDate: string; endDate: string } {
  const [year, monthPart] = month.split('-');
  if (!year || !monthPart) {
    throw new Error('Mês inválido para fechamento mensal.');
  }

  const baseDate = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error('Mês inválido para fechamento mensal.');
  }

  const startDate = format(baseDate, 'yyyy-MM-dd');
  const endDate = format(endOfMonth(baseDate), 'yyyy-MM-dd');

  return { startDate, endDate };
}

async function fetchServiceTypesCatalog(): Promise<ServiceType[]> {
  const { data, error } = await supabase.from('service_types').select('*').order('name');
  if (error) {
    throw error;
  }
  return (data ?? []) as ServiceType[];
}

export async function fetchMonthlyClosure({
  storeId,
  month,
}: {
  storeId: string | null;
  month: string;
}): Promise<MonthlyClosureData> {
  const serviceCatalog = await fetchServiceTypesCatalog();

  if (!storeId || !month) {
    return {
      cashBoxId: null,
      month,
      services: [],
      expenses: [],
      serviceCatalog,
    };
  }

  const { startDate, endDate } = getMonthRange(month);
  const note = buildMonthlyClosureNote(month);

  const { data, error } = await supabase
    .from('cash_boxes')
    .select(
      `
        id,
        cash_box_services(service_type_id, unit_price_cents, quantity),
        cash_box_expenses(id, title, amount_cents)
      `,
    )
    .eq('store_id', storeId)
    .eq('note', note)
    .gte('date', startDate)
    .lte('date', endDate)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (!data) {
    return {
      cashBoxId: null,
      month,
      services: [],
      expenses: [],
      serviceCatalog,
    };
  }

  const services = (data.cash_box_services ?? []) as MonthlyClosureServiceEntry[];
  const expenses = (data.cash_box_expenses ?? []) ?? [];

  return {
    cashBoxId: data.id,
    month,
    services,
    expenses,
    serviceCatalog,
  };
}

export async function upsertMonthlyClosure({
  storeId,
  month,
  userId,
  services,
  expenses,
}: MonthlyClosurePayload): Promise<void> {
  const { startDate, endDate } = getMonthRange(month);
  const note = buildMonthlyClosureNote(month);

  const serviceCatalog = await fetchServiceTypesCatalog();
  const serviceTypeMap = new Map(serviceCatalog.map((service) => [service.id, service]));

  const servicePayload = services
    .map((service) => {
      const serviceType = serviceTypeMap.get(service.service_type_id);
      if (!serviceType) {
        console.warn(`Tipo de serviço não encontrado: ${service.service_type_id}`);
        return null;
      }
      return {
        service_type_id: service.service_type_id,
        quantity: Math.max(0, Math.floor(service.quantity)),
        unit_price_cents: serviceType.default_price_cents,
      };
    })
    .filter((entry): entry is { service_type_id: string; quantity: number; unit_price_cents: number } => Boolean(entry))
    .filter((entry) => entry.quantity > 0);

  const expensePayload = expenses
    .filter((expense) => expense.title.trim() && expense.amount_cents > 0)
    .map((expense) => ({
      title: expense.title.trim(),
      amount_cents: expense.amount_cents,
    }));

  const rangeStart = startDate;
  const rangeEnd = endDate;

  const { data: existingBox, error: existingError } = await supabase
    .from('cash_boxes')
    .select('id')
    .eq('store_id', storeId)
    .eq('note', note)
    .gte('date', rangeStart)
    .lte('date', rangeEnd)
    .maybeSingle();

  if (existingError && existingError.code !== 'PGRST116') {
    throw existingError;
  }

  let cashBoxId = existingBox?.id ?? null;

  if (!cashBoxId) {
    const { data: createdBox, error: createError } = await supabase
      .from('cash_boxes')
      .insert({
        store_id: storeId,
        date: startDate,
        vistoriador_id: userId,
        note,
      })
      .select('id')
      .single();

    if (createError || !createdBox) {
      throw createError ?? new Error('Não foi possível criar o fechamento mensal.');
    }

    cashBoxId = createdBox.id;
  } else {
    const { error: updateError } = await supabase
      .from('cash_boxes')
      .update({
        date: startDate,
        vistoriador_id: userId,
        note,
      })
      .eq('id', cashBoxId);

    if (updateError) {
      throw updateError;
    }
  }

  try {
    const [{ error: servicesDeleteError }, { error: expensesDeleteError }] = await Promise.all([
      supabase.from('cash_box_services').delete().eq('cash_box_id', cashBoxId),
      supabase.from('cash_box_expenses').delete().eq('cash_box_id', cashBoxId),
    ]);

    if (servicesDeleteError) throw servicesDeleteError;
    if (expensesDeleteError) throw expensesDeleteError;

    if (servicePayload.length > 0) {
      const insertServices = servicePayload.map((service) => ({
        cash_box_id: cashBoxId,
        service_type_id: service.service_type_id,
        unit_price_cents: service.unit_price_cents,
        quantity: service.quantity,
      }));

      const { error: servicesInsertError } = await supabase.from('cash_box_services').insert(insertServices);
      if (servicesInsertError) {
        throw servicesInsertError;
      }
    }

    if (expensePayload.length > 0) {
      const insertExpenses = expensePayload.map((expense) => ({
        cash_box_id: cashBoxId,
        title: expense.title,
        amount_cents: expense.amount_cents,
      }));

      const { error: expensesInsertError } = await supabase.from('cash_box_expenses').insert(insertExpenses);
      if (expensesInsertError) {
        throw expensesInsertError;
      }
    }
  } catch (error) {
    if (!existingBox && cashBoxId) {
      await supabase.from('cash_boxes').delete().eq('id', cashBoxId);
    }
    throw error;
  }
}
