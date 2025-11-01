import type {
  CashBox,
  CashBoxElectronicEntry,
  CashBoxExpense,
  CashBoxService,
  ServiceType,
  Store,
  AppUser,
} from '@/types/database';

export interface CashBoxWithRelations extends CashBox {
  cash_box_services: (CashBoxService & { service_types?: ServiceType | null })[] | null;
  cash_box_electronic_entries: CashBoxElectronicEntry[] | null;
  cash_box_expenses: CashBoxExpense[] | null;
}

export interface AdminFilters {
  storeId: string | null;
  vistoriadorId: string | null;
  startDate: string;
  endDate: string;
}

export interface MonthlySummary {
  monthKey: string;
  monthLabel: string;
  gross: number;
  pix: number;
  cartao: number;
  expensesVariable: number;
  net: number;
  fixedExpenses: number;
  netAfterFixed: number;
}

export interface FixedExpenseRecord {
  id: string;
  store_id: string;
  month_year: string;
  title: string;
  amount_cents: number;
}

export interface AdminStore extends Store {
  name: string;
}

export interface VariableExpenseRecord {
  id: string;
  cash_box_id: string;
  title: string;
  amount_cents: number;
  cash_box: {
    id: string;
    note: string | null;
    date: string;
    store_id: string;
    vistoriador_id: string;
    vistoriador?: AppUser | null;
  };
}

export interface MonthlyClosureServiceEntry {
  service_type_id: string;
  quantity: number;
  unit_price_cents: number;
}

export interface MonthlyClosureExpenseEntry {
  id?: string;
  title: string;
  amount_cents: number;
}

export interface MonthlyClosureData {
  cashBoxId: string | null;
  month: string;
  services: MonthlyClosureServiceEntry[];
  expenses: MonthlyClosureExpenseEntry[];
  serviceCatalog: ServiceType[];
}

export interface MonthlyClosurePayload {
  storeId: string;
  month: string;
  userId: string;
  services: Array<{
    service_type_id: string;
    quantity: number;
  }>;
  expenses: MonthlyClosureExpenseEntry[];
}
