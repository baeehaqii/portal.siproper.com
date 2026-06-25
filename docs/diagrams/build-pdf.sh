#!/usr/bin/env bash
# Build "Arsitektur SSO Siproper by Sapphire Grup.pdf" dari ARCHITECTURE_SSO_PDF.md.
#
# Kenapa perlu skrip: renderer PDF memblokir gambar via path relatif/file://,
# jadi PNG diagram di-embed sebagai data URI base64 sebelum di-render. Lebar
# gambar dibatasi <img style="max-width:100%"> agar tidak terpotong di halaman.
#
# Pakai: jalankan dari root repo →  bash docs/diagrams/build-pdf.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SRC="ARCHITECTURE_SSO_PDF.md"
OUT="Arsitektur SSO & Skema Mitigasi Server Down Siproper by Sapphire Grup.pdf"
TMP="$(mktemp -t sso-pdf-XXXX).md"
PDF_BIN="$HOME/.claude/skills/gstack/make-pdf/dist/pdf"

python3 - "$SRC" "$TMP" <<'PY'
import base64, re, sys, pathlib
src, tmp = sys.argv[1], sys.argv[2]
root = pathlib.Path.cwd()
s = pathlib.Path(src).read_text()
def repl(m):
    alt, url = m.group(1), m.group(2)
    img = (root / url).resolve()
    if not img.exists():
        return m.group(0)
    uri = "data:image/png;base64," + base64.b64encode(img.read_bytes()).decode()
    return (f'<p style="text-align:center;"><img src="{uri}" alt="{alt}" '
            f'style="max-width:100%; height:auto;" /></p>')
s = re.sub(r"!\[([^\]]*)\]\(([^)]*\.png)\)", repl, s)
pathlib.Path(tmp).write_text(s)
PY

"$PDF_BIN" generate --cover --toc \
  --title "Arsitektur SSO & Skema Mitigasi Server Down Siproper by Sapphire Grup" \
  --author "Sapphire Grup" \
  "$TMP" "$OUT"

rm -f "$TMP"
echo "OK → $OUT"
