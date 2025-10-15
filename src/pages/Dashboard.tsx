import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/money';
import { formatDate, getTodayISO } from '@/lib/date';
import { Plus, DollarSign, CreditCard, TrendingDown, TrendingUp, RotateCcw, LogOut } from 'lucide-react';
import type { CashBox, CashBoxSummary } from '@/types/database';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(getTodayISO());

  const { data: cashBoxes, isLoading } = useQuery({
    queryKey: ['cash-boxes', user?.store_id, selectedDate],
    queryFn: async () => {
      if (!user?.store_id) return [];
      
      const { data, error } = await supabase
        .from('cash_boxes')
        .select(`
          *,
          cash_box_services(*, service_types(*)),
          cash_box_electronic_entries(*),
          cash_box_expenses(*)
        `)
        .eq('store_id', user.store_id)
        .eq('date', selectedDate)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as any[];
    },
    enabled: !!user?.store_id,
  });

  const summary: CashBoxSummary = (cashBoxes || []).reduce(
    (acc, box) => {
      const grossServices = box.cash_box_services?.filter(
        (s: any) => s.service_types?.counts_in_gross
      ) || [];
      const gross = grossServices.reduce((sum: number, s: any) => sum + s.total_cents, 0);

      const returnServices = box.cash_box_services?.filter(
        (s: any) => !s.service_types?.counts_in_gross
      ) || [];
      const returnCount = returnServices.reduce((sum: number, s: any) => sum + s.quantity, 0);

      const pix = box.cash_box_electronic_entries
        ?.filter((e: any) => e.method === 'pix')
        .reduce((sum: number, e: any) => sum + e.amount_cents, 0) || 0;

      const cartao = box.cash_box_electronic_entries
        ?.filter((e: any) => e.method === 'cartao')
        .reduce((sum: number, e: any) => sum + e.amount_cents, 0) || 0;

      const expenses = box.cash_box_expenses
        ?.reduce((sum: number, e: any) => sum + e.amount_cents, 0) || 0;

      return {
        gross_total: acc.gross_total + gross,
        pix_total: acc.pix_total + pix,
        cartao_total: acc.cartao_total + cartao,
        expenses_total: acc.expenses_total + expenses,
        net_total: acc.net_total + (gross - expenses),
        return_count: acc.return_count + returnCount,
      };
    },
    {
      gross_total: 0,
      pix_total: 0,
      cartao_total: 0,
      expenses_total: 0,
      net_total: 0,
      return_count: 0,
    }
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Olá, {user?.name}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/receber')} variant="outline">
              A Receber
            </Button>
            <Button onClick={signOut} variant="outline" size="icon">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Date Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Selecionar Data</CardTitle>
          </CardHeader>
          <CardContent>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2"
            />
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bruto</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {formatCurrency(summary.gross_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">PIX</CardTitle>
              <DollarSign className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(summary.pix_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cartão</CardTitle>
              <CreditCard className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(summary.cartao_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Despesas</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {formatCurrency(summary.expenses_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Líquido</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(summary.net_total)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Retornos</CardTitle>
              <RotateCcw className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.return_count}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* New Cash Box Button */}
        <Button onClick={() => navigate('/caixas/novo')} size="lg" className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Novo Caixa
        </Button>

        {/* Recent Cash Boxes */}
        <Card>
          <CardHeader>
            <CardTitle>Últimos Caixas do Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {cashBoxes && cashBoxes.length > 0 ? (
              <div className="space-y-2">
                {cashBoxes.map((box) => (
                  <div
                    key={box.id}
                    onClick={() => navigate(`/caixas/${box.id}`)}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="font-medium">{formatDate(box.date)}</p>
                      {box.note && (
                        <p className="text-sm text-muted-foreground">{box.note}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {box.cash_box_services?.length || 0} serviços
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum caixa registrado para esta data
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
