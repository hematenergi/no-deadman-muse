# NoDeadman Muse v1 — laporan implementasi

Tanggal: 2026-11-13. Acuan: `README.md` dan `docs/SPEC.md`. Lingkungan verifikasi: macOS/Darwin arm64, Node.js **v26.8.2**. Package menetapkan Node.js >=20 dan hanya mengimpor modul bawaan Node; tidak ada dependensi runtime maupun dependency pengujian. Tidak dilakukan git commit atau git push.

## Hasil per komponen

| # | Komponen | Hasil dan bukti |
|---|---|---|
| 1 | Registry | `src/store.mjs`: `runs.json` berupa map, ditulis ke temporary file lalu di-rename. Transaksi antarproses diserialkan dengan directory lock. `events.jsonl` menyimpan `ts`, `run_id`, `event`, dan snapshot setiap perubahan run. Snapshot dapat memulihkan registry yang hilang/rusak. Field run wajib tersedia; `wrapper_pid`, `observation`, dan klaim sementara `gate_attempt` melengkapi bukti operasional. Tes mencakup penggantian atomik, kegagalan serialisasi, pemulihan, dan 10 registrasi CLI bersamaan. |
| 2 | Status machine | `src/core.mjs`: jalur `registered → starting → running → awaiting_review → completed`, dengan cabang terminal `failed`, `blocked`, `timed_out` dari state aktif. State terminal tidak dapat dibuka kembali. Semua pasangan transisi diuji, termasuk penolakan transisi langsung ke `completed`; hanya completion gate memiliki otorisasinya. |
| 3 | CLI | `bin/ndm.mjs`, executable dan package bin `ndm`: seluruh perintah register/run/start/heartbeat/progress/complete/status/list/watch/sweep/ack tersedia. Wrapper mencatat bukti spawn, PID, waktu mulai, heartbeat otomatis, exit code/signal, dan stdout/stderr ke log run. Exit-0 berakhir di review; exit nonzero/signal atau kegagalan spawn mengirim insiden. Preflight diulang sebelum spawn. External start mensyaratkan PID hidup. Tes CLI memakai subprocess nyata. |
| 4 | Preflight | Brief harus file yang dapat dibaca dan tidak kosong; cwd harus direktori; executable harus ditemukan dan executable; parent artifact harus ada. Penolakan dicatat sebagai `blocked`, dengan `preflight_rejected` dan daftar alasan bernama, lalu dikirim ke outbox. Tes mencakup brief hilang/kosong/direktori, cwd hilang/file, command tidak ditemukan/tidak executable, serta parent artifact hilang. |
| 5 | Completion gate | Hanya menerima `awaiting_review`, memeriksa artifact bila dideklarasikan, mengeksekusi gate bila dideklarasikan di cwd, merekam output, dan menuntut exit-0. Artifact diperiksa lagi setelah gate. Penolakan menghasilkan `completion_rejected`. Klaim gate mencegah dua pemanggilan bersamaan mengeksekusi gate dua kali. Tes mencakup artifact hilang, gate gagal, artifact + gate berhasil, serta pemanggilan complete bersamaan. |
| 6 | Supervisor/alarm | `src/supervisor.mjs` dan `src/alarms.mjs`: sweep satu kali atau watch independen; start-unconfirmed, wrapper/process hilang, heartbeat basi (`observation: unobserved`, tanpa gagal karena heartbeat saja), deadline, dan no-progress berdasarkan profile. Record run tidak valid menghasilkan `record_invalid` dan tidak menghentikan record lain. Insiden persisten, file outbox deduplikasi ID, ack persisten, dan satu eskalasi per insiden. Webhook POST opsional memiliki timeout 5 detik; kegagalannya menjadi event. Watch berhenti bersih dengan SIGINT/SIGTERM. |
| 7 | Config | `src/config.mjs`: `ndm.config.json` opsional, state dir default `.ndm`, sweep 10 s, heartbeat 10 s, konfirmasi start 15 s, heartbeat basi 45 s, eskalasi 120 s; profile default tanpa limit progress. Nilai timer, path, profile dan URL webhook divalidasi. Path relatif dan penggunaan CLI dijelaskan di README. |

Heartbeat dan no-progress diperiksa saat `running`; proses yang telah keluar ke review tidak wajib terus mengirim heartbeat. Deadline berlaku untuk seluruh state nonterminal, termasuk review. Kondisi start-unconfirmed mempertahankan `starting` dan insidennya tetap dapat dieskalasikan.

Race nyata ditemukan dan diperbaiki: watcher semula dapat melihat child sudah mati sebelum wrapper selesai mencatat exit, sehingga mengirim `wrapper_lost` palsu. `wrapper_pid` kini membuktikan bahwa wrapper masih bertanggung jawab mencatat exit. Tes regresi menjalankan watcher setiap 1 ms bersama 10 child singkat, serta membunuh wrapper nyata saat child masih hidup. Deadline yang lebih dahulu tercapai juga tidak dapat ditimpa oleh exit-0 terlambat; CLI run mengembalikan nonzero untuk kasus tersebut.

## Perintah verifikasi dan hasil

Sesuai instruksi RTK lokal, perintah shell dijalankan melalui `rtk`; command sebenarnya tercantum di kolom kedua.

| Perintah yang dijalankan | Command sebenarnya | Hasil |
|---|---|---|
| `rtk npm test` | `npm test` → `node --test test/*.test.mjs` | **Exit 0: 30 tests, 30 pass, 0 fail, 0 skipped**, durasi terakhir 3716.449375 ms. |
| `rtk proxy node scripts/inject-failures.mjs` | `node scripts/inject-failures.mjs` | **Exit 0**, `result: PASS`, seluruh empat skenario di bawah lolos. |
| `rtk proxy ./bin/ndm.mjs --help` | `./bin/ndm.mjs --help` | **Exit 0**, shebang/executable dan daftar perintah berfungsi. |
| `rtk git diff --check` | `git diff --check` | **Exit 0**, tidak ada masalah whitespace pada diff tracked. |

Selain Definition of Done, suite memverifikasi heartbeat otomatis, signal termination, spawn error setelah preflight berhasil, preflight ulang, status/list JSON, validasi CLI/config, progress dengan heartbeat segar, heartbeat recovery dan insiden berulang, ack/eskalasi, pemulihan outbox, deduplikasi pengiriman bersamaan, wrapper hilang, dan timeout selama run.

Tes webhook awalnya mencoba server HTTP loopback nyata, tetapi sandbox menolak `listen 127.0.0.1` dengan **EPERM**. Tes final menggunakan mock `fetch` untuk memeriksa POST JSON, timeout signal, sukses HTTP, HTTP 503, exception jaringan, event kegagalan, dan tidak adanya retry buta. Ini bukan bukti bahwa transport HTTP nyata berhasil di lingkungan ini.

## Injeksi kegagalan: latensi terukur

Skrip menggunakan CLI subprocess nyata dan direktori sementara terisolasi; state produksi tidak disentuh dan direktori dibersihkan. Waktu menggunakan wall clock milidetik. Pengamatan endpoint berarti baris alarm sudah dibaca dari `alarms.jsonl` setelah CLI selesai, sehingga merupakan batas atas konservatif latensi append lokal. Sampel terakhir:

| Skenario | Assertion | Pengukuran |
|---|---|---|
| Brief hilang | Register exit nonzero; record `blocked`; alarm dengan alasan `brief_missing` | Dari pemanggilan register sampai alarm teramati: **35 ms**. |
| Child exit-1 cepat | Run exit nonzero; record `failed`; `process_failed` ada; child keluar <1 s | Spawn CLI → insiden **59 ms**; bukti spawn child → insiden **31 ms**; spawn CLI → alarm teramati **63 ms**. |
| Heartbeat stall | External start dengan PID hidup, berhenti memberi heartbeat; sweep mengirim `heartbeat_stale`; state tetap `running` dengan `unobserved` | Konfirmasi heartbeat terakhir → alarm teramati **198 ms**. |
| Deadline terlewati | Sweep mengubah state menjadi `timed_out` dan mengirim `deadline_exceeded` | Pemanggilan register → alarm teramati **236 ms**. |

Heartbeat stale threshold dan deadline injeksi sengaja dipercepat menjadi **0.1 s**, dengan jeda nyata 160 ms sebelum sweep; sweep interval config injeksi 0.02 s. Tidak ada timestamp registry yang dipalsukan dalam skrip injeksi. Pengukuran exit-1 berada jauh di bawah target 30 detik. Skrip mensyaratkan keberadaan insiden/alarm, bukan mengklaim SLA dari satu sampel. Angka ini bukan hasil pilot, distribusi p50/p95, atau pembuktian SLA konfigurasi default pada host berbeban.

## Celah dan batas yang masih ada

1. **Crash di dalam transaksi dapat meninggalkan `.lock`.** Writer berikutnya menunggu maksimal sekitar 5 detik lalu gagal; watcher mencatat kegagalan sweep dan terus mencoba. Pemulihan lease otomatis belum ada. Operator harus memastikan semua writer berhenti dan memeriksa `.lock/pid` sebelum menghapus lock. Ini risiko nyata untuk operasi tanpa pengawasan, walaupun kill wrapper di luar transaksi sudah diuji.
2. **Tidak ada transaksi lintas beberapa file atau jaminan power-loss durability.** Rename melindungi JSON registry dari pembacaan setengah tulis, tetapi tidak ada `fsync`, checksum, atau repair otomatis untuk baris JSONL terpotong. Crash sesudah append event tetapi sebelum rename registry dapat meninggalkan registry valid yang tertinggal; replay otomatis saat ini hanya untuk registry hilang/rusak. Incidents/event/snapshot/outbox dapat memerlukan rekonsiliasi operator setelah kegagalan storage.
3. **Webhook best effort, satu percobaan per incident ID.** Klaim percobaan dicatat sebelum HTTP agar panggilan ambigu tidak diulang. Crash sesudah klaim dapat menggagalkan POST; tidak ada retry/backoff atau pengiriman ulang setelah channel recovery. File outbox tetap menjadi endpoint lokal persisten. P4 mengenai recovery channel/host belum terbukti dan cross-host watchdog memang di luar scope v1.
4. **Gate adalah command tepercaya, tanpa batas waktu eksekusi khusus.** Deadline tetap dapat dideteksi watcher independen dan mencegah completion terlambat, tetapi tidak membunuh gate. Kill CLI saat gate berjalan meninggalkan `gate_attempt` untuk inspeksi manual; explicit retry setelah gate gagal dapat mengeksekusinya lagi. Gate sebaiknya pemeriksaan tanpa efek eksternal. Artifact/gate bersifat opsional sesuai SPEC: keduanya perlu dideklarasikan bila penerimaan run memang mensyaratkannya.
5. **Tidak mengelola penghentian process tree, PID identity, atau daemon OS.** Deadline/wrapper loss tidak membunuh child; pekerjaan atau efek eksternal dapat terus berjalan. PID reuse dan zombie process belum diatasi. `watch` harus dijalankan terpisah dan dijaga hidup oleh operator/service manager; satu host yang mati tidak bisa mengalarm dirinya sendiri.
6. **Skala dan platform belum dipilotkan.** Semua file dibaca secara linear dan riwayat tidak dirotasi. Tidak ada pengujian load jangka panjang, filesystem jaringan, disk penuh, restart host, Windows, maupun runtime Node 20/22 secara langsung; verifikasi dilakukan pada Node 26.8.2 macOS. Hanya API bawaan yang tersedia sejak Node 20 digunakan.
7. **P1–P6 belum dinilai.** Belum ada pilot 14 hari, baseline beban supervisi, >=40 peluncuran operasional, >=20 fault samples, pengukuran false alarm/triage, atau penilaian mutu artifact. Gate lulus dan proses hijau tidak menggantikan review manusia/agent.

Dashboard, retry child, LLM, npm publishing dan cross-host watchdog tetap tidak dibangun, sesuai out-of-scope v1. Perubahan siap diperiksa supervisor; tidak ada commit/push.
