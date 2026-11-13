# NoDeadman Muse — Logo FINAL: Lentera Penjaga

**Riwayat singkat:** arah Lentera Penjaga dipilih pada 13 Nov 2026 setelah eksplorasi tipografi dan simbol; bentuk final mengutamakan simetri dan garis yang rapi.

## Konsep

Lentera penjaga malam: di abad pertengahan penjaga gerbang menyalakan lentera, berjaga semalaman, dan bersaksi bahwa semua aman — persis pekerjaan supervisor ini terhadap run agent: registrasi, jaga, dan alarm berbasis bukti. Apinya emas dan tidak pernah padam; tidak ada citra kematian di mana pun. Absurdnya halus: seremoni penjagaan kota dipakai menjaga proses yang tidak punya tubuh.

## Disiplin bentuk (jawaban atas koreksi "berantakan")

- Semua koordinat turun dari SATU sumbu tengah (cx=60); separuh kanan setiap kurva adalah cermin aritmetik separuh kiri. Cek cermin pada render final: 0,000% piksel berbeda di luar tepi antialias kurva.
- Satu berat garis (6 satuan) untuk cincin gantung + rangka ruang kaca.
- Tangga proporsi tetap: cincin ⌀18 · mahkota berkubah · ruang kaca lebar 56 · api di tengah ruang · alas bertangga 66/48.

## Berkas final

| Berkas | Isi |
|---|---|
| `lockup-light.svg` / `lockup-light.png` (2200px) | Lockup lentera tinta + wordmark tinta, transparan — README terang |
| `lockup-dark.svg` / `lockup-dark.png` (2200px) | Lockup lentera kertas + wordmark kertas, transparan — README gelap |
| `mark.svg` / `mark.png` (1024×1024) | Lentera tinta saja, transparan |
| `mark-dark.svg` / `mark-dark.png` (1024×1024) | Lentera kertas saja, transparan |
| `context-readme-light.png` / `context-readme-dark.png` (hasil generator, tidak disertakan) | Bukti konteks: lockup lebar tampil PERSIS 520px di simulasi header README |
| `proof-sheet.png` (hasil generator, tidak disertakan) | Mark pada 256/64/32/16 di kedua latar |
| `build-logo.py` | Generator aset opsional (lihat prasyarat di bawah) |

Wordmark: "NoDeadman Muse" Noto Serif Display Black, satu nama utuh satu warna. Token: tinta `#11181D` · kertas `#F7F5F0` · api emas `#C9A227`.

**Rendering:** SVG adalah master vektor penuh — path Bézier asli, transform wordmark dibakar ke koordinat, semua angka desimal polos tanpa notasi eksponen untuk menjaga kompatibilitas parser SVG. Semua PNG dirasterisasi DARI master SVG memakai resvg (rasterizer vektor sungguhan) pada 2× lalu diturunkan sekali — bukan poligon sampling PIL (itu penyebab tepi "patah-patah" pada antar pertama) dan bukan jalur SVG ffmpeg (diam-diam meng-upscale raster 100px).

## Pemasangan

Nama berkas lockup sama seperti sebelumnya — penanda `#gh-light-mode-only` / `#gh-dark-mode-only` yang terpasang memilih variannya. Perubahan aset sebaiknya melewati review visual sebelum dipublikasikan.


## Regenerasi opsional

Aset SVG/PNG siap digunakan dari checkout; regenerasi logo bukan langkah instalasi CLI `ndm`. Generator memerlukan Python 3, paket `fontTools`, `Pillow`, `numpy`, binary [resvg](https://github.com/linebender/resvg), serta file font Noto Serif Display Black dan Inter Regular yang disediakan operator. Path font dipilih lewat `--serif-font` dan `--tag-font`; `--resvg` dapat menunjuk executable di luar PATH. Tidak ada folder mesin/agent asal yang diperlukan.

Template (ganti path contoh dengan file lokal yang ada):

```sh
python3 assets/build-logo.py --serif-font /example/fonts/NotoSerifDisplay-Black.ttf \
  --tag-font /example/fonts/Inter-Regular.ttf
```

Generator menulis ulang SVG/PNG di direktori script dan menghasilkan proof sheet tambahan. Jalankan di salinan checkout bila hanya ingin mencoba; hasil bergantung pada versi font dan renderer. Jangan regenerasi untuk sekadar memakai CLI. Uji validasi argumen tanpa dependensi grafis: `python3 test/logo-generator.test.py`.
