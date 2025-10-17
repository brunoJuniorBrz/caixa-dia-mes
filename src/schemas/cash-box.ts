import { z } from 'zod';
import { getTodayISO } from '@/lib/date';

export const cashBoxServiceSchema = z.object({
  service_type_id: z.string().min(1, 'Selecione um servico'),
  quantity: z.number().int().min(0, 'Quantidade invalida'),
  unit_price_cents: z.number().int().min(0, 'Valor invalido'),
});

export const cashBoxElectronicEntrySchema = z.object({
  method: z.enum(['pix', 'cartao'], {
    errorMap: () => ({ message: 'Selecione o metodo' }),
  }),
  amount_cents: z.number().int().min(0, 'Valor invalido'),
});

export const cashBoxExpenseSchema = z.object({
  title: z.string().min(1, 'Informe a descricao'),
  amount_cents: z.number().int().min(0, 'Valor invalido'),
});

export const cashBoxReceivableSchema = z.object({
  customer_name: z.string().min(1, 'Informe o cliente'),
  plate: z.string().optional(),
  service_type_id: z.string().optional(),
  original_amount_cents: z.number().int().min(0, 'Valor invalido'),
  due_date: z.string().optional(),
});

export const cashBoxSchema = z.object({
  date: z.string().min(1, 'Informe a data'),
  note: z
    .string()
    .trim()
    .min(1, 'Informe o nome do caixa'),
  services: z.array(cashBoxServiceSchema),
  electronicEntries: z.array(cashBoxElectronicEntrySchema),
  expenses: z.array(cashBoxExpenseSchema),
  receivables: z.array(cashBoxReceivableSchema),
});

export type CashBoxFormData = z.infer<typeof cashBoxSchema>;

export const cashBoxDefaultValues: CashBoxFormData = {
  date: getTodayISO(),
  note: '',
  services: [],
  electronicEntries: [],
  expenses: [],
  receivables: [],
};
