# Diagram Arsitektur SSO

Sumber diagram (Mermaid) + hasil render untuk presentasi.

| Diagram | Sumber | PNG (hi-res) | SVG (vektor) |
|---|---|---|---|
| Alur Login SSO | `01-login-flow.mmd` | `01-login-flow.png` | `01-login-flow.svg` |
| Single Logout | `02-single-logout.mmd` | `02-single-logout.png` | `02-single-logout.svg` |
| Gating Otorisasi 3 Lapis | `03-gating-3-lapis.mmd` | `03-gating-3-lapis.png` | `03-gating-3-lapis.svg` |

- **PNG** (`-s 3`, resolusi 3×) → untuk slide/PowerPoint & dokumen Word.
- **SVG** → vektor, tajam di segala ukuran, untuk web/Figma.

## Regenerasi setelah edit `.mmd`

```bash
cd docs/diagrams
export PUPPETEER_SKIP_DOWNLOAD=1   # pakai Chrome sistem, tanpa unduh Chromium
for f in 01-login-flow 02-single-logout 03-gating-3-lapis; do
  npx -y @mermaid-js/mermaid-cli -i "$f.mmd" -o "$f.svg" -b white       -p puppeteer-config.json
  npx -y @mermaid-js/mermaid-cli -i "$f.mmd" -o "$f.png" -b white -s 3  -p puppeteer-config.json
done
```

`puppeteer-config.json` mengarahkan render ke Google Chrome di `/Applications` (macOS). Diagram dirender **lokal** — tidak dikirim ke layanan online mana pun.
