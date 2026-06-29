# Panduan Integrasi SSO untuk Programmer sys1 (jalur manual)

> Untuk tim sys1 (Laravel). Tujuan: sys1 ikut SSO SiProper — user yang sudah login lewat Portal bisa masuk modul sys1 tanpa login ulang, dengan role/permission/tenant dari sys2.
> Acuan kontrak (jangan diubah sepihak): [`CONTRACT.md`](CONTRACT.md). Kalau ada beda antara panduan ini dan CONTRACT.md, **CONTRACT.md yang menang**.
> **Catatan versi (2026-06-25):** paket `siproper/sso-client` dan Mock IdP **TIDAK jadi dibuat**. Panduan ini = jalur **manual** pakai `league/oauth2-client` + `firebase/php-jwt`, dan **tes langsung ke sys2 produksi** (`https://sys2.siproper.com`) — bukan mock. sys2 sudah live: `/oauth/*`, `/api/me/authorization`, dan client `sys1` sudah ter-seed.
> Estimasi kerja: **±4–6 hari**. Mayoritas konfigurasi + ~4 file kode.

---

## 0. Konsep singkat (baca dulu, 2 menit)

- sys2 = **Identity Provider** di `sys2.siproper.com`. Dia satu-satunya tempat ketik password, dan pemilik semua role/permission/akses proyek.
- sys1 = **OAuth client + resource server**. sys1 **punya alur login OAuth-nya sendiri** ke sys2 (bukan dititipi token Portal).
- sys1 **tidak mendefinisikan permission/role/ID proyek sendiri** — semua dibaca dari sys2 lewat `GET /api/me/authorization`.
- Validasi token di sys1 **stateless**: cukup verifikasi tanda tangan pakai file public key statis, tanpa nembak balik ke sys2 tiap request.

Alur dari sisi user: klik kartu modul di Portal → diarahkan ke sys1 → sys1 redirect ke sys2 (silent, karena sesi sudah ada) → balik ke sys1 dengan `code` → sys1 tukar jadi token → tampil halaman modul sesuai hak.

---

## 1. Yang kami (tim IdP/sys2) berikan ke kamu

| Item | Keterangan |
|---|---|
| `client_id` = `sys1` & `client_secret` | kredensial OAuth client sys1 (secret = rahasia, simpan di `.env`). Sudah ter-seed di sys2; minta nilai secret-nya ke kami. |
| `oauth-public.key` | file public key statis untuk verifikasi tanda tangan token (tidak rahasia, tapi harus **persis sama** dengan IdP). Ini file `storage/oauth-public.key` milik Passport sys2. |
| URL IdP | `https://sys2.siproper.com` |
| Daftar `modules{}` & permission | string permission & key modul dimiliki sys2 — dipakai apa adanya (lihat [CONTRACT.md §3.2](CONTRACT.md)). |

> **Tidak ada paket Composer & tidak ada Mock IdP.** Kamu rakit sendiri dengan dua library standar (bagian 3). Untuk tes, pakai sys2 produksi dengan user uji khusus (bagian 7).

---

## 2. Daftar pekerjaan (ringkas)

1. Install `league/oauth2-client` + `firebase/php-jwt`.
2. Isi `.env` + bikin `config/sso.php` (env **hanya** di file config — lihat catatan penting).
3. Deploy file `oauth-public.key`.
4. Tulis: route login/callback/logout, middleware `sso.auth`, service `Authz`, middleware `sso.destructive`.
5. Sambungkan payload authz ke `TenantContext` sys1 (adaptor).
6. Gating pakai permission sys2 (`can:...`) via `Gate::before`.
7. Tes ke sys2 produksi dengan user uji.
8. Buang SSO lama (query-string/HS256/webhook).

> **CATATAN PENTING (env + config cache).** Kalau sys1 pakai `php artisan config:cache`/`optimize`, **`env()` di luar file `config/*` balikan null**. Karena itu **semua** pembacaan `env('SSO_*')` di panduan ini ada di `config/sso.php`, dan kode lain memanggil `config('sso.*')`. Jangan panggil `env()` di controller/middleware/route.

---

## 3. Install & config

### 3.1 Install
```bash
composer require league/oauth2-client firebase/php-jwt
```

### 3.2 `.env`
```dotenv
SSO_IDP_URL=https://sys2.siproper.com
SSO_CLIENT_ID=sys1
SSO_CLIENT_SECRET=__dari_kami__
SSO_REDIRECT_URI=https://sys1.siproper.com/auth/callback
SSO_PUBLIC_KEY_PATH=storage/oauth-public.key
SSO_AUTHZ_TTL=90        # cache /api/me/authorization (detik) — jangan > 120 (CONTRACT §3.3)
SSO_AUTHZ_GRACE=600     # grace 10 menit saat sys2 tak terjangkau (CONTRACT §4)
```
> `SSO_REDIRECT_URI` harus **persis sama** dengan yang terdaftar di IdP (exact match, bukan wildcard). Default terdaftar: `https://sys1.siproper.com/auth/callback`. Kalau beda, beri tahu kami untuk re-seed.

### 3.3 `config/sso.php` (SATU-SATUNYA tempat baca `env`)
```php
<?php
return [
    'idp'             => env('SSO_IDP_URL'),
    'client_id'       => env('SSO_CLIENT_ID'),
    'client_secret'   => env('SSO_CLIENT_SECRET'),
    'redirect_uri'    => env('SSO_REDIRECT_URI'),
    'public_key_path' => env('SSO_PUBLIC_KEY_PATH', 'storage/oauth-public.key'),
    'authz_ttl'       => (int) env('SSO_AUTHZ_TTL', 90),
    'authz_grace'     => (int) env('SSO_AUTHZ_GRACE', 600),
    'scopes'          => 'profile authz',
];
```

### 3.4 Deploy public key
Taruh `oauth-public.key` dari kami di `storage/oauth-public.key` (atau path di `SSO_PUBLIC_KEY_PATH`). Pastikan ter-deploy ke **semua** server sys1. File ini publik (bukan rahasia) tapi harus byte-identik dengan IdP, kalau tidak verifikasi tanda tangan gagal.

---

## 4. Login & validasi token (kode nyata)

### 4.1 Provider OAuth (helper kecil)
`league/oauth2-client` `GenericProvider` sudah dukung PKCE S256. Bungkus sekali biar dipakai ulang:

```php
// app/Sso/SsoProvider.php
namespace App\Sso;

use League\OAuth2\Client\Provider\AbstractProvider;
use League\OAuth2\Client\Provider\GenericProvider;

class SsoProvider
{
    public static function make(): GenericProvider
    {
        $idp = rtrim(config('sso.idp'), '/');
        return new GenericProvider([
            'clientId'                => config('sso.client_id'),
            'clientSecret'            => config('sso.client_secret'),
            'redirectUri'             => config('sso.redirect_uri'),
            'urlAuthorize'            => $idp . '/oauth/authorize',
            'urlAccessToken'          => $idp . '/oauth/token',
            'urlResourceOwnerDetails' => $idp . '/api/me/authorization', // tak dipanggil, wajib diisi
            'pkceMethod'              => AbstractProvider::PKCE_METHOD_S256,
            'scopes'                  => config('sso.scopes'),
        ]);
    }
}
```

### 4.2 Route login / callback / logout
```php
// routes/web.php
use App\Sso\SsoProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/auth/login', function (Request $request) {
    $provider = SsoProvider::make();
    $url = $provider->getAuthorizationUrl(['scope' => config('sso.scopes')]);
    // state + PKCE verifier disimpan server-side (session Laravel = server-side). CONTRACT §1.1.
    $request->session()->put('oauth2state', $provider->getState());
    $request->session()->put('oauth2pkce',  $provider->getPkceCode());
    $request->session()->put('oauth2intended', url()->previous());
    return redirect()->away($url);
})->name('sso.login');

Route::get('/auth/callback', function (Request $request) {
    abort_if($request->input('state') !== $request->session()->pull('oauth2state'), 403, 'State mismatch');

    $provider = SsoProvider::make();
    $provider->setPkceCode($request->session()->pull('oauth2pkce'));

    $token = $provider->getAccessToken('authorization_code', ['code' => $request->input('code')]);

    // ponytail: token disimpan di session. Pakai tabel oauth_tokens kalau butuh revoke lintas-device.
    $request->session()->put('sso', [
        'access'  => $token->getToken(),
        'refresh' => $token->getRefreshToken(),
        'expires' => $token->getExpires(),       // epoch
    ]);

    return redirect($request->session()->pull('oauth2intended', '/'));
})->name('sso.callback');

Route::get('/auth/logout', function (Request $request) {
    $request->session()->forget('sso');
    $request->session()->invalidate();
    // Redirect ke logout IdP agar cookie sesi .siproper.com ikut mati (CONTRACT §7).
    return redirect()->away(rtrim(config('sso.idp'), '/') . '/sso/logout');
})->name('sso.logout');
```

### 4.3 Verifikasi token (`firebase/php-jwt`)
```php
// app/Sso/TokenVerifier.php
namespace App\Sso;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class TokenVerifier
{
    /** Kembalikan payload terverifikasi, atau lempar Exception kalau tidak valid. */
    public static function verify(string $jwt): object
    {
        JWT::$leeway = 60; // toleransi clock skew ≤60 dtk (CONTRACT §2.2.3) — NTP wajib sinkron
        $pem = file_get_contents(base_path(config('sso.public_key_path')));

        $claims = JWT::decode($jwt, new Key($pem, 'RS256')); // cek tanda tangan + exp

        // aud WAJIB = sys1 (CONTRACT §2.2.4). aud bisa string atau array.
        $aud = (array) ($claims->aud ?? []);
        abort_unless(in_array(config('sso.client_id'), $aud, true), 401, 'Bad audience');

        // iss TIDAK diwajibkan — Passport tak memancarkannya (CONTRACT §2.2.2).
        return $claims;
    }
}
```

### 4.4 Middleware `sso.auth`
```php
// app/Http/Middleware/SsoAuth.php
namespace App\Http\Middleware;

use App\Sso\Authz;
use App\Sso\SsoProvider;
use App\Sso\TokenVerifier;
use Closure;
use Illuminate\Http\Request;

class SsoAuth
{
    public function handle(Request $request, Closure $next)
    {
        $sso = $request->session()->get('sso');
        if (!$sso) {
            return redirect()->route('sso.login');
        }

        // Refresh kalau access token mau/sudah kedaluwarsa (sisa <30 dtk).
        if (($sso['expires'] ?? 0) - 30 <= now()->timestamp) {
            $sso = $this->refresh($request, $sso);
            if (!$sso) {
                return redirect()->route('sso.login');
            }
        }

        try {
            $claims = TokenVerifier::verify($sso['access']);
        } catch (\Throwable $e) {
            return redirect()->route('sso.login');
        }

        // Muat & cache authz (role/permission/tenant), sambungkan ke Gate + TenantContext.
        app(Authz::class)->bind($claims->sub, $sso['access'], $request);

        return $next($request);
    }

    private function refresh(Request $request, array $sso): ?array
    {
        if (empty($sso['refresh'])) {
            return null;
        }
        try {
            $token = SsoProvider::make()->getAccessToken('refresh_token', [
                'refresh_token' => $sso['refresh'],
            ]);
        } catch (\Throwable $e) {
            return null;
        }
        $sso = [
            'access'  => $token->getToken(),
            'refresh' => $token->getRefreshToken() ?: $sso['refresh'], // rotation
            'expires' => $token->getExpires(),
        ];
        $request->session()->put('sso', $sso);
        return $sso;
    }
}
```
Daftarkan alias di `bootstrap/app.php` (Laravel 11/12) atau `Kernel.php` (Laravel ≤10):
```php
// bootstrap/app.php
->withMiddleware(function ($middleware) {
    $middleware->alias([
        'sso.auth'        => \App\Http\Middleware\SsoAuth::class,
        'sso.destructive' => \App\Http\Middleware\SsoDestructive::class,
    ]);
})
```
Pasang di route modul:
```php
Route::middleware(['sso.auth'])->group(function () {
    Route::get('/sales', [SalesController::class, 'index']);
    // ...semua route modul sys1
});
```

---

## 5. Service `Authz` + adaptor TenantContext

`Authz` = otak konsumsi `/api/me/authorization`: fetch, cache TTL pendek, grace, lalu suntik ke `Gate` & `TenantContext`.

```php
// app/Sso/Authz.php
namespace App\Sso;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class Authz
{
    private array $payload = [];
    private string $freshness = 'hard'; // fresh | stale | hard

    public function bind(string $sub, string $accessToken, Request $request): void
    {
        [$this->payload, $this->freshness] = $this->load($sub, $accessToken);

        // Adaptor TenantContext (SATU-SATUNYA kode nyata yg menyentuh logika sys1).
        // PENTING: array kosong = "semua" kalau super_admin, "tidak ada" kalau bukan (sys2 §3.4).
        $t = $this->payload['tenants'] ?? ['proyek_ids' => [], 'area_ids' => []];
        $isSuper = in_array('super_admin', $this->payload['roles'] ?? [], true);
        app(\App\Services\TenantContext::class)->setAccessible(
            proyekIds: $t['proyek_ids'],
            areaIds:   $t['area_ids'],
            all:       $isSuper && empty($t['proyek_ids']) && empty($t['area_ids']),
        );

        $request->attributes->set('authz', $this->payload);
    }

    public function permissions(): array { return $this->payload['permissions'] ?? []; }
    public function modules(): array     { return $this->payload['modules'] ?? []; }
    public function isFresh(): bool       { return $this->freshness === 'fresh'; }
    public function isUsable(): bool      { return $this->freshness !== 'hard'; }

    /** @return array{0:array,1:string} [payload, freshness] */
    private function load(string $sub, string $token): array
    {
        $key   = "authz:$sub";
        $grace = config('sso.authz_grace');
        $ttl   = config('sso.authz_ttl');

        $cached = Cache::get($key); // {payload, at(epoch)}
        $ageOk  = $cached && (now()->timestamp - $cached['at'] <= $ttl);

        if ($ageOk) {
            return [$cached['payload'], 'fresh'];
        }

        // Perlu refresh: coba tembak sys2.
        try {
            $resp = Http::withToken($token)->timeout(5)
                ->acceptJson()->get(rtrim(config('sso.idp'), '/') . '/api/me/authorization');
            if ($resp->successful()) {
                $payload = $resp->json();
                Cache::put($key, ['payload' => $payload, 'at' => now()->timestamp], $grace);
                return [$payload, 'fresh'];
            }
            // 401/403 dari sys2 = token/scope bermasalah → perlakukan sebagai tak-usable.
            abort($resp->status() === 403 ? 403 : 401);
        } catch (ConnectionException $e) {
            // sys2 tak terjangkau → pakai cache stale dalam grace (CONTRACT §4).
            if ($cached && (now()->timestamp - $cached['at'] <= $grace)) {
                return [$cached['payload'], 'stale'];
            }
            return [[], 'hard']; // hard-stale → fail-closed
        }
    }
}
```

> Kalau `TenantContext` sys1 saat ini mengisi `proyek_ids`/`area_ids` dari DB sendiri, cukup ganti sumbernya ke pemanggilan `setAccessible(...)` di atas (tambah param `all` untuk kasus super_admin). Global scope `BelongsToTenant` yang sudah ada tidak perlu diubah — ID-nya **sudah ID resmi sys2**, langsung cocok dengan kolom `proyek_id`.

---

## 6. Gating: permission & grace

### 6.1 Cek permission (pakai string sys2 apa adanya)
Daftarkan `Gate::before` sekali agar `can:...` Laravel langsung pakai permission dari payload authz — tanpa nyalin permission ke DB sys1:

```php
// app/Providers/AppServiceProvider.php  (boot())
use Illuminate\Support\Facades\Gate;

Gate::before(function ($user, string $ability) {
    // return true = boleh; null = lanjut cek normal. JANGAN return false (memblok semua).
    return in_array($ability, app(\App\Sso\Authz::class)->permissions(), true) ? true : null;
});
```
Nama permission **persis sama** dengan sys2 — jangan dibuat sendiri. Contoh nyata: `view_any_lgl::land::bank`, `view_any_tkn::pra::proyek`.
```php
Route::get('/legal', [LegalController::class, 'index'])
    ->middleware(['sso.auth', 'can:view_any_lgl::land::bank']);
```
Untuk gating menu/UI, baca boolean `modules{}` apa adanya (`app(Authz::class)->modules()['legal']`) — **jangan hitung ulang** dari `permissions[]` (CONTRACT §3.2).

### 6.2 Operasi destruktif vs baca (grace) — WAJIB benar
Saat sys2 tak terjangkau, aturan (CONTRACT §4):

| Kondisi cache | Baca (GET/list) | Tulis/hapus (create/update/delete/approve) |
|---|---|---|
| fresh (≤90 dtk) | boleh | boleh |
| stale tapi <10 mnt | boleh (data lama) | **DITOLAK (503)** |
| >10 mnt | ditolak (`sso.auth` sudah lempar) | ditolak |

`sso.auth` sudah memblok kondisi hard-stale (payload kosong → `can` gagal / 403). Untuk memblok **tulis** saat stale, tandai route pengubah data dengan `sso.destructive`:

```php
// app/Http/Middleware/SsoDestructive.php
namespace App\Http\Middleware;

use App\Sso\Authz;
use Closure;
use Illuminate\Http\Request;

class SsoDestructive
{
    public function handle(Request $request, Closure $next)
    {
        abort_unless(app(Authz::class)->isFresh(), 503, 'Otorisasi sedang gangguan, coba lagi');
        return $next($request);
    }
}
```
```php
Route::post('/legal/approve', [LegalController::class, 'approve'])
    ->middleware(['sso.auth', 'can:approve_lgl::land::bank', 'sso.destructive']);
```
> Intinya: operasi berbahaya tidak boleh jalan pakai izin basi saat sys2 down. Operasi baca boleh toleran sebentar.

---

## 7. Tes ke sys2 produksi (tanpa mock)

Tidak ada mock IdP. Tes langsung ke `https://sys2.siproper.com` pakai **user uji khusus** yang kami siapkan (jangan pakai akun real — lihat [CONTRACT.md §6] & kebijakan kredensial). Minta ke kami: user uji **legal-only**, **teknik-only**, **multi-role**, **no-access**.

Checklist conformance (semua harus lolos sebelum produksi):
- [ ] User legal-only bisa buka modul legal, **403** di modul teknik.
- [ ] User no-access → semua modul 403 (atau diarahkan NoAccess).
- [ ] Token dengan `aud` bukan `sys1` ditolak (uji: tempel access token Portal → harus 401).
- [ ] Token kedaluwarsa → auto-refresh; refresh dicabut → diarahkan login ulang.
- [ ] Data hanya proyek/area milik user (ubah `?proyek_id=` ke proyek lain → tetap kosong/403).
- [ ] super_admin: `proyek_ids`/`area_ids` kosong tapi tetap lihat **semua** (flag `all`).
- [ ] Simulasi sys2-down (matikan koneksi/blokir host di env staging): GET masih jalan <10 mnt, POST/approve **503**.
- [ ] Setelah >10 mnt sys2-down: semua ditolak.

> Untuk uji grace tanpa benar-benar mematikan sys2 prod: di env **staging** sys1, arahkan `SSO_IDP_URL` ke host buntu (mis. `https://127.0.0.1:9` ) **setelah** cache authz terisi, lalu coba GET vs POST.

---

## 8. Buang SSO lama (Fase akhir, setelah verifikasi)

Setelah jalur baru terbukti jalan di produksi:
- Hapus route + `SSOController` lama (login via `?token=` query-string).
- Hapus config `jwt.shared_secret` (HS256) dan env webhook login (`WEBHOOK_*`).
- Matikan endpoint `api/jwt/orders/...` lama bila tak dipakai lagi (konfirmasi dulu dengan kami).

> Jangan hapus sebelum jalur SSO baru lolos checklist bagian 7 di produksi.

---

## 9. Checklist akhir

- [ ] `composer require league/oauth2-client firebase/php-jwt`
- [ ] `config/sso.php` ada; **tidak ada `env()` di luar config**
- [ ] `.env` terisi (idp url, client id/secret, redirect uri, public key path, ttl, grace)
- [ ] `oauth-public.key` ter-deploy di semua server (byte-identik IdP)
- [ ] route `/auth/login`, `/auth/callback`, `/auth/logout`
- [ ] middleware `sso.auth` di semua route modul + `TokenVerifier` (aud=sys1, exp, signature)
- [ ] service `Authz` (cache TTL ≤120 dtk + grace) menyuntik proyek/area ke `TenantContext` (termasuk flag `all` super_admin)
- [ ] `Gate::before` pakai permission sys2; `can:...` jalan
- [ ] route destruktif ditandai `sso.destructive`
- [ ] lolos checklist conformance (bagian 7)
- [ ] SSO lama dibuang (bagian 8)
- [ ] NTP sinkron + HTTPS `sys1.siproper.com` aktif

---

## Yang TIDAK perlu kamu kerjakan
- ❌ Mendefinisikan/menyalin permission & role — pakai punya sys2 (`Gate::before` baca dari authz).
- ❌ Tabel pemetaan ID proyek/area — sudah pakai ID sys2.
- ❌ Form login / 2FA — semua di sys2.

Pertanyaan / butuh `client_secret`, `oauth-public.key`, atau user uji → hubungi tim IdP (sys2).
