import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
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
  Calendar,
  Menu,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const dinheiro = gross - pix - cartao; // Valor em dinheiro = bruto - PIX - Cartão

  return {
    gross,
    pix,
    cartao,
    dinheiro,
    expenses: expensesTotal,
    net,
    returnCount,
  };
}

export default function Historico() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Restaurar filtros do state da navegação ou usar valores padrão
  const savedFilters = (location.state as { filters?: { startDate?: string; endDate?: string; search?: string } })?.filters;
  const [startDate, setStartDate] = useState(savedFilters?.startDate || getTodayISO());
  const [endDate, setEndDate] = useState(savedFilters?.endDate || getTodayISO());
  const [cashBoxSearch, setCashBoxSearch] = useState(savedFilters?.search || '');
  const deferredCashSearch = useDeferredValue(cashBoxSearch);
  const queryClient = useQueryClient();
  const isDateRangeValid = useMemo(() => startDate <= endDate, [startDate, endDate]);
  const [shouldFetch, setShouldFetch] = useState(savedFilters ? true : false);
  const [cashBoxToDelete, setCashBoxToDelete] = useState<CashBoxWithRelations | null>(null);
  const [viewingCashBox, setViewingCashBox] = useState<CashBoxWithRelations | null>(null);
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

  // Executar busca automaticamente quando filtros são restaurados
  useEffect(() => {
    if (savedFilters) {
      setShouldFetch(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      
      // Usar fonte padrão Helvetica (sempre disponível no jsPDF)
      // Helper para definir fonte de forma consistente
      const setFontSafe = (style: 'normal' | 'bold' | 'italic' = 'normal') => {
        doc.setFont('helvetica', style);
      };
      
      // Helper para quebrar texto em múltiplas linhas se necessário
      const splitText = (text: string, maxWidth: number): string[] => {
        if (!text) return [''];
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const textWidth = doc.getTextWidth(testLine);
          
          if (textWidth > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        
        if (currentLine) {
          lines.push(currentLine);
        }
        
        return lines.length > 0 ? lines : [text];
      };
      
      // Helper para adicionar texto com quebra automática
      const addTextWithWrap = (text: string, x: number, y: number, maxWidth: number, options?: { align?: 'left' | 'center' | 'right' }) => {
        const lines = splitText(text, maxWidth);
        let currentY = y;
        lines.forEach((line) => {
          doc.text(line, x, currentY, options || {});
          currentY += 5; // Espaçamento entre linhas
        });
        return currentY;
      };
      
      // Definir fonte padrão
      setFontSafe('normal');
      
      const totals = computeBoxTotals(box);
      
      // Configurações
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      const footerY = pageHeight - 15;
      const ensureSpace = (requiredHeight: number) => {
        if (y + requiredHeight > footerY) {
          doc.addPage();
          y = margin;
        }
      };
      
      // Header com gradiente
      doc.setFillColor(6, 182, 212); // Cyan
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      setFontSafe('bold');
      doc.text('TOP VISTORIAS', pageWidth / 2, 18, { align: 'center' });
      
      doc.setFontSize(12);
      setFontSafe('normal');
      doc.text('Fechamento de Caixa Diário', pageWidth / 2, 27, { align: 'center' });
      
      const dataFormatada = formatDate(box.date, "EEEE, dd 'de' MMMM 'de' yyyy");
      doc.setFontSize(10);
      doc.text(dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1), pageWidth / 2, 35, { align: 'center' });
      
      let y = 52;
      
      // Adicionar nota/observação se existir
      if (box.note && box.note.trim()) {
        const noteLines = splitText(box.note, contentWidth - 6);
        const noteHeight = Math.max(12, noteLines.length * 5 + 4);
        
        doc.setFillColor(241, 245, 249); // Cinza claro
        doc.roundedRect(margin, y, contentWidth, noteHeight, 2, 2, 'F');
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, contentWidth, noteHeight, 2, 2);
        
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(9);
        setFontSafe('bold');
        doc.text('Observação:', margin + 3, y + 5);
        setFontSafe('normal');
        let noteY = y + 9;
        noteLines.forEach((line) => {
          doc.text(line, margin + 3, noteY);
          noteY += 5;
        });
        y = noteY + 4; // Espaçamento após observação
      }
      
      // Espaçamento entre seções (16px ≈ 5.6mm)
      y += 5.6;
      
      // ===== TABELA DE ENTRADAS (SERVIÇOS) =====
      // Título da seção
      doc.setFillColor(16, 185, 129); // Verde
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      setFontSafe('bold');
      doc.text('ENTRADAS', margin + 3, y + 7);
      y += 12;
      
      // Header da tabela
      doc.setFillColor(220, 252, 231); // Verde claro
      doc.rect(margin, y, contentWidth, 9, 'F');
      // Borda sutil apenas nas laterais (não corta texto)
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.25);
      doc.line(margin, y, margin, y + 9); // Esquerda
      doc.line(margin + contentWidth, y, margin + contentWidth, y + 9); // Direita
      doc.line(margin, y, margin + contentWidth, y); // Topo
      doc.line(margin, y + 9, margin + contentWidth, y + 9); // Base
      
      doc.setTextColor(21, 128, 61); // Verde escuro
      doc.setFontSize(10);
      setFontSafe('bold');
      doc.text('Serviço', margin + 3, y + 6);
      doc.text('Qtd', margin + 100, y + 6, { align: 'center' }); // Centralizado
      doc.text('Valor Unit.', margin + 130, y + 6, { align: 'right' });
      doc.text('Total', margin + contentWidth - 3, y + 6, { align: 'right' });
      y += 9;
      
      // Linhas de serviços
      setFontSafe('normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      let totalEntradas = 0;
      
      const services = (box.cash_box_services || []).filter(s => s.quantity > 0);
      
      // Desenhar borda da tabela
      const startY = y;
      const servicesRowHeight = 8; // 8px ≈ 2.8mm
      
      services.forEach((service, index) => {
        const serviceType = service.service_types || serviceTypesMap.get(service.service_type_id);
        if (serviceType) {
          const valorUnitario = service.unit_price_cents / 100;
          const valorTotal = (service.unit_price_cents * service.quantity) / 100;
          totalEntradas += valorTotal;
          
          // Linha alternada (zebra)
          if (index % 2 === 0) {
            doc.setFillColor(249, 250, 251);
            doc.rect(margin, y - 3, contentWidth, servicesRowHeight, 'F');
          }
          
          // Truncar nome do serviço se muito longo (máx 85mm)
          const serviceName = serviceType.name.length > 30 
            ? serviceType.name.substring(0, 27) + '...' 
            : serviceType.name;
          doc.text(serviceName, margin + 3, y + 2);
          doc.text(service.quantity.toString(), margin + 100, y + 2, { align: 'center' }); // Centralizado
          doc.text(`R$ ${valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + 130, y + 2, { align: 'right' });
          doc.text(`R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y + 2, { align: 'right' });
          y += servicesRowHeight;
        }
      });
      
      if (services.length === 0) {
        doc.setTextColor(128, 128, 128);
        setFontSafe('normal');
        doc.text('Nenhum serviço registrado', margin + 3, y + 2);
        y += servicesRowHeight;
        doc.setTextColor(0, 0, 0);
      }
      
      // Borda sutil da tabela (apenas laterais, não corta texto)
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.25);
      doc.line(margin, startY - 3, margin, y); // Esquerda
      doc.line(margin + contentWidth, startY - 3, margin + contentWidth, y); // Direita
      doc.line(margin, y, margin + contentWidth, y); // Base
      
      // Total de entradas (espaçamento superior de 6px ≈ 2.1mm)
      y += 2.1;
      setFontSafe('bold');
      doc.setFillColor(247, 247, 247); // Fundo sutil para total
      doc.roundedRect(margin, y, contentWidth, 9, 2, 2, 'F');
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.25);
      doc.roundedRect(margin, y, contentWidth, 9, 2, 2);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.text('TOTAL ENTRADAS', margin + 3, y + 6);
      doc.setFontSize(12);
      doc.text(`R$ ${totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y + 6, { align: 'right' });
      y += 13; // Espaçamento após total
      
      // Espaçamento entre seções (16px ≈ 5.6mm)
      y += 5.6;
      
      // ===== TABELA DE SAÍDAS (DESPESAS) =====
      // Título da seção
      doc.setFillColor(220, 38, 38); // Vermelho
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      setFontSafe('bold');
      doc.text('SAÍDAS', margin + 3, y + 7);
      y += 12;
      
      // Header da tabela
      doc.setFillColor(254, 226, 226); // Vermelho claro
      doc.rect(margin, y, contentWidth, 9, 'F');
      // Borda sutil apenas nas laterais
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.25);
      doc.line(margin, y, margin, y + 9); // Esquerda
      doc.line(margin + contentWidth, y, margin + contentWidth, y + 9); // Direita
      doc.line(margin, y, margin + contentWidth, y); // Topo
      doc.line(margin, y + 9, margin + contentWidth, y + 9); // Base
      
      doc.setTextColor(153, 27, 27); // Vermelho escuro
      doc.setFontSize(10);
      setFontSafe('bold');
      doc.text('Descrição', margin + 3, y + 6);
      doc.text('Valor', margin + contentWidth - 3, y + 6, { align: 'right' });
      y += 9;
      
      // Linhas de despesas
      setFontSafe('normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      let totalSaidas = 0;
      
      const expenses = (box.cash_box_expenses || []).filter(e => e.title && e.amount_cents > 0);
      
      const startYExpenses = y;
      const expensesRowHeight = 8; // 8px ≈ 2.8mm
      
      expenses.forEach((expense, index) => {
        const valor = expense.amount_cents / 100;
        totalSaidas += valor;
        
        // Linha alternada (zebra)
        if (index % 2 === 0) {
          doc.setFillColor(249, 250, 251);
          doc.rect(margin, y - 3, contentWidth, expensesRowHeight, 'F');
        }
        
        // Truncar descrição se muito longa (máx 150mm)
        const expenseTitle = expense.title.length > 50 
          ? expense.title.substring(0, 47) + '...' 
          : expense.title;
        doc.text(expenseTitle, margin + 3, y + 2);
        doc.text(`R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y + 2, { align: 'right' });
        y += expensesRowHeight;
      });
      
      if (expenses.length === 0) {
        doc.setTextColor(128, 128, 128);
        setFontSafe('normal');
        doc.text('Nenhuma despesa registrada', margin + 3, y + 2);
        y += expensesRowHeight;
        doc.setTextColor(0, 0, 0);
      }
      
      // Borda sutil da tabela (apenas laterais)
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.25);
      doc.line(margin, startYExpenses - 3, margin, y); // Esquerda
      doc.line(margin + contentWidth, startYExpenses - 3, margin + contentWidth, y); // Direita
      doc.line(margin, y, margin + contentWidth, y); // Base
      
      // Total de saídas (espaçamento superior de 6px ≈ 2.1mm)
      y += 2.1;
      setFontSafe('bold');
      doc.setFillColor(247, 247, 247); // Fundo sutil para total
      doc.roundedRect(margin, y, contentWidth, 9, 2, 2, 'F');
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.25);
      doc.roundedRect(margin, y, contentWidth, 9, 2, 2);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.text('TOTAL SAÍDAS', margin + 3, y + 6);
      doc.setFontSize(12);
      doc.text(`R$ ${totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y + 6, { align: 'right' });
      y += 13; // Espaçamento após total
      
      // Espaçamento entre seções (16px ≈ 5.6mm)
      y += 5.6;
      
      // ===== TABELA A RECEBER =====
      // Título da seção
      doc.setFillColor(251, 191, 36); // Amarelo
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      setFontSafe('bold');
      doc.text('A RECEBER', margin + 3, y + 7);
      y += 12;
      
      // Buscar receivables do caixa
      // @ts-expect-error - Type instantiation is excessively deep (known Supabase typing issue)
      const { data: receivablesData } = await supabase
        .from('receivables')
        .select('id, customer_name, original_amount_cents, service_type_id, due_date')
        .eq('cash_box_id', box.id);
      
      const receivables = (receivablesData || []) as Array<{
        id: string;
        customer_name: string;
        original_amount_cents: number;
        service_type_id?: string | null;
        due_date?: string | null;
      }>;
      
      const validReceivables = receivables.filter(r => r.customer_name && r.original_amount_cents > 0);
      
      // Header da tabela
      doc.setFillColor(254, 243, 199); // Amarelo claro
      doc.rect(margin, y, contentWidth, 9, 'F');
      // Borda sutil apenas nas laterais
      doc.setDrawColor(251, 191, 36);
      doc.setLineWidth(0.25);
      doc.line(margin, y, margin, y + 9); // Esquerda
      doc.line(margin + contentWidth, y, margin + contentWidth, y + 9); // Direita
      doc.line(margin, y, margin + contentWidth, y); // Topo
      doc.line(margin, y + 9, margin + contentWidth, y + 9); // Base
      
      doc.setTextColor(146, 64, 14); // Amarelo escuro
      doc.setFontSize(10);
      setFontSafe('bold');
      doc.text('Cliente', margin + 3, y + 6);
      doc.text('Serviço', margin + 70, y + 6);
      doc.text('Vencimento', margin + 130, y + 6, { align: 'center' }); // Centralizado
      doc.text('Valor', margin + contentWidth - 3, y + 6, { align: 'right' });
      y += 9;
      
      // Linhas de recebíveis
      setFontSafe('normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      let totalReceber = 0;
      
      const startYReceivables = y;
      const receivablesRowHeight = 8; // 8px ≈ 2.8mm
      
      validReceivables.forEach((receivable, index) => {
        const valor = receivable.original_amount_cents / 100;
        totalReceber += valor;
        
        const serviceType = receivable.service_type_id 
          ? serviceTypesMap.get(receivable.service_type_id)
          : null;
        const vencimento = receivable.due_date 
          ? new Date(receivable.due_date).toLocaleDateString('pt-BR')
          : '-';
        
        // Linha alternada (zebra)
        if (index % 2 === 0) {
          doc.setFillColor(249, 250, 251);
          doc.rect(margin, y - 3, contentWidth, receivablesRowHeight, 'F');
        }
        
        // Truncar textos longos para não ultrapassar limites
        const customerName = receivable.customer_name.length > 20 
          ? receivable.customer_name.substring(0, 17) + '...' 
          : receivable.customer_name;
        const serviceName = serviceType?.name 
          ? (serviceType.name.length > 15 ? serviceType.name.substring(0, 12) + '...' : serviceType.name)
          : '-';
        
        doc.text(customerName, margin + 3, y + 2);
        doc.text(serviceName, margin + 70, y + 2);
        doc.text(vencimento, margin + 130, y + 2, { align: 'center' }); // Centralizado
        doc.text(`R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y + 2, { align: 'right' });
        y += receivablesRowHeight;
      });
      
      if (validReceivables.length === 0) {
        doc.setTextColor(128, 128, 128);
        setFontSafe('normal');
        doc.text('Nenhum valor a receber', margin + 3, y + 2);
        y += receivablesRowHeight;
        doc.setTextColor(0, 0, 0);
      }
      
      // Borda sutil da tabela (apenas laterais)
      doc.setDrawColor(251, 191, 36);
      doc.setLineWidth(0.25);
      doc.line(margin, startYReceivables - 3, margin, y); // Esquerda
      doc.line(margin + contentWidth, startYReceivables - 3, margin + contentWidth, y); // Direita
      doc.line(margin, y, margin + contentWidth, y); // Base
      
      // Total a receber (espaçamento superior de 6px ≈ 2.1mm)
      y += 2.1;
      setFontSafe('bold');
      doc.setFillColor(247, 247, 247); // Fundo sutil para total
      doc.roundedRect(margin, y, contentWidth, 9, 2, 2, 'F');
      doc.setDrawColor(251, 191, 36);
      doc.setLineWidth(0.25);
      doc.roundedRect(margin, y, contentWidth, 9, 2, 2);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.text('TOTAL A RECEBER', margin + 3, y + 6);
      doc.setFontSize(12);
      doc.text(`R$ ${totalReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 3, y + 6, { align: 'right' });
      y += 13; // Espaçamento após total
      
      // Espaçamento entre seções (16px ≈ 5.6mm)
      const balanceBlockHeight = 54;
      const balanceFooterGap = 12; // reserva para não encostar no rodapé
      ensureSpace(5.6 + balanceBlockHeight + balanceFooterGap);
      y += 5.6;
      // ===== BALANÇO FINAL =====
      // Box principal com gradiente simulado
      doc.setFillColor(59, 130, 246); // Azul
      doc.roundedRect(margin, y, contentWidth, 54, 3, 3, 'F');
      
      // Borda decorativa
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(1);
      doc.roundedRect(margin, y, contentWidth, 54, 3, 3);
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      setFontSafe('bold');
      doc.text('BALANÇO FINAL', pageWidth / 2, y + 10, { align: 'center' });
      
      const valorLiquido = totals.net / 100;
      const pixTotal = totals.pix / 100;
      const cartaoTotal = totals.cartao / 100;
      const dinheiroTotal = totals.dinheiro / 100;
      
      // Linha separadora
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.line(margin + 10, y + 13, pageWidth - margin - 10, y + 13);
      
      // Valor Líquido em destaque
      doc.setFontSize(14);
      setFontSafe('normal');
      doc.text('Valor Líquido:', pageWidth / 2 - 35, y + 22);
      doc.setFontSize(16);
      setFontSafe('bold');
      doc.text(`R$ ${valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth / 2 + 35, y + 22, { align: 'right' });
      
      // PIX e Cartão lado a lado
      doc.setFontSize(11);
      setFontSafe('normal');
      const col1X = pageWidth / 2 - 40;
      const col2X = pageWidth / 2 + 5;
      
      doc.text('PIX:', col1X, y + 31);
      setFontSafe('bold');
      doc.text(`R$ ${pixTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col1X + 35, y + 31, { align: 'right' });
      
      setFontSafe('normal');
      doc.text('Cartão:', col2X, y + 31);
      setFontSafe('bold');
      doc.text(`R$ ${cartaoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col2X + 35, y + 31, { align: 'right' });
      
      // Dinheiro
      doc.setFontSize(11);
      setFontSafe('normal');
      doc.text('Dinheiro:', pageWidth / 2 - 40, y + 40);
      setFontSafe('bold');
      doc.text(`R$ ${dinheiroTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth / 2 + 5, y + 40, { align: 'right' });
      
      // Retornos centralizado
      doc.setFontSize(10);
      setFontSafe('normal');
      doc.text(`Retornos: ${totals.returnCount}`, pageWidth / 2, y + 49, { align: 'center' });
      
      // Footer com linha decorativa
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY, pageWidth - margin, footerY);
      
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      setFontSafe('normal');
      doc.text('TOP VISTORIAS - Sistema de Gestão de Caixa', margin, pageHeight - 10);
      
      setFontSafe('normal');
      const dataGeracao = formatDate(box.date, 'dd/MM/yyyy');
      doc.text(`Data do caixa: ${dataGeracao}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      
      // Salvar PDF
      const nomeArquivo = `fechamento_${box.date.replace(/-/g, '')}.pdf`;
      doc.save(nomeArquivo);
      
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao gerar PDF: ${errorMessage}`);
    }
  };

  const SidebarContent = () => {
    const isAdminUser = isAdmin;
    const historicoPath = isAdminUser ? '/admin/historico' : '/historico';
    const dashboardPath = isAdminUser ? '/admin' : '/dashboard';
    const receberPath = isAdminUser ? '/admin/receber' : '/receber';

    return (
      <>
        <div className="flex items-center gap-2 md:gap-3 border-b border-slate-200 px-2 py-3 md:px-4 md:py-4">
          <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 p-1.5 md:p-2 shadow-sm shrink-0">
            <img src="/logo.png" alt="TOP Vistorias" className="h-6 w-6 md:h-8 md:w-8 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold text-slate-900 truncate">TOP Vistorias</p>
            <p className="text-[10px] md:text-xs text-slate-500 truncate">{isAdminUser ? 'Administração' : 'Histórico'}</p>
          </div>
        </div>

        <div className="border-b border-slate-200 px-2 py-2 md:px-4 md:py-3">
          <p className="text-[10px] md:text-xs font-medium uppercase tracking-wide text-slate-400">Usuário</p>
          <p className="mt-1 text-xs md:text-sm font-medium text-slate-900 truncate">{user?.name}</p>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-3 md:px-3 md:py-4">
          <button
            onClick={() => {
              navigate(dashboardPath);
              if (isMobile) setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 md:gap-3 rounded-lg px-2 py-2 md:px-3 md:py-2.5 text-xs md:text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <BarChart3 className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
            <span className="truncate min-w-0">Dashboard</span>
          </button>
          <button
            onClick={() => {
              navigate(historicoPath);
              if (isMobile) setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 md:gap-3 rounded-lg bg-slate-100 px-2 py-2 md:px-3 md:py-2.5 text-xs md:text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200"
          >
            <BarChart3 className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
            <span className="truncate min-w-0">Histórico</span>
          </button>
          {isAdminUser ? (
            <button
              onClick={() => {
                navigate('/admin/fechamento');
                if (isMobile) setSidebarOpen(false);
              }}
              className="flex w-full items-center gap-2 md:gap-3 rounded-lg px-2 py-2 md:px-3 md:py-2.5 text-xs md:text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Calendar className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
              <span className="truncate min-w-0">Fechamento Mensal</span>
            </button>
          ) : (
            <button
              onClick={() => {
                navigate('/caixas/novo');
                if (isMobile) setSidebarOpen(false);
              }}
              className="flex w-full items-center gap-2 md:gap-3 rounded-lg px-2 py-2 md:px-3 md:py-2.5 text-xs md:text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Plus className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
              <span className="truncate min-w-0">Novo Caixa</span>
            </button>
          )}
          <button
            onClick={() => {
              navigate(receberPath);
              if (isMobile) setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 md:gap-3 rounded-lg px-2 py-2 md:px-3 md:py-2.5 text-xs md:text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <DollarSign className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
            <span className="truncate min-w-0">A Receber</span>
          </button>
        </nav>

        <div className="border-t border-slate-200 p-2 md:p-3">
          <button
            onClick={() => {
              signOut();
              if (isMobile) setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 md:gap-3 rounded-lg px-2 py-2 md:px-3 md:py-2.5 text-xs md:text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
            <span className="truncate min-w-0">Sair</span>
          </button>
        </div>
      </>
    );
  };

  return (
    <>
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 bg-white">
        <SidebarContent />
      </aside>

      {/* Sidebar Mobile */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-full flex-col bg-white">
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Mobile Menu Button - Sticky */}
        <div className="sticky top-0 z-50 md:hidden bg-[#f5f5f7] border-b border-slate-200 px-4 py-3">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>
        </div>
        <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Histórico de Caixas</h1>
            <p className="mt-1 text-sm text-slate-600">Pesquise e visualize caixas fechados por período</p>
          </div>

          {/* Date Selector */}
          <div className="rounded-2xl bg-white p-4 md:p-6 shadow-sm">
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
          <div className="rounded-2xl bg-white p-4 md:p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h2 className="text-base md:text-lg font-semibold text-slate-900">
                {filteredCashBoxes.length} caixa{filteredCashBoxes.length !== 1 ? 's' : ''} encontrado{filteredCashBoxes.length !== 1 ? 's' : ''}
              </h2>
              <Input
                value={cashBoxSearch}
                onChange={(event) => setCashBoxSearch(event.target.value)}
                placeholder="Buscar por nota, serviço ou despesa..."
                aria-label="Buscar caixas"
                className="h-10 rounded-lg border-slate-200 w-full md:w-80"
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
                        onClick={() => setViewingCashBox(box)}
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-2 flex-1">
                            <p className="text-base font-semibold text-slate-900">{formatDate(box.date)}</p>
                            {box.note && (
                              <p className="text-sm text-slate-600">{box.note}</p>
                            )}
                            <p className="text-xs text-slate-500">
                              {box.cash_box_services?.length ?? 0} serviços · {box.cash_box_expenses?.length ?? 0}{' '}
                              despesas · {totals.returnCount} retornos
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3 md:gap-4 text-xs">
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
                              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Dinheiro</p>
                              <p className="mt-1 text-sm font-semibold text-green-600">{formatCurrency(totals.dinheiro)}</p>
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
                              navigate(`/caixas/${box.id}`, {
                                state: {
                                  returnTo: isAdmin ? '/admin/historico' : '/historico',
                                  filters: {
                                    startDate,
                                    endDate,
                                    search: cashBoxSearch,
                                  }
                                }
                              });
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

    <Dialog open={viewingCashBox !== null} onOpenChange={(open) => !open && setViewingCashBox(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Caixa</DialogTitle>
          <DialogDescription>
            {viewingCashBox && `Caixa de ${formatDate(viewingCashBox.date)}`}
          </DialogDescription>
        </DialogHeader>
        {viewingCashBox && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bruto</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600">
                  {formatCurrency(computeBoxTotals(viewingCashBox).gross)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Líquido</p>
                <p className="mt-1 text-lg font-semibold text-cyan-600">
                  {formatCurrency(computeBoxTotals(viewingCashBox).net)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Despesas</p>
                <p className="mt-1 text-lg font-semibold text-red-600">
                  {formatCurrency(computeBoxTotals(viewingCashBox).expenses)}
                </p>
              </div>
            </div>

            {viewingCashBox.note && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Observação</p>
                <p className="text-sm text-slate-600">{viewingCashBox.note}</p>
              </div>
            )}

            {viewingCashBox.cash_box_services && viewingCashBox.cash_box_services.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">Serviços ({viewingCashBox.cash_box_services.length})</p>
                <div className="space-y-2">
                  {viewingCashBox.cash_box_services.map((service) => (
                    <div key={service.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {service.service_types?.name || 'Serviço'}
                        </p>
                        <p className="text-xs text-slate-500">
                          Quantidade: {service.quantity ?? 0} · Valor: {formatCurrency(service.unit_price_cents ?? 0)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(service.total_cents ?? ((service.unit_price_cents ?? 0) * (service.quantity ?? 0)))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewingCashBox.cash_box_expenses && viewingCashBox.cash_box_expenses.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">Despesas ({viewingCashBox.cash_box_expenses.length})</p>
                <div className="space-y-2">
                  {viewingCashBox.cash_box_expenses.map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{expense.title}</p>
                      </div>
                      <p className="text-sm font-semibold text-red-600">
                        {formatCurrency(expense.amount_cents ?? 0)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">PIX</p>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {formatCurrency(computeBoxTotals(viewingCashBox).pix)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cartão</p>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {formatCurrency(computeBoxTotals(viewingCashBox).cartao)}
                </p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setViewingCashBox(null)}>
            Fechar
          </Button>
          {viewingCashBox && (
            <Button onClick={(e) => {
              e.preventDefault();
              const cashBoxId = viewingCashBox.id;
              setViewingCashBox(null);
              setTimeout(() => {
                navigate(`/caixas/${cashBoxId}`, {
                  state: {
                    returnTo: isAdmin ? '/admin/historico' : '/historico',
                    filters: {
                      startDate,
                      endDate,
                      search: cashBoxSearch,
                    }
                  }
                });
              }, 100);
            }}>
              Editar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
