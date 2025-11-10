import { cashBoxDefaultValues, type CashBoxFormData } from '@/schemas/cash-box';
import type { ServiceType } from '@/types/database';
import { SERVICE_CODE_ORDER, SERVICE_PRICE_FALLBACKS } from './constants';
import type { ServiceCode } from './constants';
import type {
  CashBoxTotals,
  CashBoxWithRelations,
  NormalizeCashBoxFormParams,
  ElectronicMethod,
} from './types';

const ELECTRONIC_METHOD_ORDER: ElectronicMethod[] = ['pix', 'cartao'];

function buildOrderedServiceTypes(serviceTypes: ServiceType[] | undefined): ServiceType[] {
  const byCode = new Map<string, ServiceType>();
  (serviceTypes ?? []).forEach((serviceType) => {
    if (!byCode.has(serviceType.code)) {
      byCode.set(serviceType.code, serviceType);
    }
  });

  const primary = SERVICE_CODE_ORDER.map((code) => byCode.get(code)).filter(
    (serviceType): serviceType is ServiceType => Boolean(serviceType),
  );

  const extras: ServiceType[] = [];
  byCode.forEach((serviceType, code) => {
    if (!SERVICE_CODE_ORDER.includes(code)) {
      extras.push(serviceType);
    }
  });

  return [...primary, ...extras];
}

export function getServiceDefaultPrice(serviceType: ServiceType): number {
  const defaultPrice = serviceType.default_price_cents ?? 0;
  if (defaultPrice > 0) {
    return defaultPrice;
  }

  const override = SERVICE_PRICE_FALLBACKS[serviceType.code as ServiceCode];
  return override ?? 0;
}

export function normalizeCashBoxFormData({
  data,
  serviceTypes,
}: NormalizeCashBoxFormParams): CashBoxFormData {
  const orderedServiceTypes = buildOrderedServiceTypes(serviceTypes);

  const existingServicesById = new Map(
    (data?.services ?? []).map((service) => [service.service_type_id, service]),
  );

  const services: CashBoxFormData['services'] = orderedServiceTypes.map((serviceType) => {
    const existing = existingServicesById.get(serviceType.id);

    return {
      service_type_id: serviceType.id,
      quantity: existing?.quantity ?? 0,
      unit_price_cents: existing?.unit_price_cents ?? getServiceDefaultPrice(serviceType),
    };
  });

  const electronicEntries = ensureElectronicEntries(data?.electronicEntries);

  return {
    date: data?.date ?? cashBoxDefaultValues.date,
    note: data?.note ?? cashBoxDefaultValues.note,
    services,
    electronicEntries,
    expenses: data?.expenses ?? [],
    receivables: data?.receivables ?? [],
  };
}

export function mapCashBoxToFormData(
  cashBox: CashBoxWithRelations,
  serviceTypes: ServiceType[],
): CashBoxFormData {
  const services: CashBoxFormData['services'] = (cashBox.cash_box_services ?? []).map(
    (service) => ({
      service_type_id: service.service_type_id,
      quantity: service.quantity,
      unit_price_cents: service.unit_price_cents,
    }),
  );

  const electronicEntries: CashBoxFormData['electronicEntries'] = (
    cashBox.cash_box_electronic_entries ?? []
  ).map((entry) => ({
    method: entry.method,
    amount_cents: entry.amount_cents,
  }));

  const expenses: CashBoxFormData['expenses'] = (cashBox.cash_box_expenses ?? []).map(
    (expense) => ({
      title: expense.title,
      amount_cents: expense.amount_cents,
    }),
  );

  return normalizeCashBoxFormData({
    serviceTypes,
    data: {
      date: cashBox.date,
      note: cashBox.note ?? '',
      services,
      electronicEntries,
      expenses,
      receivables: [],
    },
  });
}

export { buildOrderedServiceTypes };

export function calculateCashBoxTotals({
  services,
  electronicEntries,
  expenses,
  receivables,
  serviceTypes,
}: {
  services: CashBoxFormData['services'];
  electronicEntries: CashBoxFormData['electronicEntries'];
  expenses: CashBoxFormData['expenses'];
  receivables: CashBoxFormData['receivables'];
  serviceTypes: ServiceType[];
}): CashBoxTotals {
  const serviceTypeById = new Map(serviceTypes.map((serviceType) => [serviceType.id, serviceType]));

  let gross = 0;
  let returnQuantity = 0;

  for (const service of services) {
    const serviceType = serviceTypeById.get(service.service_type_id);
    if (!serviceType) continue;

    const total = service.quantity * service.unit_price_cents;
    if (serviceType.counts_in_gross) {
      gross += total;
    } else if (service.quantity > 0) {
      returnQuantity += service.quantity;
    }
  }

  const pix = sumByMethod(electronicEntries, 'pix');
  const cartao = sumByMethod(electronicEntries, 'cartao');
  const electronicTotal = pix + cartao;

  const expensesTotal = expenses.reduce((accumulator, expense) => {
    return accumulator + (expense.amount_cents ?? 0);
  }, 0);

  const receivablesTotal = receivables.reduce((accumulator, receivable) => {
    return accumulator + (receivable.original_amount_cents ?? 0);
  }, 0);

  const net = gross - expensesTotal;
  const cash = gross - expensesTotal - receivablesTotal - electronicTotal;

  return {
    gross,
    electronicTotal,
    net,
    cash,
    expensesTotal,
    receivablesTotal,
    pix,
    cartao,
    returnQuantity,
  };
}

function ensureElectronicEntries(
  electronicEntries: CashBoxFormData['electronicEntries'] | undefined,
): CashBoxFormData['electronicEntries'] {
  const existingEntries = new Map(
    (electronicEntries ?? []).map((entry) => [entry.method, entry.amount_cents]),
  );

  return ELECTRONIC_METHOD_ORDER.map((method) => ({
    method,
    amount_cents: existingEntries.get(method) ?? 0,
  }));
}

function sumByMethod(
  electronicEntries: CashBoxFormData['electronicEntries'],
  method: ElectronicMethod,
) {
  return electronicEntries
    .filter((entry) => entry.method === method)
    .reduce((accumulator, entry) => accumulator + entry.amount_cents, 0);
}
