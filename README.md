# Portal SiProper

Frontend portal terpadu (`portal.siproper.com`) — Next.js 16 + React 19 + Tailwind v4.

## Setup

```bash
npm install
npm run dev
```

Buka http://localhost:3000

## Aset Logo

Letakkan file aset di folder `public/`:

- `public/logo-mark.png` — logo "S" mark (square, 512×512 disarankan)
- `public/favicon.png` — favicon 32×32 / 64×64
- `public/logo-full.png` — logo horizontal "SiProper Digital System" (opsional, untuk halaman lain)

## Catatan

- No-index aktif di tiga lapisan: `metadata.robots`, header `X-Robots-Tag`, dan `app/robots.ts`.
- Font Poppins dimuat via `next/font/google` (self-hosted, tanpa request runtime ke Google).
- Animasi scroll memakai IntersectionObserver — ringan, respect `prefers-reduced-motion`.
- Subdomain target: `sys1.siproper.com` (Sales/Likuiditas/Keuangan), `sys2.siproper.com` (Legal/Teknik/HR).
