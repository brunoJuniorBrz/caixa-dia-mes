-- Atualiza o valor padrão do serviço PESQUISA para R$ 60,00 (6000 centavos)
UPDATE public.service_types
SET default_price_cents = 6000
WHERE code = 'PESQUISA';


