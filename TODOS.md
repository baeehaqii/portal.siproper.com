# TODOS — portal.siproper.com

Deferred work captured during `/plan-eng-review` (2026-06-12). Core SSO (Fase 1–3) is the active build; items below are the separate HA/resilience track agreed in scope decision D1.

## Infra HA (bagian 13)
**What:** Load balancer aktif-aktif lintas VPS1+VPS2, read/write split DB (write→MySQL primary VPS1, read→replica VPS2, `sticky=true`), Redis pusat di VPS1, migrasi sys2 `SESSION_DRIVER` dari `database` ke Redis.
**Why:** Membagi beban 2 VPS + konsistensi sesi lintas-node. Dibutuhkan sebelum trafik produksi berjalan di dua VPS.
**Depends on:** Core SSO (Fase 1–3) selesai & terverifikasi.
**Where to start:** ARCHITECTURE_SSO.md bagian 13. Konfigurasi koneksi `read`/`write` Laravel + `sticky`; arahkan semua tulis OAuth ke primary VPS1.
**Caveat:** Redis pusat di VPS1 = single point of failure (diterima: failover = login ulang). Naikkan ke Redis Sentinel bila ingin tanpa SPOF.

## Failover / Failback otomatis + backup 23:59 WIB (bagian 14)
**What:** Otomasi promote MySQL replica VPS2 jadi primary saat VPS1 mati (Keepalived VIP / ProxySQL / MySQL Orchestrator), anti split-brain (hanya satu primary), failback ke skema awal saat VPS1 pulih, + cut-off replikasi tiap 23:59 WIB (`STOP REPLICA` → backup konsisten → `START REPLICA`).
**Why:** Layanan tetap hidup saat VPS1 down; backup point-in-time harian tanpa membebani primary.
**Depends on:** Infra HA (bagian 13) terpasang lebih dulu.
**Where to start:** ARCHITECTURE_SSO.md bagian 14. Pilih tool failover, tulis skrip promosi + fencing, scheduler cron `59 23 * * *` TZ=Asia/Jakarta.
