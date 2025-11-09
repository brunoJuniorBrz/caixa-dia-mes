/**
 * Utilitário para carregar e registrar fontes TTF no jsPDF
 * Garante suporte completo para caracteres PT-BR (acentos, cedilha, etc.)
 */

import type { jsPDF } from 'jspdf';

// Cache para evitar recarregar a fonte múltiplas vezes
let fontCache: {
  regular?: ArrayBuffer;
  bold?: ArrayBuffer;
} = {};

/**
 * Carrega uma fonte TTF do servidor
 */
async function loadFont(url: string): Promise<ArrayBuffer> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Fonte não encontrada: ${url}. Instale as fontes seguindo as instruções em INSTALACAO_FONTES.md`);
      }
      throw new Error(`Erro ao carregar fonte: ${url} (status: ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    
    // Verificar se o arquivo não está vazio
    if (arrayBuffer.byteLength === 0) {
      throw new Error(`Fonte vazia: ${url}`);
    }
    
    // Verificar se é um TTF válido (TTF começa com bytes específicos)
    const bytes = new Uint8Array(arrayBuffer.slice(0, 4));
    const signature = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    // TTF pode começar com '00 01 00 00' ou 'OTTO' (OpenType)
    // Verificar se é uma fonte variável (que jsPDF não suporta bem)
    const header = new Uint8Array(arrayBuffer.slice(0, 12));
    const headerHex = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Fontes variáveis geralmente têm características específicas que jsPDF não processa bem
    // Se a assinatura não for TTF padrão, pode ser variável
    if (signature !== '00010000' && signature !== '4f54544f') {
      console.warn(`Aviso: ${url} pode não ser um arquivo TTF estático compatível (assinatura: ${signature})`);
      // Tentar detectar se é variável verificando o nome da tabela
      const isVariable = headerHex.includes('fvar') || url.includes('Variable');
      if (isVariable) {
        throw new Error(`Fonte variável detectada: ${url}. O jsPDF requer fontes TTF estáticas. Baixe fontes estáticas do Inter.`);
      }
    }
    
    return arrayBuffer;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error(`Não foi possível carregar a fonte: ${url}. Verifique se o servidor está rodando e se o arquivo existe.`);
    }
    throw error;
  }
}

/**
 * Registra a fonte Inter Regular no jsPDF
 */
export async function registerInterRegular(doc: jsPDF): Promise<void> {
  if (!fontCache.regular) {
    fontCache.regular = await loadFont('/fonts/Inter-Regular.ttf');
  }

  const fontBase64 = arrayBufferToBase64(fontCache.regular);
  
  try {
    // @ts-ignore - jsPDF internal API
    doc.addFileToVFS('Inter-Regular.ttf', fontBase64);
    // @ts-ignore
    doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
    
    // Verificar se a fonte foi registrada corretamente
    // @ts-ignore
    const fonts = doc.getFontList();
    if (!fonts || !fonts['Inter']) {
      throw new Error('Fonte Inter não foi registrada corretamente no jsPDF');
    }
  } catch (error) {
    console.error('Erro ao registrar fonte Inter Regular:', error);
    // Se for erro de fonte variável, dar mensagem mais clara
    if (error instanceof Error && error.message.includes('variável')) {
      throw error;
    }
    throw new Error(`Falha ao registrar fonte Inter Regular. Certifique-se de usar fontes TTF estáticas (não variáveis). Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Registra a fonte Inter Bold no jsPDF
 */
export async function registerInterBold(doc: jsPDF): Promise<void> {
  if (!fontCache.bold) {
    fontCache.bold = await loadFont('/fonts/Inter-Bold.ttf');
  }

  const fontBase64 = arrayBufferToBase64(fontCache.bold);
  
  try {
    // @ts-ignore - jsPDF internal API
    doc.addFileToVFS('Inter-Bold.ttf', fontBase64);
    // @ts-ignore
    doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
    
    // Verificar se a fonte foi registrada corretamente
    // @ts-ignore
    const fonts = doc.getFontList();
    if (!fonts || !fonts['Inter']) {
      throw new Error('Fonte Inter Bold não foi registrada corretamente no jsPDF');
    }
  } catch (error) {
    console.error('Erro ao registrar fonte Inter Bold:', error);
    // Se for erro de fonte variável, dar mensagem mais clara
    if (error instanceof Error && error.message.includes('variável')) {
      throw error;
    }
    throw new Error(`Falha ao registrar fonte Inter Bold. Certifique-se de usar fontes TTF estáticas (não variáveis). Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Registra todas as fontes Inter necessárias
 */
export async function registerInterFonts(doc: jsPDF): Promise<void> {
  // Registrar sequencialmente para melhor tratamento de erros
  await registerInterRegular(doc);
  await registerInterBold(doc);
}

/**
 * Converte ArrayBuffer para Base64 de forma eficiente
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 8192; // Processar em chunks para evitar problemas com strings muito grandes
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    const binary = String.fromCharCode.apply(null, Array.from(chunk));
    chunks.push(btoa(binary));
  }
  
  return chunks.join('');
}

/**
 * Fallback: Se as fontes Inter não estiverem disponíveis,
 * usa Roboto que geralmente já vem com suporte melhor que Helvetica
 */
export async function registerRobotoFonts(doc: jsPDF): Promise<void> {
  try {
    // Tenta carregar Roboto como fallback
    const regular = await loadFont('/fonts/Roboto-Regular.ttf');
    const bold = await loadFont('/fonts/Roboto-Bold.ttf');
    
    const regularBase64 = arrayBufferToBase64(regular);
    const boldBase64 = arrayBufferToBase64(bold);
    
    // @ts-ignore
    doc.addFileToVFS('Roboto-Regular.ttf', regularBase64);
    // @ts-ignore
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    
    // @ts-ignore
    doc.addFileToVFS('Roboto-Bold.ttf', boldBase64);
    // @ts-ignore
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  } catch (error) {
    console.warn('Fontes Roboto não encontradas, usando fonte padrão', error);
  }
}

