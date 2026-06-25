# Panduan Integrasi SSO untuk Programmer sys1

> Untuk tim sys1 (Laravel). Tujuan: sys1 ikut SSO SiProper — user yang sudah login lewat Portal bisa masuk modul sys1 tanpa login ulang, dengan role/permission/tenant dari sys2.
> Acuan kontrak (jangan diubah sepihak): [`CONTRACT.md`](CONTRACT.md). Kalau ada beda antara panduan ini dan CONTRACT.md, **CONTRACT.md yang menang**.
> Estimasi kerja: **±3–5 hari**. Sebagian besar konfigurasi, bukan logika baru.

---

## 0. Konsep singkat (baca dulu, 2 menit)

- sys2 = **Identity Provider** di `auth.siproper.com`. Dia satu-satunya tempat ketik password, dan pemilik semua role/permission/akses proyek.
- sys1 = **OAuth client + resource server**. sys1 **punya alur login OAuth-nya sendiri** ke sys2 (bukan dititipi token Portal).
- sys1 **tidak mendefinisikan permission/role/ID proyek sendiri** — semua dibaca dari sys2 lewat `GET /api/me/authorization`.
- Validasi token di sys1 **stateless**: cukup verifikasi tanda tangan pakai file public key statis, tanpa nembak balik ke sys2 tiap request.

Alur dari sisi user: klik kartu modul di Portal → diarahkan ke sys1 → sys1 redirect ke sys2 (silent, karena sesi sudah ada) → balik ke sys1 dengan `code` → sys1 tukar jadi token → tampil halaman modul sesuai hak.

---

## 1. Yang kami (tim IdP/sys2) berikan ke kamu

Sebelum mulai, kamu akan menerima:

| Item | Keterangan |
|---|---|
| `client_id` = `sys1` & `client_secret` | kredensial OAuth client sys1 (secret = rahasia, simpan di `.env`) |
| `oauth-public.key` | file public key statis untuk verifikasi tanda tangan token (tidak rahasia, tapi harus persis sama dengan IdP) |
| URL IdP | `https://auth.siproper.com` |
| **Mock IdP** | IdP tiruan untuk dev/test lokal — kamu bisa kerja & tes tanpa menunggu sys2 produksi siap (lihat bagian 7) |
| Paket `siproper/sso-client` | paket Composer berisi OAuth client + validasi token + cache authz + grace. *(Sedang kami siapkan; bagian 3–5 mengasumsikan paket ini. Kalau belum tersedia, logika setara bisa dibangun manual pakai `league/oauth2-client` + `firebase/php-jwt` — minta kami contoh.)* |

---

## 2. Daftar pekerjaan (ringkas)

1. Install paket SSO-client.
2. Isi `.env`.
3. Deploy file `oauth-public.key`.
4. Pasang middleware login + guard.
5. Tulis adaptor TenantContext (satu-satunya kode nyata).
6. Pakai permission sys2 untuk gating (`can:...`).
7. Tes pakai mock IdP.
8. Buang SSO lama (query-string/HS256/webhook).

---

## 3. Install & config

### 3.1 Install
```bash
composer require siproper/sso-client
php artisan vendor:publish --tag=sso-config   # publish config/sso.php
```

### 3.2 `.env`
```dotenv
SSO_IDP_URL=https://auth.siproper.com
SSO_CLIENT_ID=sys1
SSO_CLIENT_SECRET=__dari_kami__
SSO_REDIRECT_URI=https://sys1.siproper.com/auth/callback
SSO_PUBLIC_KEY_PATH=storage/oauth-public.key
SSO_AUTHZ_TTL=90        # cache /api/me/authorization (detik) — jangan > 120
SSO_AUTHZ_GRACE=600     # grace 10 menit saat sys2 tak terjangkau
```
> `SSO_REDIRECT_URI` harus **persis sama** dengan yang didaftarkan di IdP (exact match, bukan wildcard). Beri tahu kami nilainya saat pendaftaran client.

### 3.3 Deploy public key
Taruh file `oauth-public.key` dari kami di `storage/oauth-public.key` (atau path di `SSO_PUBLIC_KEY_PATH`). Pastikan ikut ter-deploy ke **semua** server sys1.

---

## 4. Login & validasi token (disediakan paket)

Paket menyediakan dua hal:

**a. Route callback OAuth** — daftar otomatis (`/auth/callback`). Tidak perlu kamu tulis.

**b. Middleware `sso.auth`** — pasang di route yang butuh login:
```php
// routes/web.php
Route::middleware(['sso.auth'])->group(function () {
    Route::get('/sales', [SalesController::class, 'index']);
    // ...semua route modul sys1
});
```
Middleware ini: kalau belum login → mulai alur OAuth ke IdP; kalau sudah → verifikasi tanda tangan token pakai `oauth-public.key` + cek `aud=sys1` + `exp`. **Token dengan `aud` selain `sys1` ditolak.**

> Yang ditangani paket otomatis: tukar `code`→token, refresh token, ambil & cache `/api/me/authorization`, logika grace/fail-closed (bagian 6). Kamu tidak menulis ini.

---

## 5. Adaptor TenantContext (SATU-SATUNYA kode nyata)

sys1 sudah memfilter data per proyek/area (trait `BelongsToTenant` + `TenantContext`). Yang berubah: **sumber daftar `proyek_ids`/`area_ids` sekarang dari payload authz sys2**, bukan dari query lokal.

Paket mengekspos payload authz user aktif. Sambungkan ke `TenantContext` sys1 kamu:

```php
// Contoh — sesuaikan dengan TenantContext milik sys1
$authz = app(\Siproper\SsoClient\Authz::class)->forCurrentUser(); // payload sesuai CONTRACT.md 3.2

app(\App\Services\TenantContext::class)->setAccessible(
    proyekIds: $authz['tenants']['proyek_ids'],
    areaIds:   $authz['tenants']['area_ids'],
);
```
Letakkan di middleware setelah `sso.auth` (atau di event login paket). **ID-nya sudah ID resmi sys2** → langsung cocok dengan kolom `proyek_id` di data sys1, tanpa pemetaan.

> Kalau `TenantContext` sys1 saat ini mengisi `proyek_ids`/`area_ids` dari DB sendiri, cukup ganti sumbernya ke `$authz` di atas. Global scope `BelongsToTenant` yang sudah ada tidak perlu diubah.

---

## 6. Gating: permission & grace

### 6.1 Cek permission (pakai string sys2 apa adanya)
Nama permission **persis sama** dengan sys2 — jangan dibuat sendiri. Contoh nyata: `view_any_lgl::land::bank`, `view_any_tkn::pra::proyek`.
```php
Route::get('/legal', [LegalController::class, 'index'])
    ->middleware(['sso.auth', 'can:view_any_lgl::land::bank']);
```
Paket sudah memuat permission user dari payload authz, jadi `can:...` Laravel langsung bekerja.

### 6.2 Operasi destruktif vs baca (grace) — WAJIB benar
Saat sys2 tak terjangkau, paket pakai aturan ini (lihat [CONTRACT.md bagian 4](CONTRACT.md)):

| Kondisi | Baca (GET/list) | Tulis/hapus (create/update/delete/approve) |
|---|---|---|
| cache fresh (≤90 dtk) | boleh | boleh |
| cache stale tapi <10 mnt | boleh (data lama) | **DITOLAK (503)** |
| cache >10 mnt | ditolak | ditolak |

Tandai route yang **mengubah data** agar paket menerapkan fail-closed lebih ketat:
```php
Route::post('/legal/approve', ...)->middleware(['sso.auth', 'sso.destructive']);
```
> Intinya: operasi berbahaya tidak boleh jalan pakai izin basi saat sys2 down. Operasi baca boleh toleran sebentar.

---

## 7. Tes lokal pakai Mock IdP (tanpa menunggu sys2)

Kami beri **mock IdP** + user fixture. Arahkan `.env` dev ke sana:
```dotenv
SSO_IDP_URL=http://localhost:8081     # mock IdP
SSO_PUBLIC_KEY_PATH=storage/oauth-public.test.key
```
User fixture yang tersedia: **legal-only**, **teknik-only**, **multi-role**, **no-access**, plus mode **sys2-down** (untuk uji grace).

Checklist conformance (semua harus lolos sebelum integrasi produksi):
- [ ] User legal-only bisa buka modul legal, **403** di modul teknik.
- [ ] User no-access → semua modul 403 (atau diarahkan NoAccess).
- [ ] Token dengan `aud` bukan `sys1` ditolak.
- [ ] Token kedaluwarsa → diarahkan login ulang.
- [ ] Data hanya proyek/area milik user (coba ubah `?proyek_id=` ke proyek lain → tetap kosong/403).
- [ ] Mode sys2-down: GET masih jalan (<10 mnt), POST/approve **ditolak 503**.
- [ ] Setelah >10 mnt sys2-down: semua ditolak.

---

## 8. Buang SSO lama (Fase akhir, setelah verifikasi)

Setelah jalur baru terbukti jalan:
- Hapus route + `SSOController` (login via `?token=` query-string).
- Hapus config `jwt.shared_secret` (HS256) dan env webhook login (`WEBHOOK_*`).
- Matikan endpoint `api/jwt/orders/...` lama bila tak dipakai lagi (konfirmasi dulu dengan kami).

> Jangan hapus sebelum jalur SSO baru lolos checklist bagian 7 di produksi.

---

## 9. Checklist akhir

- [ ] `composer require siproper/sso-client`
- [ ] `.env` terisi (idp url, client id/secret, redirect uri, public key path, ttl, grace)
- [ ] `oauth-public.key` ter-deploy di semua server
- [ ] middleware `sso.auth` di semua route modul
- [ ] adaptor TenantContext menyuntik proyek/area dari authz
- [ ] gating `can:...` pakai string permission sys2
- [ ] route destruktif ditandai `sso.destructive`
- [ ] lolos checklist conformance (bagian 7)
- [ ] SSO lama dibuang (bagian 8)
- [ ] NTP sinkron + HTTPS `sys1.siproper.com` aktif

---

## Yang TIDAK perlu kamu kerjakan
- ❌ Mendefinisikan/menyalin permission & role — pakai punya sys2.
- ❌ Tabel pemetaan ID proyek/area — sudah pakai ID sys2.
- ❌ Implementasi alur OAuth, parsing JWT, cache & grace — ada di dalam paket.
- ❌ Form login / 2FA — semua di sys2.

Pertanyaan / butuh `client_secret`, public key, atau akses mock IdP → hubungi tim IdP (sys2).
