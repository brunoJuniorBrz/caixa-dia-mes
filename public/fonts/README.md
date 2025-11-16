# Fontes para Geração de PDF

Este diretório contém as fontes TTF necessárias para gerar PDFs com suporte completo a caracteres PT-BR.

## Fontes Necessárias

Para garantir que os PDFs exibam corretamente acentos e caracteres especiais em português, você precisa adicionar as seguintes fontes:

### Opção 1: Inter (Recomendado)
- `Inter-Regular.ttf` - Fonte regular
- `Inter-Bold.ttf` - Fonte negrito

**Download:**
- https://fonts.google.com/specimen/Inter
- Ou use: `npm install @fontsource/inter` e copie os arquivos `.ttf` de `node_modules/@fontsource/inter/files/`

### Opção 2: Roboto (Alternativa)
- `Roboto-Regular.ttf` - Fonte regular
- `Roboto-Bold.ttf` - Fonte negrito

**Download:**
- https://fonts.google.com/specimen/Roboto
- Ou use: `npm install @fontsource/roboto` e copie os arquivos `.ttf`

## Instalação Rápida (Inter)

```bash
# Instalar pacote npm
npm install @fontsource/inter

# Copiar fontes para public/fonts
cp node_modules/@fontsource/inter/files/inter-latin-400-normal.ttf public/fonts/Inter-Regular.ttf
cp node_modules/@fontsource/inter/files/inter-latin-700-normal.ttf public/fonts/Inter-Bold.ttf
```

## Verificação

Após adicionar as fontes, gere um PDF e verifique:
1. Acentos aparecem corretamente (á, é, í, ó, ú, ã, õ, ç)
2. Não há caracteres ou símbolos estranhos
3. O PDF funciona offline (sem conexão à internet)

## Nota

As fontes são embutidas no PDF durante a geração, garantindo que o documento seja legível em qualquer dispositivo, mesmo sem as fontes instaladas.




