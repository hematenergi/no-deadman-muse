# NoDeadman Muse — Logo (FINAL, Minji 13 Nov 2026)

Satu garis yang tidak putus: baseline sebuah run berjalan datar, melonjak sekali sebagai denyut jantung, dan jatuhnya denyut itu mendarat persis di lembah sebuah tanda centang yang lengan panjangnya menutup tinggi — nadi yang diawasi sampai akhir yang terverifikasi. Tidak ada citra kematian; garisnya tidak pernah putus dan tidak pernah flatline. Kata "Muse" adalah elemen yang paling mudah dikenali di lockup: Inter ExtraBold dalam hijau identitas, sesudah "NoDeadman" Inter SemiBold bertinta.

## Berkas final

| Berkas | Isi | Pakai untuk |
|---|---|---|
| `lockup-light.svg` / `lockup-light.png` (2200px) | Lockup horizontal, wordmark tinta #11181D, latar transparan | README mode terang / bawaan |
| `lockup-dark.svg` / `lockup-dark.png` (2200px) | Lockup horizontal, wordmark putih, latar transparan | README mode gelap |
| `mark.svg` / `mark.png` (1024×1024) | Mark pulse-check saja, transparan | Favicon, avatar repo, sosial |
| `proof-sheet.png` | Papan verifikasi Minji (kedua latar + ukuran 256/64/32/16) | Bukti gate, bukan untuk dipasang |
| `build-logo.py` | Generator deterministik (fontTools + PIL) | Reproduksi: `python3 build-logo.py` |

SVG adalah master: wordmark sudah berupa path glyph (bukan elemen teks), jadi render di mana pun tanpa dependensi font.

## Token

- Hijau identitas `#16A34A` — kontras 3,30:1 di putih, 5,74:1 di #0D1117 (latar gelap GitHub). Warna "lolos/alive" perkakas dev, sengaja hijau murni agar tidak tertukar dengan lime Opozizi.
- Tinta `#11181D` (17,91:1 di putih) · Putih `#FFFFFF` (18,92:1 di #0D1117).
- Mark: satu polyline, grid 100, titik (8,57) (28,57) (39,30) (50,68) (92,26), stroke 11,5, ujung + sambungan membulat.

## Rekomendasi pemasangan README

Pakai elemen `<picture>` agar lockup mengikuti tema GitHub pembaca:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="lockup-dark.png">
  <img alt="NoDeadman Muse" src="lockup-light.png" width="520">
</picture>
```

Bila hanya satu berkas yang boleh dipasang: `lockup-light.png`. Tagline "No agent run dies silently." dibiarkan sebagai teks README di bawah header, bukan di dalam lockup — header tetap bersih dan tagline tetap bisa dicari/diedit sebagai teks.

## Verifikasi (Minji)

- Kontras terukur di dalam generator (dicetak saat build).
- Mark terbaca pada 256/64/32; pada 16 detail denyut menyatu tetapi siluet centang + hijau bertahan.
- Kedua lockup dinilai dari render PNG final di proof-sheet (terang + gelap).
