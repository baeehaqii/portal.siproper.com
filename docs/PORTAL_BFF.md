# Portal BFF — SSO login (dev)

OAuth2 Authorization Code + PKCE client untuk sys2 (IdP). Token disimpan server-side,
disegel di cookie httpOnly terenkripsi (iron-session). Lihat `docs/CONTRACT.md`.

## Flow (launcher)
Landing Portal = peluncur. Klik card modul → kalau **belum login** muncul modal SSO →
redirect ke login sys2 (PKCE) → balik & **lanjut deep-link** ke modul yang diklik. Kalau
**sudah login**, card ter-gating `modules{}` (yang tak diizinkan tampil terkunci) dan klik
langsung deep-link.

## File
- `lib/sso.ts` — config, PKCE/state, session, exchange/refresh, `fetchAuthorization()`.
- `lib/targets.ts` — base URL deep-link (sys1/sys2/help) + validasi anti open-redirect.
- `app/page.tsx` — landing (server): fetch authz → kirim state ke `ModuleGrid`.
- `app/components/ModuleGrid.tsx` — grid card + logika klik (login/deep-link/gating).
- `app/components/AuthModal.tsx` — modal "Masuk dengan akun SiProper" (→ SSO, tanpa pegang password).
- `app/api/auth/{login,callback,logout}/route.ts` — flow OAuth (login bawa `?next=` deep-link).
- `app/api/auth/password/route.ts` — form login (password grant via client `portal_pwd`) + verifikasi Turnstile + set `portal_remember`.
- `app/components/AuthModal.tsx` — form (email/username + password + show/hide) + **Ingat saya** + **Lupa password** (→ help/submit) + widget **Turnstile** + link "Masuk via SSO".
- `lib/turnstile.ts` — verifikasi Cloudflare Turnstile (server).
- `lib/handoff.ts` + `app/api/go/route.ts` + `app/api/sso/redeem/route.ts` — **session handoff** (form login → sesi web sys2 mulus).
- `app/logout-success/page.tsx` — halaman terima kasih + **durasi akses per modul** (3 tanggal).
- `app/dashboard/page.tsx` — **debug** view authz mentah (tidak ditaut; boleh dihapus).
- `.env.local` — `SSO_*`, `SSO_PWD_CLIENT_*`, `SESSION_SECRET`, `NEXT_PUBLIC_SYS2_URL`, `SSO_HANDOFF_SECRET`, `*_TURNSTILE_*` (gitignored).

## Login (modal: form + SSO)
- **Form** (utama): email/username + password → password grant via `portal_pwd`. Wajib lolos **Turnstile** (widget sama dgn sys2). **Ingat saya** → sesi 30 hari (cookie `portal_remember`), lepas → 1 hari. **Lupa password** → `help.siproper.com/submit`.
- **Masuk via SSO** (cadangan): auth_code+PKCE via `portal`. Dukung 2FA + langsung bikin sesi sys2.
- **2 client wajib**: 1 client Passport tak bisa auth_code + password sekaligus (`password_client=true` → first-party → auth_code ditolak). `portal`=SSO, `portal_pwd`=form. Sesi simpan `grantClient` untuk refresh.
- **Turnstile key**: dev pakai TEST key (selalu lolos, real key terikat domain sys2); **produksi** pakai key real sys2 + daftarkan `portal.siproper.com` di Cloudflare. Lihat komentar `.env.local`.

## Session handoff (form → sys2 mulus)
Form login hanya bikin sesi Portal. Agar deep-link sys2 tak minta login lagi: klik modul sys2 → `/api/go?to=…&module=…` → mint kode sekali-pakai (60s) → `sys2 /sso/enter?code` → redeem back-channel (`SSO_HANDOFF_SECRET`) → `Auth::login` web sys2 + buka log akses modul → redirect ke modul. (Caveat: form+handoff melewati 2FA; akun 2FA pakai SSO.)

## Durasi akses (data di DB sys2)
Tabel `system_access_logs` (sys2). Dibuka per **modul** saat `/sso/enter` (close-others-then-open → durasi non-overlap), ditutup saat logout. Ringkasan (`summaryFor`, 3 tanggal) dihitung sys2 di `/sso/logout` lalu dikirim ke `/logout-success?s=`. sys1 lapor modulnya via `POST /api/access/log`.

## Logout (single logout)
Portal `/api/auth/logout` → sys2 `/sso/logout` (GET) ; Filament "Keluar" → `/sso/logout` (POST). `/sso/logout` terima GET+POST & dikecualikan CSRF (cegah 405/419). → `Auth::logout` (event: revoke token + tutup log) → `/logout-success`.

## Jalankan & uji
```bash
# terminal 1 — sys2 (IdP)
cd "../siproper-baehaqi-new Laravel 12" && php artisan serve --port=8000
# terminal 2 — Portal
npm run dev   # http://localhost:3000
```
1. Buka **http://localhost:3000** → klik card **Legal** (deep-link ke sys2 lokal `/admin`).
2. Modal SSO → "Masuk dengan akun SiProper" → login di sys2 (Filament `/admin/login`).
3. Balik otomatis & masuk ke modul Legal sys2, sesuai role/akses user.

> **Catatan login Filament:** setelah login, Filament bisa mengarahkan ke dashboard admin-nya
> sendiri, bukan kembali ke authorize. Jika itu terjadi, buka Portal lagi (kini sudah login) →
> card sudah ter-gating, klik langsung deep-link.

## Sudah diverifikasi
- Landing logged-out render OK; card deep-link Legal/Teknik/HR → `http://127.0.0.1:8000/admin`.
- `/api/auth/login?next=…` → 307 ke `/oauth/authorize` (client_id=portal, PKCE S256, scope `profile authz`, state) + cookie terenkripsi; `next` divalidasi (anti open-redirect).
- authorize tanpa auth → 302 ke `/login` (Fortify→Filament). Login interaktif super_admin **berhasil** end-to-end (semua modul ✓, 1307 permission).
- Sisa manual: login user non-super untuk lihat gating card aktif.

## Login (modal: form + SSO)
Modal & chip "Masuk" membuka modal dengan **2 jalur**:
1. **Form username/password** (utama) → `POST /api/auth/password` → password grant via client **`portal_pwd`**. Login di tempat, tanpa redirect.
2. **Link "Masuk via SSO"** (cadangan) → `/api/auth/login` → login sys2 (Auth Code + PKCE) via client **`portal`**.

> **2 client wajib:** 1 client Passport TIDAK bisa auth_code + password sekaligus — `password_client=true`
> membuat client *first-party* → grant `authorization_code` ditolak (`handlesGrant()`). Jadi `portal` = SSO,
> `portal_pwd` = form. Sesi menyimpan `grantClient` agar refresh pakai client penerbit yang benar.

> **Caveat deep-link:** login via **form** hanya membuat sesi Portal, BUKAN sesi web sys2 (beda origin).
> Saat klik modul sys2 (Legal/HR/Teknik) setelah login form, sys2 minta login sekali lagi. Login via
> **SSO** membuat sesi sys2 sekaligus → deep-link langsung jalan. (Itu sebab SSO disediakan untuk akun 2FA / akses cepat.)

## Logout (single logout)
- Portal `/api/auth/logout` → hapus sesi portal → redirect ke sys2 `GET /sso/logout?redirect=…/logout-success`.
- sys2 `/sso/logout` → `Auth::logout()` (event Logout → **revoke semua token Passport user**) → redirect ke portal `/logout-success` (halaman terima kasih).
- Filament "Keluar" diganti jadi GET link ke `/sso/logout` (hindari 419 CSRF; lihat AdminPanelProvider `userMenuItems`).
- **Token invalidation:** league menolak access token ter-`revoked` (BearerTokenValidator) → setelah logout di sys2, panggilan portal ke `/api/me/authorization` langsung 401. Terverifikasi.

## Store bersama (`lib/store.ts`)
KV kecil: pakai **Redis bila `REDIS_URL` di-set** (produksi/multi-instance), else **fallback in-memory** (dev, tanpa infra). Dipakai handoff code, cache authz, & rate-limit. Self-check: `node --experimental-strip-types lib/store.test.ts`.

## Hardening — SELESAI 2026-06-24
- **Rate-limit `/api/auth/password`**: fixed-window per IP (`rl:pwd:<ip>`, 10/15mnt → 429). `ponytail`: tambah keying per-username / sliding window kalau ada abuse.
- **Handoff code → store bersama**: pindah dari `Map` in-memory ke `lib/store.ts` (Redis di prod). Atomic one-time via `GETDEL`. Beres masalah multi-instance.
- **Cache authz §3.3**: `fetchAuthorization` cache payload TTL 60s di store (key = hash access token; refresh merotasi token → cache otomatis basi).
- **Single-flight refresh §D5** + **auto-refresh on 401**: refresh dedupe in-process per refresh-token; 401 → refresh sekali → retry.

## Deviasi dari kontrak (sisa, sengaja)
- **Sesi & PKCE/state tetap di cookie terenkripsi**, bukan Redis (CONTRACT P0#6 ingin session-id+state server-side + cookie pra-sesi `__Host-`). Cookie iron-session **sudah stateless → aman multi-instance**; sisa P0#6 = postur keamanan, bukan correctness. Swap saat produksi bila perlu.
- **Tanpa grace/fail-closed §4**: normatif untuk resource server beraksi destruktif (sys1); Portal **read-only** (gating UI) → moot. Single-flight refresh hanya in-process (cross-instance dup-refresh ditoleransi; reuse-detection = Fase 4).
- **`REDIS_URL`** (env baru, opsional): kosong = fallback in-memory (dev). Set di produksi.
