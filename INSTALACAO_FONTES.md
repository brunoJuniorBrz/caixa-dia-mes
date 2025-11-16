# ⚠️ IMPORTANTE: Instale as Fontes para Corrigir o PDF

O erro que você está vendo acontece porque **as fontes Inter ainda não foram instaladas**.

## Solução Rápida

Execute um dos comandos abaixo para instalar as fontes:

### Opção 1: Via npm (Recomendado)

```bash
npm install @fontsource/inter
```

Depois copie as fontes:
```bash
# Windows PowerShell
Copy-Item "node_modules\@fontsource\inter\files\inter-latin-400-normal.ttf" "public\fonts\Inter-Regular.ttf"
Copy-Item "node_modules\@fontsource\inter\files\inter-latin-700-normal.ttf" "public\fonts\Inter-Bold.ttf"

# Linux/Mac
cp node_modules/@fontsource/inter/files/inter-latin-400-normal.ttf public/fonts/Inter-Regular.ttf
cp node_modules/@fontsource/inter/files/inter-latin-700-normal.ttf public/fonts/Inter-Bold.ttf
```

### Opção 2: Download Manual

1. Acesse: https://fonts.google.com/specimen/Inter
2. Clique em "Download family"
3. Extraia o arquivo ZIP
4. Copie `Inter-Regular.ttf` e `Inter-Bold.ttf` para `public/fonts/`

### Opção 3: Usar Roboto (Alternativa)

Se preferir usar Roboto:
```bash
npm install @fontsource/roboto
cp node_modules/@fontsource/roboto/files/roboto-latin-400-normal.ttf public/fonts/Roboto-Regular.ttf
cp node_modules/@fontsource/roboto/files/roboto-latin-700-normal.ttf public/fonts/Roboto-Bold.ttf
```

## Verificação

Após instalar, verifique se os arquivos existem:
```bash
dir public\fonts
```

Você deve ver:
- `Inter-Regular.ttf` (ou `Roboto-Regular.ttf`)
- `Inter-Bold.ttf` (ou `Roboto-Bold.ttf`)

## Status Atual

✅ **Código corrigido** - O sistema agora:
- Tenta carregar fontes Inter primeiro
- Se falhar, tenta Roboto
- Se ambas falharem, usa Helvetica (pode ter problemas com acentos)
- Remove todos os emojis que causavam problemas
- Usa fonte dinamicamente baseada no que está disponível

⚠️ **Fontes não instaladas** - Por isso você está vendo o erro. Instale as fontes seguindo as opções acima.

## Após Instalar

1. Reinicie o servidor de desenvolvimento (`npm run dev`)
2. Tente gerar um PDF novamente
3. Verifique no console se aparece: `✓ Fontes Inter registradas com sucesso`
4. O PDF deve exibir acentos corretamente

## Nota

O código está preparado para funcionar **mesmo sem as fontes** (usando Helvetica), mas os acentos podem aparecer incorretamente. Para garantir acentos perfeitos, instale as fontes Inter ou Roboto.




