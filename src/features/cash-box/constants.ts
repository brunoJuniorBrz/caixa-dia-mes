import { Bike, Car, FileText, RefreshCcw, Search, ShieldCheck, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const SERVICE_CODE_ORDER = [
  'CARRO',
  'MOTO',
  'CAMINHONETE',
  'CAMINHAO',
  'PESQUISA',
  'CAUTELAR_MOTO',
  'CAUTELAR_CARRO',
  'CAUTELAR_CAMINHAO_CAMINHONETE',
  'REVISTORIA_MULTA',
  'REV_RETORNO',
] as const;

export type ServiceCode = (typeof SERVICE_CODE_ORDER)[number];

export const SERVICE_ICON_MAP: Record<ServiceCode, LucideIcon> = {
  CARRO: Car,
  MOTO: Bike,
  CAMINHONETE: Truck,
  CAMINHAO: Truck,
  PESQUISA: Search,
  CAUTELAR_MOTO: ShieldCheck,
  CAUTELAR_CARRO: ShieldCheck,
  CAUTELAR_CAMINHAO_CAMINHONETE: ShieldCheck,
  REVISTORIA_MULTA: FileText,
  REV_RETORNO: RefreshCcw,
};

export const SERVICE_BADGE_CLASSNAME =
  'rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700';

export const SERVICE_PRICE_FALLBACKS: Partial<Record<ServiceCode, number>> = {
  // Pesquisa deve iniciar em R$ 60,00 até que o valor padrão venha preenchido do banco
  PESQUISA: 6000,
};
