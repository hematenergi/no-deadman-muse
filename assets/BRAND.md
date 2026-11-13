# NoDeadman Muse — Logo FINAL: Lentera Penjaga (Minji, 13 Nov 2026)

**Riwayat singkat:** v1 (garis nadi→centang) DITOLAK Dany — makna tidak terbaca, nama terasa kepotong. v2 (ubin hijau + denyut) DITOLAK — generik perkakas dev. Putaran sketsa: 3 arah tipografi gugur format (simbol tidak tampil), lalu 3 arah filosofis–absurd–medieval. **Dany memilih arah 1, Lentera Penjaga** (13 Nov 2026), dengan satu koreksi: bentuk lenteranya harus rapi. Paket ini final hasil koreksi itu.

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
| `context-readme-light.png` / `context-readme-dark.png` | Bukti konteks: lockup lebar tampil PERSIS 520px di simulasi header README |
| `proof-sheet.png` | Mark pada 256/64/32/16 di kedua latar |
| `build-logo.py` | Generator final deterministik (fontTools + PIL) |

Wordmark: "NoDeadman Muse" Noto Serif Display Black, satu nama utuh satu warna. Token: tinta `#11181D` · kertas `#F7F5F0` · api emas `#C9A227`.

**Rendering (koreksi Dany 13 Nov, "jangan raster"):** SVG adalah master vektor penuh — path Bézier asli, transform wordmark dibakar ke koordinat, semua angka desimal polos tanpa notasi eksponen (parser ketat seperti resvg salah membaca `1e-05` dan wordmark pernah meledak jadi blob karenanya). Semua PNG dirasterisasi DARI master SVG memakai resvg (rasterizer vektor sungguhan) pada 2× lalu diturunkan sekali — bukan poligon sampling PIL (itu penyebab tepi "patah-patah" pada antar pertama) dan bukan jalur SVG ffmpeg (diam-diam meng-upscale raster 100px).

## Pemasangan

Nama berkas lockup sama seperti sebelumnya — penanda `#gh-light-mode-only` / `#gh-dark-mode-only` yang terpasang memilih variannya. Naik hanya sesudah lolos mata Dany atas paket final ini.
