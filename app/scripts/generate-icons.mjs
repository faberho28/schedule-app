// Genera los íconos de la PWA en `public/` a partir de un glifo SVG.
// Uso: `npm run icons`. Los PNG resultantes se versionan; este script solo se ejecuta al cambiar el diseño.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PRIMARY = '#2563EB';
const outDir = fileURLToPath(new URL('../public/', import.meta.url));

// Calendario con marca de verificación. Cabe en el círculo de zona segura (80 %) de los íconos
// "maskable", por lo que el mismo glifo sirve para ambos tipos.
const glyph = `
  <rect x="136" y="160" width="240" height="216" rx="28" fill="#FFFFFF"/>
  <rect x="186" y="128" width="28" height="64" rx="14" fill="#FFFFFF"/>
  <rect x="298" y="128" width="28" height="64" rx="14" fill="#FFFFFF"/>
  <path d="M136 236h240" stroke="${PRIMARY}" stroke-width="16"/>
  <path d="M200 306l40 40 72-72" fill="none" stroke="${PRIMARY}" stroke-width="22"
        stroke-linecap="round" stroke-linejoin="round"/>`;

const svg = (background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${background}${glyph}</svg>`;

// Ícono normal: esquinas redondeadas. Maskable: fondo a sangre; el sistema aplica su propia máscara.
const rounded = svg(`<rect width="512" height="512" rx="112" fill="${PRIMARY}"/>`);
const fullBleed = svg(`<rect width="512" height="512" fill="${PRIMARY}"/>`);

await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}favicon.svg`, rounded);
await sharp(Buffer.from(rounded)).resize(192, 192).png().toFile(`${outDir}icon-192.png`);
await sharp(Buffer.from(rounded)).resize(512, 512).png().toFile(`${outDir}icon-512.png`);
await sharp(Buffer.from(fullBleed)).resize(512, 512).png().toFile(`${outDir}icon-maskable-512.png`);
await sharp(Buffer.from(fullBleed)).resize(180, 180).png().toFile(`${outDir}apple-touch-icon.png`);

console.log('Íconos generados en app/public/');
