import { supabase } from '@/integrations/supabase/client';
import type { AppUser, Store } from '@/types/database';
import type {
  AdminFilters,
  CashBoxWithRelations,
  FixedExpenseRecord,
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
    .order('cash_box.date', { ascending: false })
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
