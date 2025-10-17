import { supabase } from '@/integrations/supabase/client';
import type { CashBoxFormData } from '@/schemas/cash-box';
import { getTodayISO } from '@/lib/date';
import type { CashBoxWithRelations } from './types';
import type { ServiceType } from '@/types/database';

export async function fetchCashBox(id: string): Promise<CashBoxWithRelations | null> {
  const { data, error } = await supabase
    .from('cash_boxes')
    .select(
      `
        *,
        cash_box_services(*, service_types(*)),
        cash_box_electronic_entries(*),
        cash_box_expenses(*)
      `,
    )
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return (data ?? null) as CashBoxWithRelations | null;
}

export async function createCashBox({
  data,
  storeId,
  vistoriadorId,
}: {
  data: CashBoxFormData;
  storeId: string;
  vistoriadorId: string;
}) {
  const { data: createdCashBox, error: createError } = await supabase
    .from('cash_boxes')
    .insert({
      store_id: storeId,
      date: data.date,
      vistoriador_id: vistoriadorId,
      note: data.note.trim(),
    })
    .select('id')
    .single();

  if (createError || !createdCashBox) {
    throw createError ?? new Error('Não foi possível criar o caixa.');
  }

  const cashBoxId = createdCashBox.id;

  try {
    await persistChildren(cashBoxId, data);
    await insertReceivables(data, { storeId, userId: vistoriadorId });
  } catch (error) {
    await supabase.from('cash_boxes').delete().eq('id', cashBoxId);
    throw error;
  }

  return cashBoxId;
}

export async function updateCashBox({
  cashBoxId,
  data,
  storeId,
  vistoriadorId,
}: {
  cashBoxId: string;
  data: CashBoxFormData;
  storeId: string;
  vistoriadorId: string;
}) {
  const { error: updateError } = await supabase
    .from('cash_boxes')
    .update({
      date: data.date,
      note: data.note.trim(),
      vistoriador_id: vistoriadorId,
    })
    .eq('id', cashBoxId);

  if (updateError) {
    throw updateError;
  }

  await deleteChildren(cashBoxId);
  await persistChildren(cashBoxId, data);
  await insertReceivables(data, { storeId, userId: vistoriadorId });
}

export async function deleteCashBox(cashBoxId: string) {
  const { error } = await supabase.from('cash_boxes').delete().eq('id', cashBoxId);
  if (error) {
    throw error;
  }
}

async function persistChildren(cashBoxId: string, data: CashBoxFormData) {
  const servicePayload = data.services
    .filter((service) => service.quantity > 0 && service.service_type_id)
    .map((service) => ({
      cash_box_id: cashBoxId,
      service_type_id: service.service_type_id,
      unit_price_cents: service.unit_price_cents,
      quantity: service.quantity,
    }));

  if (servicePayload.length > 0) {
    const { error } = await supabase.from('cash_box_services').insert(servicePayload);
    if (error) throw error;
  }

  const electronicPayload = data.electronicEntries
    .filter((entry) => entry.amount_cents > 0)
    .map((entry) => ({
      cash_box_id: cashBoxId,
      method: entry.method,
      amount_cents: entry.amount_cents,
    }));

  if (electronicPayload.length > 0) {
    const { error } = await supabase
      .from('cash_box_electronic_entries')
      .insert(electronicPayload);
    if (error) throw error;
  }

  const expensesPayload = data.expenses
    .filter((expense) => expense.title.trim() && expense.amount_cents > 0)
    .map((expense) => ({
      cash_box_id: cashBoxId,
      title: expense.title.trim(),
      amount_cents: expense.amount_cents,
    }));

  if (expensesPayload.length > 0) {
    const { error } = await supabase.from('cash_box_expenses').insert(expensesPayload);
    if (error) throw error;
  }
}

async function deleteChildren(cashBoxId: string) {
  const [{ error: servicesError }, { error: electronicError }, { error: expensesError }] =
    await Promise.all([
      supabase.from('cash_box_services').delete().eq('cash_box_id', cashBoxId),
      supabase.from('cash_box_electronic_entries').delete().eq('cash_box_id', cashBoxId),
      supabase.from('cash_box_expenses').delete().eq('cash_box_id', cashBoxId),
    ]);

  if (servicesError) throw servicesError;
  if (electronicError) throw electronicError;
  if (expensesError) throw expensesError;
}

async function insertReceivables(
  data: CashBoxFormData,
  {
    storeId,
    userId,
  }: {
    storeId: string | undefined;
    userId: string;
  },
) {
  if (!storeId) return;

  const receivablePayload = data.receivables.map((receivable) => ({
    store_id: storeId,
    created_by_user_id: userId,
    customer_name: receivable.customer_name.trim(),
    plate: receivable.plate?.trim() || null,
    service_type_id: receivable.service_type_id || null,
    original_amount_cents: receivable.original_amount_cents,
    due_date: receivable.due_date || getTodayISO(),
    status: 'aberto',
  }));

  if (receivablePayload.length === 0) return;

  const { error } = await supabase.from('receivables').insert(receivablePayload);
  if (error) {
    throw error;
  }
}

export async function fetchServiceTypes(): Promise<ServiceType[]> {
  const { data, error } = await supabase.from('service_types').select('*').order('name');
  if (error) {
    throw error;
  }
  return (data ?? []) as ServiceType[];
}
