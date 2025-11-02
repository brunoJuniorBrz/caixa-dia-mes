import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { CashBoxWithRelations, FixedExpenseRecord, MonthlySummary } from './types';

const DATE_FORMAT = 'yyyy-MM';

function toMonthKey(date: string): string {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return format(parsed, DATE_FORMAT);
}

function toMonthLabel(date: string): string {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return format(parsed, "MMMM 'de' yyyy", { locale: ptBR });
}

export function summarizeCashBoxes(
  cashBoxes: CashBoxWithRelations[],
  fixedExpenses: FixedExpenseRecord[],
): MonthlySummary[] {
  const summaryMap = new Map<
    string,
    {
      label: string;
      gross: number;
      pix: number;
      cartao: number;
      expensesVariable: number;
      net: number;
    }
  >();

  for (const box of cashBoxes) {
    const key = toMonthKey(box.date);
    const label = toMonthLabel(box.date);

    const current = summaryMap.get(key) ?? {
      label,
      gross: 0,
      pix: 0,
      cartao: 0,
      expensesVariable: 0,
      net: 0,
    };

    const services = box.cash_box_services ?? [];
    const electronicEntries = box.cash_box_electronic_entries ?? [];
    const expenses = box.cash_box_expenses ?? [];

    let boxGross = 0;

    for (const service of services) {
      const countsInGross = service.service_types?.counts_in_gross ?? true;
      const total =
        service.total_cents ?? (service.unit_price_cents ?? 0) * service.quantity;
      if (countsInGross) {
        boxGross += total;
      }
    }

    const boxPix = electronicEntries
      .filter((entry) => entry.method === 'pix')
      .reduce((acc, entry) => acc + entry.amount_cents, 0);

    const boxCartao = electronicEntries
      .filter((entry) => entry.method === 'cartao')
      .reduce((acc, entry) => acc + entry.amount_cents, 0);

    const boxExpensesVariable = expenses.reduce(
      (acc, expense) => acc + (expense.amount_cents ?? 0),
      0,
    );

    const gross = current.gross + boxGross;
    const pix = current.pix + boxPix;
    const cartao = current.cartao + boxCartao;
    const expensesVariable = current.expensesVariable + boxExpensesVariable;
    const net = current.net + (boxGross - boxExpensesVariable);

    summaryMap.set(key, {
      label,
      gross,
      pix,
      cartao,
      expensesVariable,
      net,
    });
  }

  const fixedByMonth = new Map<string, number>();
  for (const expense of fixedExpenses) {
    const key = toMonthKey(expense.month_year);
    const current = fixedByMonth.get(key) ?? 0;
    fixedByMonth.set(key, current + (expense.amount_cents ?? 0));

    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        label: toMonthLabel(expense.month_year),
        gross: 0,
        pix: 0,
        cartao: 0,
        expensesVariable: 0,
        net: 0,
      });
    }
  }

  return Array.from(summaryMap.entries())
    .map(([monthKey, values]) => {
      const fixed = fixedByMonth.get(monthKey) ?? 0;
      return {
        monthKey,
        monthLabel: values.label,
        gross: values.gross,
        pix: values.pix,
        cartao: values.cartao,
        expensesVariable: values.expensesVariable,
        net: values.net,
        fixedExpenses: fixed,
        netAfterFixed: values.net - fixed,
      };
    })
    .sort((a, b) => (a.monthKey > b.monthKey ? -1 : 1));
}

export function formatCurrencyFromCents(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value / 100);
}
