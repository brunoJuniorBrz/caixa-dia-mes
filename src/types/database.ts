export type AppRole = 'admin' | 'vistoriador';
export type PaymentMethod = 'pix' | 'cartao';
export type ReceivableStatus = 'aberto' | 'pago_pendente_baixa' | 'baixado';
export type ExpenseSource = 'fixa' | 'avulsa';

export interface Store {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface ServiceType {
  id: string;
  code: string;
  name: string;
  default_price_cents: number;
  counts_in_gross: boolean;
  created_at: string;
}

export interface CashBox {
  id: string;
  store_id: string;
  date: string;
  vistoriador_id: string;
  note?: string;
  created_at: string;
}

export interface CashBoxService {
  id: string;
  cash_box_id: string;
  service_type_id: string;
  unit_price_cents: number;
  quantity: number;
  total_cents: number;
  created_at: string;
  service_types?: ServiceType;
}

export interface CashBoxElectronicEntry {
  id: string;
  cash_box_id: string;
  method: PaymentMethod;
  amount_cents: number;
  created_at: string;
}

export interface CashBoxExpense {
  id: string;
  cash_box_id: string;
  title: string;
  amount_cents: number;
  created_at: string;
}

export interface Receivable {
  id: string;
  store_id: string;
  created_by_user_id: string;
  customer_name: string;
  plate?: string;
  service_type_id?: string;
  original_amount_cents?: number;
  due_date?: string;
  status: ReceivableStatus;
  created_at: string;
  service_types?: ServiceType;
}

export interface ReceivablePayment {
  id: string;
  receivable_id: string;
  paid_on: string;
  amount_cents: number;
  method?: PaymentMethod;
  recorded_by_user_id: string;
  created_at: string;
}

export interface FixedExpenseTemplate {
  id: string;
  store_id?: string;
  name: string;
  default_amount_cents: number;
  is_active: boolean;
  preferred_day?: number;
  created_at: string;
}

export interface MonthlyExpense {
  id: string;
  store_id: string;
  month_year: string;
  title: string;
  amount_cents: number;
  source: ExpenseSource;
  created_by_user_id?: string;
  created_at: string;
}

export interface CashBoxSummary {
  gross_total: number;
  pix_total: number;
  cartao_total: number;
  expenses_total: number;
  net_total: number;
  return_count: number;
}

export interface MonthlySummary {
  store_id: string;
  month_year: string;
  gross_total: number;
  pix_total: number;
  cartao_total: number;
  fixed_expenses_total: number;
  avulsa_expenses_total: number;
  total_expenses: number;
  net_total: number;
  top_services: Array<{ service: string; total: number }>;
  top_days: Array<{ date: string; total: number }>;
  top_expenses: Array<{ title: string; amount: number }>;
}
