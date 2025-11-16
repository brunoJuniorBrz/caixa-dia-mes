# ⚠️ IMPORTANTE: Baixar Fontes Estáticas (Não Variáveis)

O jsPDF **NÃO suporta fontes variáveis**. Você precisa baixar fontes **estáticas** do Inter.

## Problema Atual

As fontes instaladas são **variáveis** (Variable Fonts):
- `Inter-VariableFont_opsz,wght.ttf` ❌ (não funciona com jsPDF)
- `Inter-Italic-VariableFont_opsz,wght.ttf` ❌ (não funciona com jsPDF)

## Solução: Baixar Fontes Estáticas

### Opção 1: Via Google Fonts (Recomendado)

1. Acesse: https://fonts.google.com/specimen/Inter
2. Clique em **"Download family"**
3. Extraia o ZIP
4. Na pasta extraída, vá em `static/`
5. Copie estes arquivos para `public/fonts/`:
   - `Inter-Regular.ttf` (ou `Inter_18pt-Regular.ttf`)
   - `Inter-Bold.ttf` (ou `Inter_18pt-Bold.ttf`)

### Opção 2: Via npm (Mais Fácil)

```bash
npm install @fontsource/inter
```

Depois copie as fontes estáticas:
```powershell
# Windows PowerShell
Copy-Item "node_modules\@fontsource\inter\files\inter-latin-400-normal.ttf" "public\fonts\Inter-Regular.ttf"
Copy-Item "node_modules\@fontsource\inter\files\inter-latin-700-normal.ttf" "public\fonts\Inter-Bold.ttf"
```

### Opção 3: Download Direto (GitHub)

Baixe diretamente do repositório oficial do Inter:

**Inter-Regular.ttf:**
https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf

**Inter-Bold.ttf:**
https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.ttf

Salve esses arquivos em `public/fonts/`

## Verificação

Após baixar, verifique:
```bash
dir public\fonts\Inter-*.ttf
```

Você deve ver:
- ✅ `Inter-Regular.ttf` (arquivo estático, não variável)
- ✅ `Inter-Bold.ttf` (arquivo estático, não variável)

**NÃO use arquivos com "Variable" no nome!**

## Após Instalar

1. Delete os arquivos variáveis antigos (opcional):
   ```powershell
   Remove-Item "public\fonts\Inter-VariableFont*.ttf"
   Remove-Item "public\fonts\Inter-Italic-VariableFont*.ttf"
   ```

2. Reinicie o servidor: `npm run dev`

3. Teste gerar um PDF - deve funcionar agora!




