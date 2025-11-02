export function formatCurrency(amountInCents: number): string {
  const amountInReais = amountInCents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amountInReais);
}

export function parseCurrency(formattedValue: string): number {
  // Remove R$, espaços, pontos (milhares) e converte vírgula para ponto
  const cleaned = formattedValue
    .replace(/R\$\s?/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  
  const amountInReais = parseFloat(cleaned) || 0;
  return Math.round(amountInReais * 100);
}

export function centsToReais(cents: number): number {
  return cents / 100;
}

export function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

