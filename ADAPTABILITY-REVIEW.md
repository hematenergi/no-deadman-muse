# Adaptability review — NoDeadman Muse

Tanggal: 2026-11-13. Pemeriksa: Codex, pemeriksaan independen terhadap dokumentasi dan prosedur adopsi. Baseline checkout: `59583f0d61f360ba5c76ffbe7d5c738b90e220b1`. Lingkungan uji: macOS/Darwin arm64, Node.js v26.8.2, shell POSIX. Tidak ada commit/push.

## Cakupan dan hasil

Seluruh README, SKILL, SPEC yang sebenarnya berada di `docs/SPEC.md`, REPORT, dan LICENSE dibaca. Tidak ada `ndm.config.json` bawaan di root: contoh JSON README dibandingkan dengan `loadConfig()`. Kode CLI, registrasi/preflight, completion, penyimpanan, supervisor, alarm, dan tes terkait ditelusuri untuk memeriksa klaim dokumentasi. Pemeriksaan isi publik juga menemukan ketergantungan mesin asal di dokumentasi/generator aset.

Koreksi dilakukan di working tree. CLI supervisor tidak diubah: temuan perilaku di bawah cocok dengan kontrak v1 dan diperbaiki di dokumen. Generator aset opsional diperbaiki agar input font dan renderer dapat dipilih operator; tidak ada aset logo yang diregenerasi. Kedua suite wajib hijau. Ini bukti adopsi lokal dan konsistensi dokumen, bukan bukti bahwa semua OS atau semua integrasi agent telah diuji.

## Daftar temuan dan perbaikan

Lokasi merujuk bagian/nama fungsi dalam hasil koreksi, agar tetap dapat ditemukan setelah nomor baris berubah.

| # | Berkas + lokasi | Kelas | Cacat yang ditemukan → perbaikan |
|---|---|---|---|
| 1 | README, paragraf pembuka | tidak-generik | Sasaran dibatasi pada “Muse agents” → individu, tim, dan agent; nama produk tetap NoDeadman Muse. |
| 2 | README, pembuka / How it works | klaim-tak-cocok-kode | Seolah semua peluncuran otomatis terdaftar dan semua run yang tidak pernah diluncurkan terdeteksi dalam detik → hanya run yang didaftarkan yang diawasi; `registered` yang tidak diluncurkan terdeteksi saat deadline, bukan ambang start 15 s. |
| 3 | README Quickstart; README/SKILL setup | tidak-generik | Shell POSIX, `test`, keberadaan checkout, dan direktori watcher kurang eksplisit → prasyarat dinyatakan, watcher dari direktori registry yang sama, process manager hanya opsi, native Windows belum diverifikasi. |
| 4 | README Quickstart / Running v1 | salah-eksekusi | `<RUN_ID>`/`RUN_ID` perlu penggantian manual dan raw angle brackets bermakna redirection bagi shell → contoh yang siap dijalankan menangkap ID ke variabel shell dan mengutipnya. Exit 1 contoh gagal ditandai sebagai hasil yang diharapkan. |
| 5 | README/SKILL register | tidak-konsisten | Instruksi hanya menyuruh menangkap bare ID, tanpa menyebut penolakan preflight juga mencetak ID → wajib cek exit code; jelaskan `blocked`, exit 1, dan pesan stderr. Input CLI yang tidak valid dapat ditolak sebelum menghasilkan ID. |
| 6 | README For agents; SKILL pembuka | tidak-generik | Penggunaan CLI seolah terikat checkout/current directory dan file konfigurasi wajib ada → workspace registry bebas dipilih, konfigurasi opsional, CLI dapat dipanggil lewat path absolut dari workspace lain; tidak perlu runtime/tool/folder skill tertentu. |
| 7 | README/SKILL Launch workflow | klaim-tak-cocok-kode | Relative brief selalu dinyatakan salah → aturan sebenarnya dijelaskan: brief/cwd terhadap direktori invokasi, artifact terhadap run cwd, argumen child terhadap child cwd. |
| 8 | README Use case 1 | salah-eksekusi | Brief `./runs/REFAC-123/BRIEF.md` diteruskan lagi ke agent yang cwd-nya sudah folder tersebut → path brief absolut yang sama dipakai untuk registrasi dan child. |
| 9 | README Use cases 1 dan 3; README/SKILL template register | tidak-konsisten | Command agent, BRIEF/RELEASE, release script, serta parent `dist` tidak disediakan dan tidak jelas sebagai template → prasyarat/example ditandai eksplisit; placeholder dijelaskan dan harus diganti/diquote. Contoh Running v1 menyebut brief dari Quickstart. |
| 10 | README/SKILL setup | klaim-tak-cocok-kode | Tanpa watcher diklaim tidak ada alarm sama sekali → register/run/complete tetap mengirim alarm kegagalan langsung; sweep/watch diperlukan untuk pemeriksaan periodik dan eskalasi. |
| 11 | README/SKILL start verification | klaim-tak-cocok-kode | Polling wajib melihat `starting` lalu `running`, sehingga child singkat yang sukses dapat disangka mati → periksa PID, `started_at`, history/event; polling boleh sudah melihat review/failed. Ketiadaan bukti disebut unconfirmed, bukan bukti pasti mati. |
| 12 | README/SKILL completion contract | klaim-tak-cocok-kode | Artifact dan gate dinyatakan selalu wajib oleh CLI → keduanya opsional menurut SPEC/kode; protokol adopsi tetap meminta keduanya untuk pembuktian hasil, dengan pembedaan jelas dari aturan CLI. |
| 13 | README/SKILL completion | tidak-konsisten | Gate digambarkan membuktikan keberadaan saja → existence + exit gate hanya membuktikan pemeriksaan yang dideklarasikan; review kualitas tetap tugas operator. |
| 14 | README/SKILL status monitoring | klaim-tak-cocok-kode | `status` seolah memeriksa freshness secara langsung → hanya membaca state tersimpan; periksa timestamp heartbeat dan insiden progress, jangan mengandalkan label `running` saja. |
| 15 | README How it works; SKILL setup/failure | klaim-tak-cocok-kode | Sweep “setiap 10 s”, start “≤15 s”, eskalasi tepat 2 menit, dan delivery ≤30 s terdengar seperti jaminan → threshold/default dijelaskan terpisah dari jadwal sweep, durasi pass, dan prediksi pilot. Webhook satu POST best effort dengan timeout 5 s, tanpa retry otomatis. |
| 16 | README How it works | tidak-konsisten | Diagram berpotensi menyiratkan semua cabang terminal hanya dari review → success path dan cabang terminal dari setiap state aktif dijelaskan terpisah. |
| 17 | README/SKILL preflight | klaim-tak-cocok-kode | “Declared prerequisites”/working directory “correct” terlalu luas → pemeriksaan yang benar disebutkan: brief readable/nonempty, cwd direktori, executable, parent artifact. Argumen/dependensi task bukan tanggung jawab preflight. |
| 18 | README Quickstart, injection description | klaim-tak-cocok-kode | Wrapper exit-1 diatribusikan pada watcher dan injection diklaim mencakup setiap failure class → wrapper melaporkan exit langsung; injection hanya empat skenario yang memang ada. |
| 19 | README Use case 2 | salah-eksekusi | `$!` dipakai tanpa peluncuran background pada contoh → PID eksplisit dari scheduler/operator, setelah registrasi sebelum launch; ID/PID ditandai placeholder. |
| 20 | README/SKILL external processes | klaim-tak-cocok-kode | Jalur attach tidak menjelaskan tidak adanya successful-exit API → ditandai hanya untuk liveness, tidak dapat menuju review/completed; rekomendasi menjadwalkan `ndm run` untuk verified completion. |
| 21 | README Use case 2; SKILL external processes; docs/SPEC supervisor | klaim-tak-cocok-kode | Heartbeat/no-progress tercampur sebagai “unobserved” otomatis → heartbeat basi mempertahankan `running` dengan field `observation`; no-progress perlu profile dan hanya mengirim insiden. Interval heartbeat eksternal dijelaskan. |
| 22 | README Use case 4 / Design principles; SKILL setup | tidak-generik | Registry “whole fleet” bisa terbaca lintas host/tenant; event “bus” dan semua metadata “in config” tidak tepat → satu local registry per host, operator tepercaya, JSONL log; owner/path run dari register, host settings dari config. Data argv/log perlu dibatasi aksesnya. |
| 23 | README Use case 4 | klaim-tak-cocok-kode | Ack terdengar menghapus item antrean → insiden dan ack append ke history; ack tidak menghapusnya. |
| 24 | README/SKILL launch logs | tidak-konsisten | “Wrapper log” tidak dibedakan dari output child/gate → lokasi `<stateDir>/logs/<RUN_ID>.log` disebutkan, wrapper stderr disimpan terpisah. |
| 25 | REPORT, Perintah verifikasi | tidak-generik | Wrapper shell lokal tampil sebagai langkah verifikasi → perintah langsung dicantumkan; angka lama tetap ditandai hasil implementasi awal, bukan hasil uji baru atau pilot. |
| 26 | REPORT, celah #7 | tidak-konsisten | “Belum ada pilot 14 hari” ambigu terhadap status README yang sedang berjalan → diperjelas belum selesai/dinilai. Makna status pilot tidak berubah. |
| 27 | docs/SPEC, pembuka / supervisor / out of scope | tidak-konsisten | Referensi README tidak berupa tautan relatif; deskripsi wrapper loss terlalu ringkas → tautan `../README.md` dan aturan wrapper PID versus external PID diselaraskan dengan implementasi yang menghindari race exit child. Tidak mengubah kontrak state. |
| 28 | assets/BRAND.md; assets/build-logo.py, konfigurasi font/renderer | tidak-generik | Nama pribadi/agent dan path font/helper renderer milik mesin asal bocor ke isi publik → riwayat brand dibuat umum, generator menerima `--serif-font`, `--tag-font`, serta `--resvg`, dan memakai CLI resvg biasa tanpa helper di luar repo. Geometri, warna, dan aset yang disertakan tidak diubah. |
| 29 | assets/BRAND.md, daftar berkas / regenerasi | tidak-konsisten | Proof/context PNG disebut seolah termasuk checkout; dependensi generator tidak lengkap → hasil generator ditandai tidak disertakan; Python/fontTools/Pillow/numpy/resvg/font dicantumkan sebagai prasyarat opsional, terpisah dari CLI Node tanpa runtime dependencies. Klaim kegagalan parser spesifik diganti dengan alasan kompatibilitas SVG umum. |

## Bukti eksekusi

### Scratch dan Quickstart

Percobaan clone HTTPS sesuai README benar-benar dijalankan dan **gagal exit 128**: `Could not resolve host: github.com`. Ini batas DNS/network sandbox, bukan keberhasilan clone publik. Untuk melanjutkan, baseline yang sama di-clone lokal dengan `git clone --no-hardlinks` ke `/tmp/ndm-adaptability-original`. Clone final baru di `/tmp/ndm-adaptability-final-zmw_2_a2/no-deadman-muse` menerima overlay hanya file hasil koreksi dari working tree karena perubahan memang tidak di-commit.

Quickstart asli berhasil setelah placeholder ID diganti dengan ID sebenarnya. Reproduksi terpisah terhadap path brief Use case 1 asli: register exit 0, child membaca path yang menjadi salah setelah cwd berubah, run exit 1. Ini cacat contoh, bukan kegagalan preflight: preflight tidak memahami argumen milik agent lain.

Quickstart final diekstrak dari fenced blocks README dan dijalankan dengan shell yang sama agar variabel ID bertahan. Watcher berjalan sebagai proses terpisah dengan default config dan dihentikan melalui SIGTERM (exit 0).

| Langkah | Hasil final |
|---|---|
| Write brief | Exit 0; file non-empty. |
| Register dengan artifact dan gate | Exit 0; bare UUID ditangkap di `RUN_ID`. |
| Run + status | Exit 0; `awaiting_review`, PID dan `started_at` ada. |
| Complete | Exit 0; `result.txt` tepat berisi `report body`; history `registered → starting → running → awaiting_review → completed`. |
| Register contoh gagal | Exit 0; ID baru, terpisah dari run sukses. |
| Run `process.exit(1)` | **Exit 1 yang diharapkan**; status `failed`, insiden/alarm `process_failed` untuk ID yang sama. |
| List, status tanpa ID, ack, sweep | Exit 0; JSON dan ack persisten diverifikasi. |
| Injection dari Quickstart | Exit 0, PASS. |

ID bukti final: sukses `629bdefe-8527-409b-a81a-790eeab226d7`; gagal `e94ade84-5f9c-4e10-8af4-b6d1976b41c3`. State uji terisolasi dari `.ndm` workspace kerja. Proses watcher/child yang diluncurkan untuk uji dihentikan setelah pemeriksaan.

### Template dan adaptabilitas

Runner final mencatat **29 pemanggilan shell/CLI**, mencakup:

- Seluruh shell block Quickstart setelah tahap clone, serta block Running v1 (termasuk `npm test` dan injection) dengan prasyarat brief yang tertulis.
- Use case coding-agent dengan executable fixture `your-agent-command`: benar-benar membaca brief absolut dari cwd run dan menghasilkan REPORT, lalu run/complete berhasil. Ini uji kontrak CLI memakai stub, bukan bukti kompatibilitas produk agent tertentu.
- Use case release dengan fixture `RELEASE.md`, parent `dist`, dan executable `scripts/release.sh`: register/run/complete berhasil. Isi fixture bundle hanya data uji untuk gate `test -s`, bukan uji mutu atau format ZIP.
- Template register README dan SKILL identik setelah whitespace diabaikan; keduanya diisi nilai yang sama dan berhasil dari workspace di luar checkout melalui path CLI absolut. Nama direktori brief, cwd, dan state mengandung spasi; owner bebas `example-team`.
- Template external start/heartbeat/progress kedua dokumen dijalankan menggunakan PID child nyata, setelah register. Complete saat masih running ditolak; setelah PID hilang, sweep mengubah status menjadi failed. Tidak ada successful-exit eksternal yang diasumsikan.
- Profile `batch` dengan no-progress 0.1 s memberi alarm walau heartbeat masih segar dan tidak mengubah observation. Kehilangan heartbeat memberi `unobserved`; ack berhasil. Timer dipercepat hanya pada workspace pengujian profile.
- Seluruh field JSON default README cocok dengan hasil `loadConfig()` tanpa file config, setelah normalisasi `stateDir` relatif menjadi absolut. `--help` dan executable shebang juga exit 0.

Pengukuran tambahan tanpa file config di scratch `/tmp/ndm-default-HZTeCJ`: wrapper nyata memberi heartbeat setelah **10.005 ms**; external PID yang tetap hidup tanpa heartbeat mendapat `heartbeat_stale` setelah **50.092 ms** pada watcher default. Pada sekitar detik 46, pembacaan `status` masih belum memuat observation `unobserved`; setelah sweep berikutnya, status tetap `running` dan observation menjadi `unobserved`. Tidak ada alarm no-progress karena profile default tidak menetapkan batas. Ini satu sampel yang mendukung aturan threshold + sweep, bukan jaminan latensi.

### YAML dan tautan

Frontmatter SKILL sudah valid pada baseline dan tetap valid setelah koreksi. Diperiksa menggunakan parser YAML sungguhan **Ruby Psych 5.3.1**, `YAML.safe_load`, bukan regex sebagai parser. Assertion memastikan map berisi `name` dan `description` dengan nilai string non-empty. Tidak perlu menambah dependency YAML ke package. Deskripsi yang sudah diquote dipertahankan; tidak ada frontmatter lain dalam dokumen publik repo.

Tautan relatif Markdown dan `src` HTML diperiksa terhadap file repo, termasuk anchor README: **12 referensi, seluruhnya valid**, sesudah berkas laporan ini tersedia. Header README, status pilot, seluruh bagian prediksi P1–P6, LICENSE, dan semua SVG/PNG yang disertakan juga dibandingkan byte demi byte dengan baseline: semuanya tetap identik. Sintaks kedua file Python lolos `ast.parse`. `ndm.config.json` tidak ditautkan sebagai berkas bawaan; JSON README adalah contoh konfigurasi opsional.

### Regresi dari root repo

| Perintah | Hasil |
|---|---|
| `npm test` | Exit 0; **30 tests, 30 pass, 0 fail, 0 skipped**. |
| `node scripts/inject-failures.mjs` | Exit 0; **PASS**, seluruh empat skenario. |
| `python3 test/logo-generator.test.py` | Exit 0; 1 unittest dengan 3 subkasus: help, font hilang, renderer hilang. Semuanya memastikan tidak ada output aset yang ditulis sebelum validasi berhasil; tidak memerlukan paket grafis. |
| Parser YAML Psych | Exit 0; struktur/name/description valid. |
| `git diff --check` | Exit 0. |

Sampel injection root pada pemeriksaan ini (wall clock, termasuk overhead subprocess): brief hilang sampai alarm teramati **39 ms**; exit-1 dari spawn CLI ke incident **57 ms**, spawn child ke incident **23 ms**, spawn CLI ke alarm teramati **61 ms**; heartbeat stall **200 ms**; deadline **227 ms**. Threshold heartbeat/deadline injection **0.1 s**, bukan default operasional. Angka ini satu sampel, bukan SLA atau hasil pilot.

## Yang sengaja tidak diubah

- Logo/header README, SVG/PNG yang disertakan, warna/geometri brand: bukan tugas desain ulang. Identitas produk “NoDeadman Muse” tetap; “Muse” sebagai prasyarat agent sudah dihapus.
- Prediksi P1–P6 serta status pilot pada README: beku sesuai mandat; tidak dinyatakan lulus berdasarkan suite ini. Origin tetap cerita generik satu-person multi-agent fleet.
- LICENSE MIT dan atribusi copyright: nama di sana adalah atribusi hukum, bukan prasyarat setup. Tidak menghapus kewajiban mempertahankan notice.
- API, state machine, nilai default, dan optional artifact/gate dalam CLI: sesuai SPEC. Dokumentasi protokol boleh menganjurkan artifact + gate, tanpa mengklaim CLI mewajibkannya.
- Tidak menambah dependency runtime, framework agent, process manager, retry webhook, exit API eksternal, cross-host daemon, installer, atau npm publishing: tidak diperlukan untuk koreksi dan beberapa eksplisit di luar scope v1.
- Angka implementasi historis REPORT dipertahankan, ditandai historis; hasil run ini dilaporkan terpisah. Tidak mengedit registry/live state pengguna.
- Tidak membuka folder atau konteks di luar repo selain instruksi skill/RTK yang sudah diotorisasi; tidak memakai mailbox atau menghubungi pihak lain. Brief run ini cukup untuk pekerjaan.

## Sisa risiko dan batas verifikasi

1. Clone GitHub melalui HTTPS belum dapat dibuktikan dari sandbox akibat DNS; clone lokal bukan pengganti bukti konektivitas publik. Tidak ada commit/push sehingga publik masih memerlukan publikasi hasil koreksi oleh pemilik repo.
2. POSIX/macOS dan Node 26.8.2 teruji di run ini. Native Windows, WSL, Linux, Node 20/22, process manager, dan agent runtime tertentu belum diuji langsung; dokumen tidak mengklaim matriks platform tersebut lulus.
3. Registry hanya satu host dengan operator yang saling percaya. PID reuse, zombie process, network filesystem, multi-user permissions, skalabilitas/rotasi history, crash lock, dan power-loss durability tetap batas v1 yang sudah dirinci di REPORT.
4. Watcher memerlukan proses independen yang tetap hidup. Heartbeat wrapper membuktikan wrapper memberi sinyal, bukan agent membuat kemajuan. No-progress perlu profile; deadline tidak membunuh child/gate. Host mati tidak bisa mengalarm dirinya sendiri.
5. Webhook hanya satu percobaan best effort; pemulihan channel/host dan transport HTTP nyata tidak dibuktikan oleh tes mock. P4 tetap prediksi, bukan fitur yang dijanjikan.
6. Artifact/gate opsional dan gate adalah command tepercaya tanpa timeout khusus. Operator perlu memilih pemeriksaan dan melakukan review kualitas. Attach eksternal tidak dapat menuntaskan run secara sukses di v1.
7. Regenerasi logo penuh tidak dijalankan: font, fontTools, Pillow, dan binary resvg tidak tersedia dalam environment uji ini. Validasi argumen serta sintaks Python diuji; penggunaan `resvg --width WIDTH INPUT OUTPUT` dicocokkan dengan [sumber CLI resmi resvg](https://github.com/linebender/resvg/blob/main/crates/resvg/src/main.rs). Output byte-identik lintas versi font/renderer belum terbukti. Regenerasi harus dilakukan di salinan checkout karena menimpa aset.

Tidak ada blocker teknis di dalam repo yang mencegah kedua suite wajib. Batas network dan tooling grafis di atas dilaporkan apa adanya dan tidak dianggap sebagai bukti sukses yang belum ada.
