-- Criar tipo enum para papéis
CREATE TYPE public.app_role AS ENUM ('admin', 'vistoriador');

-- Criar tipo enum para métodos de pagamento
CREATE TYPE public.payment_method AS ENUM ('pix', 'cartao');

-- Criar tipo enum para status de recebíveis
CREATE TYPE public.receivable_status AS ENUM ('aberto', 'pago_pendente_baixa', 'baixado');

-- Criar tipo enum para fonte de despesa
CREATE TYPE public.expense_source AS ENUM ('fixa', 'avulsa');

-- Tabela de lojas
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de usuários (perfil do app)
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  auth_user_id UUID UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'vistoriador',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de tipos de serviço
CREATE TABLE public.service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  default_price_cents INTEGER NOT NULL CHECK (default_price_cents >= 0),
  counts_in_gross BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de caixas
CREATE TABLE public.cash_boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  vistoriador_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, date, vistoriador_id)
);

-- Tabela de serviços do caixa
CREATE TABLE public.cash_box_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_box_id UUID NOT NULL REFERENCES public.cash_boxes(id) ON DELETE CASCADE,
  service_type_id UUID NOT NULL REFERENCES public.service_types(id) ON DELETE RESTRICT,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  total_cents INTEGER GENERATED ALWAYS AS (unit_price_cents * quantity) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de entradas eletrônicas
CREATE TABLE public.cash_box_electronic_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_box_id UUID NOT NULL REFERENCES public.cash_boxes(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de despesas do caixa
CREATE TABLE public.cash_box_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_box_id UUID NOT NULL REFERENCES public.cash_boxes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de recebíveis (A Receber)
CREATE TABLE public.receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  plate TEXT,
  service_type_id UUID REFERENCES public.service_types(id) ON DELETE SET NULL,
  original_amount_cents INTEGER CHECK (original_amount_cents >= 0),
  due_date DATE,
  status public.receivable_status NOT NULL DEFAULT 'aberto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de pagamentos de recebíveis
CREATE TABLE public.receivable_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id UUID NOT NULL REFERENCES public.receivables(id) ON DELETE CASCADE,
  paid_on DATE NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  method public.payment_method,
  recorded_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de templates de despesas fixas
CREATE TABLE public.fixed_expense_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_amount_cents INTEGER NOT NULL CHECK (default_amount_cents >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  preferred_day INTEGER CHECK (preferred_day >= 1 AND preferred_day <= 31),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de despesas mensais
CREATE TABLE public.monthly_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  month_year DATE NOT NULL,
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  source public.expense_source NOT NULL,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de logs de auditoria
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX idx_users_store_id ON public.users(store_id);
CREATE INDEX idx_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX idx_cash_boxes_store_date ON public.cash_boxes(store_id, date DESC);
CREATE INDEX idx_cash_boxes_vistoriador ON public.cash_boxes(vistoriador_id);
CREATE INDEX idx_receivables_store_status ON public.receivables(store_id, status);
CREATE INDEX idx_monthly_expenses_store_month ON public.monthly_expenses(store_id, month_year DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_user_id, created_at DESC);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_box_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_box_electronic_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_box_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_expense_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Função auxiliar para verificar se usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

-- Função auxiliar para obter store_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- Políticas RLS para stores
CREATE POLICY "Admin pode ver todas as lojas" ON public.stores FOR SELECT USING (public.is_admin());
CREATE POLICY "Vistoriador pode ver sua loja" ON public.stores FOR SELECT USING (id = public.get_user_store_id());

-- Políticas RLS para users
CREATE POLICY "Admin pode ver todos os usuários" ON public.users FOR SELECT USING (public.is_admin());
CREATE POLICY "Vistoriador pode ver usuários da sua loja" ON public.users FOR SELECT USING (store_id = public.get_user_store_id());
CREATE POLICY "Usuário pode ver seu próprio perfil" ON public.users FOR SELECT USING (auth_user_id = auth.uid());

-- Políticas RLS para service_types (todos podem ler)
CREATE POLICY "Todos podem ver tipos de serviço" ON public.service_types FOR SELECT USING (true);

-- Políticas RLS para cash_boxes
CREATE POLICY "Admin pode ver todos os caixas" ON public.cash_boxes FOR SELECT USING (public.is_admin());
CREATE POLICY "Admin pode criar caixas" ON public.cash_boxes FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Vistoriador pode ver caixas da sua loja" ON public.cash_boxes FOR SELECT USING (store_id = public.get_user_store_id());
CREATE POLICY "Vistoriador pode criar caixas da sua loja" ON public.cash_boxes FOR INSERT WITH CHECK (store_id = public.get_user_store_id());
CREATE POLICY "Vistoriador pode atualizar caixas da sua loja" ON public.cash_boxes FOR UPDATE USING (store_id = public.get_user_store_id());

-- Políticas RLS para cash_box_services (herdam do cash_box)
CREATE POLICY "Admin pode ver todos os serviços" ON public.cash_box_services FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_services.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);
CREATE POLICY "Usuário pode criar serviços no seu caixa" ON public.cash_box_services FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_services.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);
CREATE POLICY "Usuário pode atualizar serviços no seu caixa" ON public.cash_box_services FOR UPDATE USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_services.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);
CREATE POLICY "Usuário pode deletar serviços no seu caixa" ON public.cash_box_services FOR DELETE USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_services.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);

-- Políticas similares para cash_box_electronic_entries
CREATE POLICY "Ver entradas eletrônicas" ON public.cash_box_electronic_entries FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_electronic_entries.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);
CREATE POLICY "Criar entradas eletrônicas" ON public.cash_box_electronic_entries FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_electronic_entries.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);
CREATE POLICY "Deletar entradas eletrônicas" ON public.cash_box_electronic_entries FOR DELETE USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_electronic_entries.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);

-- Políticas similares para cash_box_expenses
CREATE POLICY "Ver despesas do caixa" ON public.cash_box_expenses FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_expenses.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);
CREATE POLICY "Criar despesas do caixa" ON public.cash_box_expenses FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_expenses.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);
CREATE POLICY "Deletar despesas do caixa" ON public.cash_box_expenses FOR DELETE USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cash_boxes cb
    WHERE cb.id = cash_box_expenses.cash_box_id
      AND cb.store_id = public.get_user_store_id()
  )
);

-- Políticas RLS para receivables
CREATE POLICY "Admin pode ver todos os recebíveis" ON public.receivables FOR SELECT USING (public.is_admin());
CREATE POLICY "Vistoriador pode ver recebíveis da sua loja" ON public.receivables FOR SELECT USING (store_id = public.get_user_store_id());
CREATE POLICY "Usuário pode criar recebíveis" ON public.receivables FOR INSERT WITH CHECK (
  public.is_admin() OR store_id = public.get_user_store_id()
);
CREATE POLICY "Admin pode atualizar recebíveis" ON public.receivables FOR UPDATE USING (public.is_admin());

-- Políticas RLS para receivable_payments
CREATE POLICY "Ver pagamentos de recebíveis" ON public.receivable_payments FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.receivables r
    WHERE r.id = receivable_payments.receivable_id
      AND r.store_id = public.get_user_store_id()
  )
);
CREATE POLICY "Criar pagamentos de recebíveis" ON public.receivable_payments FOR INSERT WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.receivables r
    WHERE r.id = receivable_payments.receivable_id
      AND r.store_id = public.get_user_store_id()
  )
);

-- Políticas RLS para fixed_expense_templates
CREATE POLICY "Admin pode gerenciar templates" ON public.fixed_expense_templates FOR ALL USING (public.is_admin());
CREATE POLICY "Vistoriador pode ver templates da sua loja" ON public.fixed_expense_templates FOR SELECT USING (
  store_id = public.get_user_store_id() OR store_id IS NULL
);

-- Políticas RLS para monthly_expenses
CREATE POLICY "Admin pode ver todas as despesas mensais" ON public.monthly_expenses FOR SELECT USING (public.is_admin());
CREATE POLICY "Admin pode criar despesas mensais" ON public.monthly_expenses FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Vistoriador pode ver despesas da sua loja" ON public.monthly_expenses FOR SELECT USING (store_id = public.get_user_store_id());

-- Políticas RLS para audit_logs
CREATE POLICY "Admin pode ver logs" ON public.audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "Todos podem criar logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- Seed: Tipos de serviço
INSERT INTO public.service_types (code, name, default_price_cents, counts_in_gross) VALUES
  ('CARRO', 'Carro', 12000, true),
  ('MOTO', 'Moto', 10000, true),
  ('CAMINHONETE', 'Caminhonete', 14000, true),
  ('CAMINHAO', 'Caminhão', 18000, true),
  ('CAUTELAR_CARRO', 'Cautelar Carro', 22000, true),
  ('CAUTELAR_MOTO', 'Cautelar Moto', 16000, true),
  ('CAUTELAR_CAMINHAO_CAMINHONETE', 'Cautelar Caminhão/Caminhonete', 24000, true),
  ('REVISTORIA_MULTA', 'Revistoria Multa', 20000, true),
  ('REV_RETORNO', 'Revistoria Retorno', 0, false);