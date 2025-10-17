import type {
  CashBox,
  CashBoxElectronicEntry,
  CashBoxExpense,
  CashBoxService,
  PaymentMethod,
  ServiceType,
} from '@/types/database';
import type { CashBoxFormData } from '@/schemas/cash-box';
import type { ServiceCode } from './constants';

export type ElectronicMethod = Extract<PaymentMethod, 'pix' | 'cartao'>;

export interface CashBoxTotals {
  gross: number;
  electronicTotal: number;
  net: number;
  cash: number;
  expensesTotal: number;
  receivablesTotal: number;
  pix: number;
  cartao: number;
  returnQuantity: number;
}

export interface CashBoxWithRelations extends CashBox {
  cash_box_services: (CashBoxService & { service_types?: ServiceType | null })[] | null;
  cash_box_electronic_entries: CashBoxElectronicEntry[] | null;
  cash_box_expenses: CashBoxExpense[] | null;
}

export interface NormalizeCashBoxFormParams {
  data?: Partial<CashBoxFormData>;
  serviceTypes: ServiceType[];
}

export interface ServiceMeta {
  code: ServiceCode;
  serviceType: ServiceType;
}
