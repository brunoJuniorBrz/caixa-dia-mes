import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/money';
import { formatDate, getTodayISO } from '@/lib/date';
import { toast } from 'sonner';
import {
  Plus,
  DollarSign,
  LogOut,
  PenSquare,
  Trash2,
  BarChart3,
  FileDown,
} from 'lucide-react';
import type {
  CashBox,
  CashBoxService,
  CashBoxElectronicEntry,
  CashBoxExpense,
  ServiceType,
} from '@/types/database';

interface CashBoxServiceWithType extends CashBoxService {
  service_types?: ServiceType | null;
}

interface CashBoxWithRelations extends CashBox {
  cash_box_services: CashBoxServiceWithType[] | null;
  cash_box_electronic_entries: CashBoxElectronicEntry[] | null;
  cash_box_expenses: CashBoxExpense[] | null;
}

function computeBoxTotals(box: CashBoxWithRelations) {
  const services = box.cash_box_services ?? [];
  const electronicEntries = box.cash_box_electronic_entries ?? [];
  const expenses = box.cash_box_expenses ?? [];

  const gross = services
    .filter((service) => service.service_types?.counts_in_gross)
    .reduce(
      (total, service) =>
        total + (service.total_cents ?? service.unit_price_cents * service.quantity),
      0,
    );

  const returnCount = services
    .filter((service) => service.service_types && !service.service_types.counts_in_gross)
    .reduce((total, service) => total + service.quantity, 0);

  const pix = electronicEntries
    .filter((entry) => entry.method === 'pix')
    .reduce((total, entry) => total + entry.amount_cents, 0);

  const cartao = electronicEntries
    .filter((entry) => entry.method === 'cartao')
    .reduce((total, entry) => total + entry.amount_cents, 0);

  const expensesTotal = expenses.reduce(
    (total, expense) => total + (expense.amount_cents ?? 0),
    0,
  );

  const net = gross - expensesTotal;

  return {
    gross,
    pix,
    cartao,
    expenses: expensesTotal,
    net,
    returnCount,
  };
}

export default function Historico() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(getTodayISO());
  const [endDate, setEndDate] = useState(getTodayISO());
  const [cashBoxSearch, setCashBoxSearch] = useState('');
  const deferredCashSearch = useDeferredValue(cashBoxSearch);
  const queryClient = useQueryClient();
  const isDateRangeValid = useMemo(() => startDate <= endDate, [startDate, endDate]);
  const [shouldFetch, setShouldFetch] = useState(false);
  const [cashBoxToDelete, setCashBoxToDelete] = useState<CashBoxWithRelations | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const isAdmin = user?.role === 'admin';

  const {
    data: cashBoxesData = [],
    isLoading,
    isFetching,
  } = useQuery<CashBoxWithRelations[]>({
    queryKey: ['cash-boxes-history', user?.store_id, user?.role, startDate, endDate],
    queryFn: async (): Promise<CashBoxWithRelations[]> => {
      if (!isAdmin && !user?.store_id) return [];

      let query = supabase
        .from('cash_boxes')
        .select(`
          *,
          cash_box_services(*, service_types(*)),
          cash_box_electronic_entries(*),
          cash_box_expenses(*)
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      // Se não for admin, filtra por store_id
      if (!isAdmin && user?.store_id) {
        query = query.eq('store_id', user.store_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as CashBoxWithRelations[];
    },
    enabled: (isAdmin || !!user?.store_id) && isDateRangeValid && shouldFetch,
  });

  const cashBoxes = isDateRangeValid ? cashBoxesData : [];

  const filteredCashBoxes = useMemo(() => {
    const term = deferredCashSearch.trim().toLowerCase();
    if (!term) return cashBoxes;
    return cashBoxes.filter((box) => {
      const values: string[] = [
        formatDate(box.date).toLowerCase(),
        box.note?.toLowerCase() ?? '',
      ];

      const serviceNames = (box.cash_box_services ?? [])
        .map((service) => service.service_types?.name?.toLowerCase() ?? service.service_types?.code?.toLowerCase() ?? '')
        .filter(Boolean)
        .join(' ');
      if (serviceNames) values.push(serviceNames);

      const expenseTitles = (box.cash_box_expenses ?? [])
        .map((expense) => expense.title.toLowerCase())
        .join(' ');
      if (expenseTitles) values.push(expenseTitles);

      return values.some((value) => value.includes(term));
    });
  }, [cashBoxes, deferredCashSearch]);

  const hasCashBoxSearch = deferredCashSearch.trim().length > 0;

  // Paginação
  const totalPages = Math.ceil(filteredCashBoxes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCashBoxes = filteredCashBoxes.slice(startIndex, endIndex);

  // Resetar página quando filtrar ou buscar
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredCashBoxes.length, deferredCashSearch]);

  const deleteCashBoxMutation = useMutation({
    mutationFn: async (cashBoxId: string) => {
      const { error } = await supabase.from('cash_boxes').delete().eq('id', cashBoxId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-boxes-history', user?.store_id, user?.role, startDate, endDate] });
      toast.success('Caixa excluído.');
      setCashBoxToDelete(null);
    },
    onError: (error: unknown) => {
      console.error('Erro ao excluir caixa:', error);
      toast.error('Não foi possível excluir o caixa.');
    },
  });

  const handleGeneratePdf = async (box: CashBoxWithRelations) => {
    try {
      toast.info('Gerando PDF...');
      
      // Importação dinâmica do jsPDF
      const { default: jsPDF } = await import('jspdf');
      
      // Buscar tipos de serviço para exibir os nomes
      const { data: serviceTypes } = await supabase.from('service_types').select('*');
      const serviceTypesMap = new Map(serviceTypes?.map(st => [st.id, st]) || []);
      
      const doc = new jsPDF('p', 'mm', 'a4');
      const totals = computeBoxTotals(box);
      
      // Configurações
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      
      // Header com gradiente
      doc.setFillColor(6, 182, 212); // Cyan
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text('TOP VISTORIAS', pageWidth / 2, 18, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Fechamento de Caixa Diário', pageWidth / 2, 27, { align: 'center' });
      
      const dataFormatada = new Date(box.date).toLocaleDateString('pt-BR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      doc.setFontSize(10);
      doc.text(dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1), pageWidth / 2, 35, { align: 'center' });
      
      let y = 52;
      
      // Adicionar nota/observação se existir
      if (box.note && box.note.trim()) {
        doc.setFillColor(241, 245, 249); // Cinza claro
        doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, contentWidth, 12, 2, 2);
        
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('📝 Observação:', margin + 3, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.text(box.note, margin + 3, y + 9);
        y += 16;
      }
      
      // ===== TABELA DE ENTRADAS (SERVIÇOS) =====
      // Título da seção
      doc.setFillColor(16, 185, 129); // Verde
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('💰 ENTRADAS', margin + 3, y + 7);
      y += 12;
      
      // Header da tabela
      doc.setFillColor(220, 252, 231); // Verde claro
      doc.rect(margin, y, contentWidth, 9, 'F');
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.5);
      doc.rect(margin, y, contentWidth, 9);
      
      doc.setTextColor(21, 128, 61); // Verde escuro
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Serviço', margin + 3, y + 6);
      doc.text('Qtd', margin + 100, y + 6, { align: 'right' });
      doc.text('Valor Unit.', margin + 130, y + 6, { align: 'right' });
      doc.text('Total', margin + contentWidth - 3, y + 6, { align: 'right' });
      y += 9;
      
      // Linhas de serviços
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      let totalEntradas = 0;
      
      const services = (box.cash_box_services || []).filter(s => s.quantity > 0);
      
      // Desenhar borda da tabela
      const startY = y;
      
      services.forEach((service, index) => {
        const serviceType = service.service_types || serviceTypesMap.get(service.service_type_id);
        if (serviceType) {
          const valorUnitario = service.unit_price_cents / 100;
          const valorTotal = (service.unit_price_cents * service.quantity) / 100;
          totalEntradas += valorTotal;
          
          // Linha alternada
          if (index % 2 === 0) {
            doc.setFillColor(249, 250, 251);
            doc.rect(margin, y - 4, contentWidth, 6, 'F');
          }
          
          doc.text(serviceType.name, margin + 3, y);
          doc.text(service.quantity.toString(), margin + 100, y, { align: 'right' });
          doc.text(`R$ ${valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + 130, y, { align: 'right' });
          doc.text(`R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y, { align: 'right' });
          y += 6;
        }
      });
      
      if (services.length === 0) {
        doc.setTextColor(128, 128, 128);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum serviço registrado', margin + 3, y);
        y += 6;
        doc.setTextColor(0, 0, 0);
      }
      
      // Borda da tabela
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.5);
      doc.rect(margin, startY - 4, contentWidth, y - startY + 4);
      
      // Total de entradas
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(16, 185, 129);
      doc.roundedRect(margin, y - 3, contentWidth, 9, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text('TOTAL ENTRADAS', margin + 3, y + 3);
      doc.setFontSize(12);
      doc.text(`R$ ${totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y + 3, { align: 'right' });
      y += 14;
      
      // ===== TABELA DE SAÍDAS (DESPESAS) =====
      // Título da seção
      doc.setFillColor(220, 38, 38); // Vermelho
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('📤 SAÍDAS', margin + 3, y + 7);
      y += 12;
      
      // Header da tabela
      doc.setFillColor(254, 226, 226); // Vermelho claro
      doc.rect(margin, y, contentWidth, 9, 'F');
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.5);
      doc.rect(margin, y, contentWidth, 9);
      
      doc.setTextColor(153, 27, 27); // Vermelho escuro
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Descrição', margin + 3, y + 6);
      doc.text('Valor', margin + contentWidth - 3, y + 6, { align: 'right' });
      y += 9;
      
      // Linhas de despesas
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      let totalSaidas = 0;
      
      const expenses = (box.cash_box_expenses || []).filter(e => e.title && e.amount_cents > 0);
      
      const startYExpenses = y;
      
      expenses.forEach((expense, index) => {
        const valor = expense.amount_cents / 100;
        totalSaidas += valor;
        
        // Linha alternada
        if (index % 2 === 0) {
          doc.setFillColor(249, 250, 251);
          doc.rect(margin, y - 4, contentWidth, 6, 'F');
        }
        
        doc.text(expense.title, margin + 3, y);
        doc.text(`R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y, { align: 'right' });
        y += 6;
      });
      
      if (expenses.length === 0) {
        doc.setTextColor(128, 128, 128);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhuma despesa registrada', margin + 3, y);
        y += 6;
        doc.setTextColor(0, 0, 0);
      }
      
      // Borda da tabela
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.5);
      doc.rect(margin, startYExpenses - 4, contentWidth, y - startYExpenses + 4);
      
      // Total de saídas
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(220, 38, 38);
      doc.roundedRect(margin, y - 3, contentWidth, 9, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text('TOTAL SAÍDAS', margin + 3, y + 3);
      doc.setFontSize(12);
      doc.text(`R$ ${totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y + 3, { align: 'right' });
      y += 14;
      
      // ===== TABELA A RECEBER =====
      // Título da seção
      doc.setFillColor(251, 191, 36); // Amarelo
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('📋 A RECEBER', margin + 3, y + 7);
      y += 12;
      
      // Buscar receivables do caixa
      const { data: receivables } = await supabase
        .from('receivables')
        .select('*')
        .eq('cash_box_id', box.id);
      
      const validReceivables = (receivables || []).filter(r => r.customer_name && r.amount_cents > 0);
      
      // Header da tabela
      doc.setFillColor(254, 243, 199); // Amarelo claro
      doc.rect(margin, y, contentWidth, 9, 'F');
      doc.setDrawColor(251, 191, 36);
      doc.setLineWidth(0.5);
      doc.rect(margin, y, contentWidth, 9);
      
      doc.setTextColor(146, 64, 14); // Amarelo escuro
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Cliente', margin + 3, y + 6);
      doc.text('Serviço', margin + 70, y + 6);
      doc.text('Vencimento', margin + 130, y + 6, { align: 'right' });
      doc.text('Valor', margin + contentWidth - 3, y + 6, { align: 'right' });
      y += 9;
      
      // Linhas de recebíveis
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      let totalReceber = 0;
      
      const startYReceivables = y;
      
      validReceivables.forEach((receivable, index) => {
        const valor = receivable.amount_cents / 100;
        totalReceber += valor;
        
        const serviceType = receivable.service_type_id 
          ? serviceTypesMap.get(receivable.service_type_id)
          : null;
        const vencimento = receivable.due_date 
          ? new Date(receivable.due_date).toLocaleDateString('pt-BR')
          : '-';
        
        // Linha alternada
        if (index % 2 === 0) {
          doc.setFillColor(249, 250, 251);
          doc.rect(margin, y - 4, contentWidth, 6, 'F');
        }
        
        doc.text(receivable.customer_name, margin + 3, y);
        doc.text(serviceType?.name || '-', margin + 70, y);
        doc.text(vencimento, margin + 130, y, { align: 'right' });
        doc.text(`R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y, { align: 'right' });
        y += 6;
      });
      
      if (validReceivables.length === 0) {
        doc.setTextColor(128, 128, 128);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum valor a receber', margin + 3, y);
        y += 6;
        doc.setTextColor(0, 0, 0);
      }
      
      // Borda da tabela
      doc.setDrawColor(251, 191, 36);
      doc.setLineWidth(0.5);
      doc.rect(margin, startYReceivables - 4, contentWidth, y - startYReceivables + 4);
      
      // Total a receber
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(251, 191, 36);
      doc.roundedRect(margin, y - 3, contentWidth, 9, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text('TOTAL A RECEBER', margin + 3, y + 3);
      doc.setFontSize(12);
      doc.text(`R$ ${totalReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y + 3, { align: 'right' });
      y += 15;
      
      // ===== BALANÇO FINAL =====
      // Box principal com gradiente simulado
      doc.setFillColor(59, 130, 246); // Azul
      doc.roundedRect(margin, y, contentWidth, 45, 3, 3, 'F');
      
      // Borda decorativa
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(1);
      doc.roundedRect(margin, y, contentWidth, 45, 3, 3);
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('💼 BALANÇO FINAL', pageWidth / 2, y + 10, { align: 'center' });
      
      const valorLiquido = totals.net / 100;
      const pixTotal = totals.pix / 100;
      const cartaoTotal = totals.cartao / 100;
      
      // Linha separadora
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.line(margin + 10, y + 13, pageWidth - margin - 10, y + 13);
      
      // Valor Líquido em destaque
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Valor Líquido:', pageWidth / 2 - 35, y + 22);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`R$ ${valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth / 2 + 35, y + 22, { align: 'right' });
      
      // PIX e Cartão lado a lado
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const col1X = pageWidth / 2 - 40;
      const col2X = pageWidth / 2 + 5;
      
      doc.text('PIX:', col1X, y + 31);
      doc.setFont('helvetica', 'bold');
      doc.text(`R$ ${pixTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col1X + 35, y + 31, { align: 'right' });
      
      doc.setFont('helvetica', 'normal');
      doc.text('Cartão:', col2X, y + 31);
      doc.setFont('helvetica', 'bold');
      doc.text(`R$ ${cartaoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col2X + 35, y + 31, { align: 'right' });
      
      // Retornos centralizado
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Retornos: ${totals.returnCount}`, pageWidth / 2, y + 40, { align: 'center' });
      
      // Footer com linha decorativa
      const footerY = pageHeight - 15;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY, pageWidth - margin, footerY);
      
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('TOP VISTORIAS - Sistema de Gestão de Caixa', margin, pageHeight - 10);
      
      doc.setFont('helvetica', 'italic');
      const dataGeracao = new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      doc.text(`Gerado em ${dataGeracao}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      
      // Salvar PDF
      const nomeArquivo = `fechamento_${box.date.replace(/-/g, '')}.pdf`;
      doc.save(nomeArquivo);
      
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF. Tente novamente.');
    }
  };

  return (
    <>
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
          <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 p-2 shadow-sm">
            <img src="/logo.png" alt="TOP Vistorias" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">TOP Vistorias</p>
            <p className="text-xs text-slate-500">Histórico</p>
          </div>
        </div>

        <div className="border-b border-slate-200 px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Usuário</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{user?.name}</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <BarChart3 className="h-5 w-5" />
            Balanço
          </button>
          <button
            onClick={() => navigate('/historico')}
            className="flex w-full items-center gap-3 rounded-lg bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200"
          >
            <BarChart3 className="h-5 w-5" />
            Histórico
          </button>
          <button
            onClick={() => navigate('/caixas/novo')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Plus className="h-5 w-5" />
            Novo Caixa
          </button>
          <button
            onClick={() => navigate('/receber')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <DollarSign className="h-5 w-5" />
            A Receber
          </button>
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-5 w-5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-6 p-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Histórico de Caixas</h1>
            <p className="mt-1 text-sm text-slate-600">Pesquise e visualize caixas fechados por período</p>
          </div>

          {/* Date Selector */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-4">
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-slate-600">Data inicial</Label>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setShouldFetch(false);
                  }}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-slate-600">Data final</Label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setShouldFetch(false);
                  }}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const today = getTodayISO();
                    setStartDate(today);
                    setEndDate(today);
                    setShouldFetch(true);
                  }}
                  className="h-10 rounded-lg"
                >
                  Hoje
                </Button>
                <Button
                  onClick={() => {
                    if ((!isAdmin && !user?.store_id) || !isDateRangeValid) return;
                    setShouldFetch(true);
                    queryClient.invalidateQueries({
                      queryKey: ['cash-boxes-history', user?.store_id, user?.role, startDate, endDate],
                      exact: true,
                    });
                  }}
                  disabled={(!isAdmin && !user?.store_id) || !isDateRangeValid || isFetching}
                  className="h-10 rounded-lg bg-[#0A7EA4] hover:bg-[#0A6B8A]"
                >
                  {isFetching ? 'Buscando...' : 'Buscar'}
                </Button>
              </div>
            </div>
            {!isDateRangeValid && (
              <p className="mt-3 text-sm text-red-600">
                A data inicial deve ser menor ou igual à data final.
              </p>
            )}
          </div>

          {/* Search and Results */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {filteredCashBoxes.length} caixa{filteredCashBoxes.length !== 1 ? 's' : ''} encontrado{filteredCashBoxes.length !== 1 ? 's' : ''}
              </h2>
              <Input
                value={cashBoxSearch}
                onChange={(event) => setCashBoxSearch(event.target.value)}
                placeholder="Buscar por nota, serviço ou despesa..."
                aria-label="Buscar caixas"
                className="h-10 rounded-lg border-slate-200 md:w-80"
              />
            </div>

            <div className="mt-6">
              {!shouldFetch ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  Selecione um período e clique em "Buscar" para visualizar os caixas
                </p>
              ) : isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-cyan-600 border-t-transparent" />
                    <p className="text-sm text-slate-500">Carregando caixas...</p>
                  </div>
                </div>
              ) : filteredCashBoxes.length > 0 ? (
                <>
                <div className="space-y-3">
                  {paginatedCashBoxes.map((box) => {
                    const totals = computeBoxTotals(box);
                    const isDeletingCurrent = deleteCashBoxMutation.isPending && cashBoxToDelete?.id === box.id;
                    return (
                      <div
                        key={box.id}
                        className="group cursor-pointer rounded-xl border border-slate-200 p-5 transition-all hover:border-slate-300 hover:shadow-md"
                        onClick={() => navigate(`/caixas/${box.id}`)}
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-2">
                            <p className="text-base font-semibold text-slate-900">{formatDate(box.date)}</p>
                            {box.note && (
                              <p className="text-sm text-slate-600">{box.note}</p>
                            )}
                            <p className="text-xs text-slate-500">
                              {box.cash_box_services?.length ?? 0} serviços · {box.cash_box_expenses?.length ?? 0}{' '}
                              despesas · {totals.returnCount} retornos
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs">
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Bruto</p>
                              <p className="mt-1 text-sm font-semibold text-emerald-600">{formatCurrency(totals.gross)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Líquido</p>
                              <p className="mt-1 text-sm font-semibold text-cyan-600">{formatCurrency(totals.net)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">PIX</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(totals.pix)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Cartão</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(totals.cartao)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Despesas</p>
                              <p className="mt-1 text-sm font-semibold text-red-600">
                                {formatCurrency(totals.expenses)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleGeneratePdf(box);
                            }}
                            className="h-8 rounded-lg bg-cyan-600 text-xs hover:bg-cyan-700"
                          >
                            <FileDown className="mr-1.5 h-3.5 w-3.5" />
                            Gerar PDF
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/caixas/${box.id}`);
                            }}
                            className="h-8 rounded-lg text-xs"
                          >
                            <PenSquare className="mr-1.5 h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-lg text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={isDeletingCurrent}
                            onClick={(event) => {
                              event.stopPropagation();
                              setCashBoxToDelete(box);
                            }}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Excluir
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
                    <p className="text-sm text-slate-600">
                      Mostrando {startIndex + 1} a {Math.min(endIndex, filteredCashBoxes.length)} de {filteredCashBoxes.length} caixas
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Anterior
                      </Button>
                      <span className="text-sm text-slate-600">
                        Página {currentPage} de {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
                </>
              ) : (
                <p className="py-12 text-center text-sm text-slate-500">
                  {hasCashBoxSearch ? "Nenhum caixa encontrado para a busca." : "Nenhum caixa registrado neste período"}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>

    <AlertDialog
      open={cashBoxToDelete !== null}
      onOpenChange={(open) => {
        if (!open && !deleteCashBoxMutation.isPending) {
          setCashBoxToDelete(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir caixa</AlertDialogTitle>
          <AlertDialogDescription>
            {cashBoxToDelete
              ? `Confirme para remover o caixa de ${formatDate(cashBoxToDelete.date)}. Todos os serviços, entradas e despesas associados serão excluídos permanentemente.`
              : 'Confirme para remover o caixa selecionado.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteCashBoxMutation.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteCashBoxMutation.isPending || !cashBoxToDelete}
            onClick={() => {
              if (!cashBoxToDelete) return;
              deleteCashBoxMutation.mutate(cashBoxToDelete.id);
            }}
          >
            {deleteCashBoxMutation.isPending ? 'Excluindo...' : 'Confirmar exclusão'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

