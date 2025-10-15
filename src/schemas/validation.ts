import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

export const cashBoxServiceSchema = z.object({
  service_type_id: z.string().uuid('Selecione um serviço'),
  unit_price_cents: z.number().min(0, 'Preço deve ser positivo'),
  quantity: z.number().int().min(0, 'Quantidade deve ser positiva'),
});

export const electronicEntrySchema = z.object({
  method: z.enum(['pix', 'cartao'], { errorMap: () => ({ message: 'Método inválido' }) }),
  amount_cents: z.number().min(1, 'Valor deve ser maior que zero'),
});

export const expenseSchema = z.object({
  title: z.string().min(1, 'Título obrigatório').max(200, 'Título muito longo'),
  amount_cents: z.number().min(1, 'Valor deve ser maior que zero'),
});

export const receivableSchema = z.object({
  customer_name: z.string().min(1, 'Nome do cliente obrigatório').max(200),
  plate: z.string().max(20).optional(),
  service_type_id: z.string().uuid().optional(),
  original_amount_cents: z.number().min(0).optional(),
  due_date: z.string().optional(),
});

export const receivablePaymentSchema = z.object({
  paid_on: z.string().min(1, 'Data do pagamento obrigatória'),
  amount_cents: z.number().min(1, 'Valor deve ser maior que zero'),
  method: z.enum(['pix', 'cartao']).optional(),
});

export const fixedExpenseTemplateSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório').max(200),
  default_amount_cents: z.number().min(0, 'Valor deve ser positivo'),
  preferred_day: z.number().int().min(1).max(31).optional(),
});

export const monthlyExpenseSchema = z.object({
  title: z.string().min(1, 'Título obrigatório').max(200),
  amount_cents: z.number().min(1, 'Valor deve ser maior que zero'),
  date: z.string().min(1, 'Data obrigatória'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CashBoxServiceInput = z.infer<typeof cashBoxServiceSchema>;
export type ElectronicEntryInput = z.infer<typeof electronicEntrySchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type ReceivableInput = z.infer<typeof receivableSchema>;
export type ReceivablePaymentInput = z.infer<typeof receivablePaymentSchema>;
export type FixedExpenseTemplateInput = z.infer<typeof fixedExpenseTemplateSchema>;
export type MonthlyExpenseInput = z.infer<typeof monthlyExpenseSchema>;
