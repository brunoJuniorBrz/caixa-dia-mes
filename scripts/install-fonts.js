/**
 * Script para instalar fontes Inter necessárias para geração de PDF
 * 
 * Uso: node scripts/install-fonts.js
 * 
 * Este script baixa as fontes Inter do Google Fonts e as coloca em public/fonts/
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const fontsDir = path.join(rootDir, 'public', 'fonts');

// URLs das fontes Inter do Google Fonts
const FONTS = {
  'Inter-Regular.ttf': 'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf',
  'Inter-Bold.ttf': 'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.ttf',
};

// Alternativa: usar CDN do jsDelivr
const FONTS_CDN = {
  'Inter-Regular.ttf': 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-400-normal.ttf',
  'Inter-Bold.ttf': 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-700-normal.ttf',
};

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Seguir redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Falha ao baixar: ${url} (status: ${response.statusCode})`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function installFonts() {
  // Criar diretório se não existir
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
    console.log(`✓ Criado diretório: ${fontsDir}`);
  }

  console.log('Baixando fontes Inter...\n');

  for (const [filename, url] of Object.entries(FONTS_CDN)) {
    const dest = path.join(fontsDir, filename);
    
    try {
      console.log(`Baixando ${filename}...`);
      await downloadFile(url, dest);
      const stats = fs.statSync(dest);
      console.log(`✓ ${filename} (${(stats.size / 1024).toFixed(2)} KB)\n`);
    } catch (error) {
      console.error(`✗ Erro ao baixar ${filename}:`, error.message);
      console.log(`  Tentando URL alternativa...`);
      
      // Tentar URL alternativa
      try {
        const altUrl = FONTS[filename];
        if (altUrl) {
          await downloadFile(altUrl, dest);
          const stats = fs.statSync(dest);
          console.log(`✓ ${filename} (${(stats.size / 1024).toFixed(2)} KB) - URL alternativa\n`);
        } else {
          throw new Error('Nenhuma URL alternativa disponível');
        }
      } catch (altError) {
        console.error(`✗ Falha ao baixar ${filename} de todas as fontes\n`);
        throw altError;
      }
    }
  }

  console.log('✓ Todas as fontes foram instaladas com sucesso!');
  console.log(`\nFontes instaladas em: ${fontsDir}`);
}

installFonts().catch((error) => {
  console.error('\n✗ Erro ao instalar fontes:', error.message);
  console.log('\nInstruções manuais:');
  console.log('1. Acesse https://fonts.google.com/specimen/Inter');
  console.log('2. Baixe a família Inter');
  console.log('3. Extraia e copie Inter-Regular.ttf e Inter-Bold.ttf para public/fonts/');
  process.exit(1);
});




