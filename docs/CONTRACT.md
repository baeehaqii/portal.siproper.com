# Kontrak SSO SiProper — v2 (BEKU)

> Status: **BEKU per 2026-06-23.** Acuan tetap untuk Portal, sys2 (IdP), sys1.
> **v2 (2026-06-25):** host IdP **resmi `sys2.siproper.com`** — rencana host khusus `auth.siproper.com` DIBATALKAN (tanpa alias DNS). Semua endpoint OAuth/API + form login disajikan langsung dari `sys2.siproper.com`. `redirect_uri` & `SSO_IDP_URL` client pakai host ini. Konsekuensi: tak ada decoupling host IdP (kalau IdP dipindah kelak, `redirect_uri` semua client wajib didaftar ulang).
> **v1.1 (2026-06-24):** klaim `iss` dijadikan **opsional** — Passport+league 8.5.5 tak memancarkannya; keamanan issuer dijamin signature RS256 vs `oauth-public.key` statis + validasi `aud`. Lihat bagian 2.
> Perubahan apa pun pada kontrak ini = **naik versi (v2)** + kabari semua tim. Jangan ubah diam-diam.
> Sumber desain: [`ARCHITECTURE_SSO.md`](../ARCHITECTURE_SSO.md). Dokumen ini = bagian yang dibekukan agar 3 tim bisa jalan paralel.

---

## 0. Identitas sistem

| Nama | Peran | Host | Client ID OAuth |
|---|---|---|---|
| sys2 (IdP) | Authorization Server + Resource Server | `sys2.siproper.com` | — |
| Portal | OAuth client (BFF) | `portal.siproper.com` | `portal` |
| sys1 | OAuth client + Resource Server | `sys1.siproper.com` | `sys1` |

- `issuer` (klaim `iss` token) = `https://sys2.siproper.com`
- Semua endpoint OAuth & API disajikan dari `sys2.siproper.com`.

---

## 1. Endpoint OAuth2 (Passport)

Hanya endpoint berikut yang dipakai. **Tidak ada** JWKS / discovery / `userinfo` / `id_token` (ini OAuth2 murni, bukan OIDC).

### 1.1 `GET /oauth/authorize`
Memulai Authorization Code + PKCE.

| Parameter | Wajib | Nilai |
|---|---|---|
| `response_type` | ya | `code` |
| `client_id` | ya | `portal` / `sys1` |
| `redirect_uri` | ya | **exact match** dengan allowlist terdaftar (bukan prefix/wildcard) |
| `scope` | ya | lihat bagian 2.3 |
| `state` | ya | acak, anti-CSRF; divalidasi dari record server-side (Redis), bukan cookie |
| `code_challenge` | ya | PKCE, metode S256 |
| `code_challenge_method` | ya | `S256` |

`redirect_uri` terdaftar:
- Portal: `https://portal.siproper.com/api/auth/callback`
- sys1: `https://sys1.siproper.com/auth/callback`

### 1.2 `POST /oauth/token`
Tukar `code` → token, dan refresh (rotation).

- Grant `authorization_code`: `grant_type`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier`.
- Grant `refresh_token`: `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`.
- Refresh **dirotasi tiap pakai**. (Reuse-detection = kerja custom, Fase 4 — di luar kontrak v1.)

Respons:
```json
{ "token_type": "Bearer", "expires_in": 900, "access_token": "<JWT>", "refresh_token": "<opaque>" }
```

---

## 2. Token

### 2.1 Access token (JWT RS256)
- Ditandatangani IdP dengan private key (`oauth-private.key`, hanya di IdP).
- Diverifikasi resource server dengan **file `oauth-public.key` statis** yang di-deploy ke tiap server. **Tanpa round-trip ke IdP** (tanpa introspection, tanpa JWKS).
- Umur: **±15 menit** (`expires_in: 900`).

Klaim minimal:
| Klaim | Arti |
|---|---|
| `iss` | *(opsional, v1.1)* `https://sys2.siproper.com` — **tidak dipancarkan** oleh Passport saat ini; jangan diwajibkan |
| `sub` | user UUID |
| `aud` | client penerima: `portal` **atau** `sys1` |
| `exp` | kedaluwarsa (epoch) |
| `jti` | id token unik |
| `scope` | string scope dipisah spasi |

### 2.2 Aturan validasi (WAJIB di setiap resource server)
Tolak request bila salah satu gagal:
1. Tanda tangan tidak valid terhadap `oauth-public.key`.
2. *(opsional, v1.1)* Jika `iss` ada, harus `https://sys2.siproper.com`. **Tidak dipancarkan saat ini → jangan jadikan syarat wajib** (signature vs key statis sudah memastikan issuer).
3. `exp` sudah lewat (toleransi clock skew ≤ 60 dtk; NTP wajib sinkron).
4. **`aud` bukan milik dirinya** — sys1 hanya menerima `aud=sys1`; Portal hanya `aud=portal`. **Token lintas-`aud` ditolak.**

### 2.3 Scope
- `profile` — identitas dasar (`sub`).
- `authz` — izin memanggil `/api/me/authorization`.

> Otorisasi detail (role/permission/tenant) **TIDAK** ditanam di token. Ambil via `/api/me/authorization`.

### 2.4 Refresh token
Opaque, umur ±8–24 jam, rotation tiap pakai. Revoke refresh = hentikan perpanjangan sesi seketika.

---

## 3. `GET /api/me/authorization` — sumber identitas & otorisasi runtime

Satu-satunya sumber role, permission, dan tenant. **sys2 pemilik tunggal**; Portal & sys1 hanya konsumen.

### 3.1 Request
```
GET https://sys2.siproper.com/api/me/authorization
Authorization: Bearer <access_token>   # scope harus mengandung "authz"
```

### 3.2 Respons 200 (BEKU — struktur tidak berubah tanpa naik versi)
```json
{
  "user_id": "uuid",
  "roles": ["staff_legal"],
  "modules": { "legal": true, "teknik": false, "marketing": false, "keuangan": false },
  "permissions": ["view_lgl::land::bank", "view_any_lgl::land::bank"],
  "tenants": { "proyek_ids": [12, 18], "area_ids": [3] },
  "fetched_at": "2026-06-23T08:00:00Z"
}
```

> Prefix permission nyata di sys2: **`lgl`** (legal), **`tkn`** (teknik), **`mrk`/`mrkm`** (marketing/sales), plus `monitoring`/`detail`. Tidak ada prefix `sls`. **Kunci `modules{}` & pemetaannya dimiliki & difinalkan sys2** (registry menu→permission) — daftar di atas ilustratif; daftar pasti ditetapkan saat Fase 1.

| Field | Tipe | Arti & aturan pakai |
|---|---|---|
| `user_id` | string (UUID) | identitas user (sys2 pakai UUID char-36) |
| `roles` | string[] | nama role dari sys2 (informasi). Contoh role nyata: `staff_legal`, `manager_teknik`, `admin_sales`, `direktur_marketing`, `super_admin`. |
| `modules` | object<string,bool> | **kapabilitas menu siap-pakai, di-resolve sys2.** Klien membaca boolean ini untuk gating UI. **Klien TIDAK menghitung ulang dari `permissions[]`.** Kunci = id modul (ditetapkan sys2). |
| `permissions` | string[] | nama permission mentah dari sys2 (Spatie), dipakai apa adanya untuk cek granular `can:...`. Format: `{action}_{modul}::{sub}` mis. `view_any_lgl::land::bank`. Tidak diterjemahkan/disalin ulang. |
| `tenants.proyek_ids` | int[] | **ID proyek resmi dari sys2** (int auto-increment, tabel `proyeks`). Dipakai sys1 untuk tenant scoping (`WHERE proyek_id IN (...)`). ID sama lintas-sistem → tanpa pemetaan. |
| `tenants.area_ids` | int[] | ID area resmi dari sys2 (int, tabel `lgl_areas`). |
| `fetched_at` | string (ISO-8601 UTC) | stempel waktu otoritatif dari sys2. Dipakai klien untuk perhitungan fresh/grace (bagian 4). |

> **Catatan guard (sys2).** Permission terdaftar di guard `web` (Filament) & `api` (JWT); Passport menambah guard sendiri. Saat me-resolve `modules{}`/`permissions[]`, sys2 memanggil `getAllPermissions()` pada **guard yang tepat**. Klien (Portal/sys1) cukup **membandingkan string** — tidak bergantung guard Spatie.

### 3.3 Cache (klien)
- Klien meng-cache payload ini **TTL pendek 60–120 dtk**.
- Jendela basi maksimum ≤ TTL → pencabutan akses menyebar cepat.
- Hindari TTL-stacking (cache klien + cache internal sys2): total staleness ≤ 120 dtk.

### 3.4 Catatan implementasi sys2 (bukan bagian beku — informasi)
Bahan endpoint ini **sudah ada** di `User` model sys2; endpoint tinggal merakit:
- `tenants.proyek_ids` ← `User::getAccessibleProyekIds()`
- `tenants.area_ids` ← `User::getAccessibleAreaIds()`
- `permissions` ← Spatie `getAllPermissions()->pluck('name')`
- `modules` ← resolver baru (peta prefix permission → boolean modul), milik sys2
- `roles` ← `getRoleNames()`

Sumber akses tenant: pivot `user_proyek_accesses` & `user_area_accesses` + proyek-via-area (`proyeks.lgl_area_id IN area_ids`) — sudah diimplementasikan di `TenantContext`.

---

## 4. Semantik grace & fail-closed (NORMATIF untuk sys1 & Portal)

Saat sys2 **tak terjangkau**, keputusan berdasarkan umur cache (dihitung dari `fetched_at`) + dua ambang:

| Kondisi cache | Operasi BACA (GET/list) | Operasi DESTRUKTIF/TULIS (create/update/delete/approve) |
|---|---|---|
| **Fresh** (umur ≤ TTL) | Izinkan | Izinkan |
| **Stale dalam grace** (TTL < umur ≤ 10 mnt) & sys2 unreachable | Izinkan (cache stale) | **Fail-closed (tolak)** |
| **Hard-stale** (umur > 10 mnt) | **Fail-closed** | **Fail-closed** |

- Saat sys2 **reachable** tapi cache lewat TTL → **refresh dulu** sebelum dipakai.
- Aksi destruktif **tidak ikut grace** — begitu cache tak fresh, tulis/hapus ditolak.
- sys1 menyelaraskan ini dengan pola cache/fallback panggilan proyek/area sys2 yang sudah ada.

---

## 5. Kode error (HTTP)

| Status | Kapan | Aksi klien |
|---|---|---|
| `401` | token hilang/invalid/expired | mulai ulang login / refresh (BFF Portal: auto-refresh single-flight on 401) |
| `403` | token valid, tapi user tak punya permission/tenant | tampilkan `NoAccess` (Portal) / 403 (resource server) |
| `503` | sys2 tak terjangkau **dan** authz fail-closed (bagian 4) | tampilkan "layanan otorisasi sedang gangguan, coba lagi" |

---

## 6. Kepemilikan data (single source of truth)

1. **sys2 pemilik tunggal** definisi permission, role, serta ID proyek & area.
2. **sys1 murni konsumen** — tidak mendefinisikan permission/role/ID sendiri.
3. `proyek_id`/`area_id` = ID resmi sys2; sys1 sudah menyimpannya via konsumsi API → **tanpa tabel pemetaan**.
4. Nama permission diambil apa adanya dari sys2 untuk `can:...`.

---

## 7. Logout

- Portal logout: revoke refresh token Portal + hapus sesi Portal (Redis) → redirect ke route logout IdP (custom, dibuat di sys2) → IdP hapus cookie sesi `.siproper.com`.
- Tanpa back-channel: sesi sys1 mati paling lambat saat access token expire (≤15 mnt).
- Back-channel logout = kerja custom, Fase 4 — **di luar kontrak v1**.

---

## 8. Yang HARUS diemulasi Mock IdP (untuk dev Portal & test sys1)

Agar Portal (Fase 2) & sys1 (Fase 3) bisa dikembangkan tanpa menunggu sys2 jadi, mock IdP minimal harus:

1. `GET /oauth/authorize` — auto-login sebagai user fixture (tanpa form), balikan `code` + `state`.
2. `POST /oauth/token` — terbitkan access token JWT **RS256 dengan keypair test**, set `aud` sesuai `client_id`, `expires_in: 900`; dukung `refresh_token`.
3. `GET /api/me/authorization` — balikan payload fixture sesuai bagian 3.2.
4. Sediakan `oauth-public.key` test agar resource server bisa verifikasi.
5. User fixture wajib mencakup: **sales-only**, **legal-only**, **multi-role**, **no-access** (untuk uji gating & `NoAccess`).
6. Mode simulasi **sys2 down** (mock menolak `/api/me/authorization`) untuk menguji grace/fail-closed (bagian 4).

---

## Lampiran — daftar item DI LUAR kontrak v1 (kerja custom, fase lanjut)
- Refresh reuse-detection + revoke family (Fase 4).
- Back-channel logout (Fase 4).
- Infra HA / failover (track terpisah, `TODOS.md`).
