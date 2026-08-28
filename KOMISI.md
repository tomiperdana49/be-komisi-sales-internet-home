# Komisi Account Manager & Sales Manager 2026

Dokumen ini fokus pada **aturan bisnis perhitungan komisi**.

> **⚠️ Target Aktivitas kini dapat dikonfigurasi per Account Manager per periode** (menu admin *Summary > Target*), disimpan sebagai kolom `target` di tabel `status_period` (satu baris = satu employee + satu periode), dengan default **12** (`DEFAULT_SALES_TARGET`) untuk status **Permanent**, dan **0** untuk status **Probation** (karena rate recurring & performance penalty hanya pernah menggerbang status Permanent — lihat 2.A & 1.2) saat baris itu pertama dibuat oleh `employee:crawl`. Target inilah yang dipakai untuk rate recurring (2.A) dan performance penalty (1.2), serta ikut membentuk Target Dasar Tim seorang manager (6.A). **Tier badge Achievement (Bagian 5.A: Capai target Bonus/Capai target/SP1) TIDAK ikut berubah** — tetap memakai angka tetap 15/12/3 berapa pun target aktivitas seorang Account Manager diatur.
>
> **Tidak ada baris `status_period` = belum terdaftar pada periode itu**: sama seperti aturan 6.E untuk anggota tim manager, sales yang belum pernah di-crawl untuk periode tersebut (mis. periode di masa depan, atau sebelum sales itu bergabung) **tidak muncul** di halaman *Summary > Target* dan **tidak bisa** diatur targetnya sampai `employee:crawl` membuat baris `status_period` untuk periode itu.

## Aturan dan Perhitungan Komisi Sales & Manager

### 1. Dasar Pengenaan Komisi & Penalti (Base Commission)

- **Commission Basis**: Jika tipe referral pelanggan adalah `Cashback` atau `Monthly`, dasar pengenaan komisi adalah `Subscription - Referral Fee`. Selain dari tipe itu, dasar komisi dihitung full dari `Subcription`.
- **Penalti Persentase (Percentage Deductions)**: Dasar Komisi dikurangi oleh penalti berikut sebelum dikalikan rate komisi:
  1. **Late Payment Penalty (Keterlambatan Pelunasan)**:
     - Berlaku untuk **semua jenis invoice** (New, Recurring, Upgrade, Prorate, dll).
     - Potongan **10% per bulan** keterlambatan (`late_month`), maksimal **50%**.
     - **Pengecualian**: Penalti ini **TIDAK BERLAKU** jika invoice ditandai sebagai disetujui (`is_approved == true`) di database.
  2. **Performance Penalty (Gagal Target Aktivitas)**:
     - Berlaku khusus untuk pegawai berstatus **Permanent** pada layanan tipe **New** (Pemasangan Baru).
     - Jika New Achievement < Target Aktivitas Sales tersebut (default **12**, bisa diatur admin per periode), maka dikenakan penalti sebesar **70%** (Sales hanya mendapatkan komisi dari 30% Dasar Komisi).
     - **Pengecualian**: Produk tipe **Prorate**, **Upgrade**, dan **Recurring** dibebaskan dari penalti performa ini (langsung mengambil Dasar Komisi tanpa potongan 70%).
- **Base Commission (Dasar Komisi Akhir)**: Dihitung dengan rumus:
  `Base Commission = Commission Basis * (1 - Total Persentase Penalti)`.

### 2. Aturan Komisi Sales

> Bagian ini berlaku untuk **Sales**. Komisi Manager Area dihitung dengan skema terpisah — lihat Bagian 6.

**A. Recurring — berlaku untuk SEMUA kategori**

Rate recurring **tidak dibedakan per kategori layanan**: berlaku sama untuk Home, FO, FO Prepaid, Wireless, Starlink, CPE Rental, Cicilan, dan lainnya.

- **1.5%**: Sales berstatus **Probation**, ATAU Sales **Permanent** yang **capai target** (New Achievement >= Target Aktivitas sales tersebut, default 12).
- **0.5%**: Sales berstatus **Permanent** yang **gagal target** (< Target Aktivitas sales tersebut).
- Bebas dari penalti performa 70%.

**Dua pengecualian:**

1. **Digital Business** — memakai rate sendiri **1% / 0.5%** berdasarkan Internal/Resell, dan **tidak** bergantung target (lihat Bagian 2.D).
2. **NusaSelecta** (`NFSP030`, `NFSP100`, `NFSP200`) — invoice recurring-nya **TIDAK dihitung sama sekali**, difilter langsung di query (`getSnapshotBySales`). Paket ini hanya menerima komisi New/Upgrade/Prorate.

**B. Kategori Layanan "Home" — New, Upgrade & Prorate**

- **Prorate (Prorata)**: Komisi flat **10%** dari Base Commission.
- **Upgrade**: Komisi berdasarkan rate `Service ID` dan durasi kontrak. Bebas dari penalti performa 70%.
- **New (Pemasangan Baru)**: Persentase komisi ditentukan dari `Service ID` dan lama masa kontrak (`months`). Dikenakan penalti performa 70% jika Sales Permanent gagal target.

**Tabel Rate Komisi (New & Upgrade):**

- **Nusafiber (BFLITE)**: 1 bln (28.38%), 6 bln (6.55%), 12 bln (5.09%)
- **NusaFiber (NFSP030, NFSP100)**: < 6 bln (20.00%), 6 bln (5.56%), 12 bln (4.44%)
- **NusaFiber (NFSP200)**: < 6 bln (26.00%), 6 bln (6.00%), 12 bln (4.67%)
- **Home100, HomeSTD100**: 1 bln (28.57%), 6 bln (5.95%), 12 bln (4.76%)
- **HomeADV200, HomeADV**: 1 bln (27.78%), 6 bln (5.56%), 12 bln (4.63%)
- **HomePrem300, HOME300**: 1 bln (31.25%), 6 bln (6.25%), 12 bln (5.21%)
- **LITE100**: 1 bln (28%), 6 bln (5.95%), 12 bln (4.76%)
- **LITE200**: 1 bln (27%), 6 bln (5.56%), 12 bln (4.63%)

> **⚠️ Beberapa produk punya dua ServiceId alias** dengan `ServiceType` identik di billing. **Keduanya wajib ada** di tabel rate, kalau tidak penjualan atas alias yang terlewat diam-diam dapat komisi 0%:
>
> - Standard 100 Mbps: `HOME100` / `HOMESTD100`
> - Advanced 200 Mbps: `HOMEADV` / `HOMEADV200`
> - Premium 300 Mbps: `HOMEPREM300` / `HOME300`

> **⚠️ Batas tier durasi kontrak (`months`) berbeda antar service** — lihat `getCommissionRates()` di `commission.helper.ts`:
>
> - **NusaSelecta (`NFSP030/100/200`)**: rate 6-bulan baru dipakai bila `months >= 6`. Kontrak 2–5 bulan tetap pakai rate **1 bulan** (kolom `< 6 bln`).
> - **Service lain (BFLITE, HOME\*, LITE\*)**: rate 6-bulan dipakai bila `months > 1`. Artinya kontrak **2–11 bulan** langsung memakai rate **6 bulan**; rate "1 bln" hanya berlaku untuk kontrak tepat 1 bulan.
> - Rate 12-bulan dipakai bila `months >= 12` untuk semua service.
>
> **⚠️ Service tanpa entri rate → tidak dihitung sama sekali untuk New/Upgrade**: Query crawl juga menarik service `CBSHM, HOME30, HOME50, BOOSTER100, BOOSTER200, BOOSTER300` yang **belum punya rate**. Baris `new`/`upgrade` dari service ini **dibuang sepenuhnya** sebelum dihitung — tidak menghasilkan komisi **dan tidak menambah New Achievement**, supaya tidak dapat "kredit target gratis" dari produk yang komisinya 0%. Prorate (10%), recurring, dan setup/alat tetap jalan seperti biasa untuk service ini — pembatasan hanya berlaku untuk New/Upgrade. Hanya service yang tercantum di tabel rate di atas yang dihitung untuk New/Upgrade — jadi kalau ada penjualan service di daftar ini, rate-nya perlu ditambahkan dulu.

**C. Kategori Layanan Lainnya ("Setup" & "Alat")**

- **Setup**: Komisi flat **5%**.
- **Alat**:
  - Jika pembelian alat dibundel bersamaan dengan Setup pemasangan pelanggan: komisi **2%**.
  - Jika pembelian alat tersendiri (standalone): komisi **1%**.

**D. Kategori Layanan "Digital Business"**

- **Recurring (Langganan Berulang)**: Persentase komisi ditentukan oleh **jenis operasional layanan** (`business_operation`), bukan oleh pencapaian target:
  - **1%**: layanan **Internal** (dioperasikan sendiri oleh Nusanet).
  - **0.5%**: layanan **Resell** (hasil resell dari pihak ketiga).
- **⚠️ Tidak bergantung target**: rate di atas berlaku **tetap**, terlepas dari New Achievement sales sudah capai target (>= 12) atau belum, dan terlepas dari status kepegawaian (Permanent/Probation). Ini **berbeda** dari recurring kategori lain (Bagian 2.A) yang rate-nya 1.5% / 0.5% tergantung target.
- **Sumber data**: kolom `business_operation` pada tabel `snapshots`, diisi saat crawl dari `Services.BusinessOperation` di database billing, dan **hanya** untuk baris berkategori `Digital Business`. Untuk job berbasis sheet, nilainya di-lookup dari katalog `Services` berdasarkan `Nama Service` (sheet tidak punya kolom ini).
- **⚠️ Baris tanpa klasifikasi tidak diambil**: jika `Services.BusinessOperation` bukan `internal`/`resell` (mis. `undefined`, `access`, `setup`, `other`), baris Digital Business tersebut **tidak dimasukkan ke `snapshots`** sama sekali — karena tidak ada rate yang bisa dipakai. Kalau ada layanan yang seharusnya dapat komisi tapi hilang, perbaiki `BusinessOperation`-nya di billing lalu jalankan ulang crawl.

_Total Pembayaran Komisi Sales (per item) = `Base Commission` x `Persentase Komisi` / 100._

---

### 3. Perhitungan New Achievement

Pencapaian "New Achievement" didasarkan khusus pada produk tipe baru (New) setelah dikurangi **Churn**.

- **Layanan standar** (selain NusaSelecta): 1 Pelanggan Baru = 1 New Achievement.
- **Layanan NusaSelecta** (`NFSP030`/Basic 30, `NFSP100`/Prime 100, `NFSP200`/Ultra 200) — dihitung dengan aturan pengelompokan berikut (lihat `calculateNusaSelectaActivity` di `commission.helper.ts`):
  1. Setiap **3 unit** Basic 30 (`NFSP030`) dan/atau Prime 100 (`NFSP100`) = **1 Achievement** (berlaku kelipatan).
  2. Setiap **2 unit** Ultra 200 (`NFSP200`) = **1 Achievement** (berlaku kelipatan).
  3. **Kombinasi sisa**: apabila tersisa **2 unit** Basic/Prime **dan** **1 unit** Ultra 200, kombinasi ketiga unit tersebut = **1 Achievement**.
  4. Sisa unit yang **tidak** memenuhi ketentuan di atas **tidak** dihitung ke target bulanan — komisinya tetap dibayar, tapi tidak menambah New Achievement.

  > **Contoh:** 5 Basic + 3 Ultra → `floor(5/3)=1` + `floor(3/2)=1` = 2, lalu sisa `2 Basic + 1 Ultra` → +1 = **3 Achievement**. (Aturan lama: Basic/Prime per 2, Ultra 200 dihitung 1:1 — kini sudah tidak berlaku.)

- **Deduction (Churn)**:
  - Setiap pelanggan yang berhenti berlangganan (Churn) dan tidak disetujui pembatalannya akan **mengurangi** unit pada bucket yang sesuai (Basic/Prime, Ultra, atau standar) **sebelum** pengelompokan dihitung.
- **New Achievement (Net)**: dihitung dari unit **net** (setelah churn). Hasil inilah yang menentukan Achievement Goal dan Rate Recurring.

> **Catatan implementasi:** Angka **NET** (setelah churn) dipakai untuk `activityCount` (penentu target), sedangkan angka **GROSS** dipakai untuk kolom `count` tampilan tabel — keduanya memakai rumus pengelompokan yang sama. Untuk NusaSelecta, `count` di tabel = jumlah **Achievement**, bukan jumlah unit.

---

### 4. Churn & Deductions

Setiap record Churn yang masuk (dan bukan `is_approved`) akan mengurangi total pendapatan sales pada periode tersebut:

- **Count**: Mengurangi New Achievement (mempengaruhi target).
- **MRC**: Mengurangi total MRC bulanan.
- **Commission**: Mengurangi total komisi (Dihitung setara rate 'New' pada target 12).
- **Subscription**: Mengurangi total volume penjualan.

**⚠️ Syarat eligibilitas Churn** (difilter di query `getChurnbyDateRange`, `is.service.ts`) — tidak semua pelanggan berhenti dihitung sebagai churn. Sebuah record baru dianggap churn bila memenuhi **semua** syarat berikut:

1. Status pelanggan `CustStatus = 'NA'` (non-aktif).
2. Tanggal berhenti (`CustUnregDate`) berada dalam **periode berjalan**.
3. **Berhenti ≤ 1 tahun sejak registrasi** (`CustUnregDate <= CustRegDate + 1 tahun`). Pelanggan yang berhenti setelah > 1 tahun **tidak** dihitung sebagai churn.
4. Pelanggan **pernah memiliki minimal 1 invoice** (`HAVING TotalInvoice > 0`).
5. Berada dalam cakupan cabang yang valid (lihat _Cakupan Data_ di bawah).

**Perhitungan nominal churn per record:**

- `price = (Subscription − Discount) / periode(bulan)`, minimal periode 1.
- `MRC churn = price / periode`.
- `Commission churn` dihitung memakai `calculateCommission` dengan asumsi kategori `home`, tipe `new`, dan `activityCount` disamakan dengan Target Aktivitas sales tersebut (dianggap capai target, tanpa penalti performa & tanpa late penalty).

---

### 5. Level Prestasi (Achievement) & Skema Bonus Kelebihan Service Sales

**A. Status Pegawai Permanent**

- `>= 15 aktivitas` : **Capai target Bonus** _("Congratulations on your outstanding achievement!")_
- `12 - 14 aktivitas` : **Capai target** _("Bravo! Keep up the great work!")_
- `3 - 11 aktivitas` : **Tidak Capai target** _("Just a little more fights, go on!")_
- `< 3 aktivitas` : **SP1** _("Keep fighting and don't give up!")_

**B. Status Pegawai Probation / Contract**

- `>= 8 aktivitas` : **Excellent**
- `5 - 7 aktivitas` : **Very Good**
- `3 - 4 aktivitas` : **Average**
- `< 3 aktivitas` : **Below Average**

**C. Skema Bonus Kelebihan Service (Dibayarkan dari total New Achievement bulanan)**

> **⚠️ Tier Bonus Kelebihan Service mengikuti Target Aktivitas sales tersebut** (bukan angka tetap seperti badge Achievement di atas). Basisnya target default **12**: tier bergeser sebesar selisih target sales itu terhadap 12. Contoh: target diatur ke 13 (selisih +1) → tier pertama naik dari 15 jadi 16. Target diatur ke 11 (selisih -1) → tier pertama turun jadi 14. Implementasi: `calculateBonus(activityCount, target)` di `commission.helper.ts`.

- `New Achievement > (20 + selisih)` : **Rp 1.500.000** + _(Setiap kelipatan di atas `20 + selisih` dinilai ekstra Rp 150.000)_
- `New Achievement = (20 + selisih)` : **Rp 1.500.000**
- `New Achievement (17 + selisih) s.d. (19 + selisih)` : **Rp 1.000.000**
- `New Achievement (15 + selisih) s.d. (16 + selisih)` : **Rp 500.000**
- Selain itu : Tidak ada Bonus Kelebihan Service.
- Untuk sales dengan target default (12), selisih = 0, jadi tier tetap 15/17/20 seperti sebelumnya.
- **Berlaku untuk semua status kepegawaian, termasuk Probation** — skema ini tidak digerbang status, semua tetap bisa dapat Bonus Kelebihan Service.
- **Pergeseran tier (selisih) hanya berlaku untuk status Permanent.** Untuk Probation/Contract, tier **selalu tetap 15/17/20 (flat)** berapapun target yang diatur untuk mereka — target pada status non-Permanent hanya dipakai untuk menggerbang rate recurring & performance penalty (Permanent-only, lihat 2.A & 1.2), bukan untuk menggeser tier bonus.

**D. Bonus Konsistensi (Diberikan manual oleh admin, di luar New Achievement)**

- Nominal **tetap Rp 1.000.000** per pemberian — tidak bisa diisi bebas.
- Diberikan **per periode (bulan)**: admin memilih sales, menulis catatan (note wajib), jumlah service (wajib, diisi manual), bulan-bulan pencapaian & link testimoni (opsional, sekadar catatan pendukung), lalu memberikan lewat halaman admin *Summary > Bonus Konsistensi*. Untuk bulan berikutnya harus diberikan ulang kalau masih mau lanjut — tidak otomatis berulang.
- **Terpisah dari Bonus Kelebihan Service** (Bagian 5.C) — keduanya sama-sama ditambahkan ke Total Komisi, tapi dihitung dan ditampilkan sebagai dua angka berbeda (`bonus` vs `consistencyBonus`).
- `Total Komisi = Base Commission Total + Bonus Kelebihan Service + Bonus Konsistensi` (ditambah komisi overriding untuk Manager, lihat Bagian 6.C/6.D).
- Implementasi: tabel `consistency_bonus` (employee_id + period, unique), `ConsistencyBonusService` di `commission.service.ts`.

---

### 6. Komisi & Performa Manager Area

**A. Target & Capaian Tim**

- **Jumlah AM** = total seluruh anggota tim di bawah binaan manager, **termasuk yang Probation**. Angka ini hanya dipakai untuk menentukan Threshold di Bagian 6.B.
- **Target Dasar Tim** = jumlah Target Aktivitas masing-masing anggota **Permanent** di tim tersebut (default 12/orang, bisa diatur admin per sales per periode — lihat catatan di awal dokumen). Pegawai **Probation tidak menambah** target dasar.
- **Target Akhir Manager** = `Target Dasar Tim x Threshold%`, **dibulatkan** ke bilangan bulat terdekat.
- **Status Capai Target** = `Total New Achievement seluruh anggota tim >= Target Akhir Manager`. Status inilah yang dipakai untuk rate recurring (Bagian 6.D) dan komisi penjualan pribadi manager (Bagian 6.F).
- **Persentase Capaian** = `(Total New Achievement Tim / Target Dasar Tim) x 100%`. Angka ini dipakai untuk tier komisi New di Bagian 6.C — perhatikan pembaginya adalah **Target Dasar**, bukan Target Akhir.
- Jika tidak ada pegawai Permanent satupun dalam tim: Target dianggap 100% (kalau ada tim probation) atau 0% (kalau tim kosong).

**B. Ambang Batas Target (Target Threshold)**

Semakin besar tim, semakin ringan persentase targetnya. Threshold dipilih berdasarkan **Jumlah AM** (termasuk probation):

| Jumlah AM | Target |
| --------- | ------ |
| 1         | 120%   |
| 2         | 115%   |
| 3         | 110%   |
| 4         | 105%   |
| 5         | 100%   |
| 6         | 95%    |
| 7         | 92%    |
| 8         | 90%    |
| 9         | 88%    |
| >= 10     | 85%    |

> **Contoh perhitungan:** Tim berisi **9 Permanent + 1 Probation**, semua 9 Permanent memakai target default 12.
>
> 1. Jumlah AM = **10** → Threshold = **85%** (dari tabel).
> 2. Target Dasar = `9 x 12` = **108** (probation tidak ikut dihitung; kalau salah satu member punya target custom, Target Dasar = jumlah target masing-masing, bukan lagi perkalian rata).
> 3. Target Akhir = `108 x 85%` = `91.8` → dibulatkan menjadi **92**.
>
> Manager harus mengumpulkan **92 New Achievement** dari total timnya untuk dinyatakan **Capai Target**.

**C. Komisi New (Akuisisi Pelanggan Baru dari Tim)**
Manager mengambil komisi overriding yang diproses dari total "New Commission" uang pegawainya sebulan, dipotong berdasarkan capaian target:

- Jika Capaian `>= 150%` = Manager dikalikan **60%** dari kue New Commission.
- Jika Capaian `>= 125%` = Manager dikalikan **50%**.
- Jika Capaian `>= 100%` = Manager dikalikan **40%**.
- Jika Capaian `>= 50%` = Manager dikalikan **25%**.
- Jika Capaian `< 50%` = Manager mendapatkan **0%** bagian dari produk New.

**D. Komisi Recurring (Pemasukan Berulang dari Tim)**
Dihitung flat bulanan sebagai overriding insentif pendapatan pasif:

- Apabila Manager berstatus **Capai Target**, Rate Recurring Manager adalah **0.90%** dari total uang _Recurring Subscription_ timnya.
- Apabila Manager berstatus **Tidak Capai Target**, Rate Recurring diturunkan menjadi **0.50%** dari total pengumpulan langganan anggota timnya.

**⚠️ Invoice tanpa sales (`Customer Relation Officer`)**

Invoice yang kolom `sales`-nya berisi `Customer Relation Officer` **tetap dihitung** ke komisi recurring manager, selama kolom `manager` invoice tersebut menunjuk ke manager yang bersangkutan.

- `Customer Relation Officer` adalah **placeholder**, bukan pegawai — dipakai saat nama sales di sumber data tidak cocok dengan pegawai manapun (lihat `resolveSales`). Invoice ini karenanya **tidak menghasilkan komisi sales pribadi**, tapi **tetap masuk** ke total _Recurring Subscription_ tim manager.
- Pencocokannya lewat kolom `manager` pada invoice, **bukan** lewat hierarki tim (`getHierarchy`) — karena placeholder ini tidak akan pernah muncul sebagai anggota tim.
- **⚠️ Prasyarat data**: pencocokan hanya berhasil bila kolom `manager` berisi **employee ID**. Bila berisi nama mentah (karena nama manager di sumber data tidak cocok dengan pegawai manapun), invoice tersebut **tidak akan terhitung** ke manager siapa pun. Pastikan `employee:crawl` sudah lengkap sebelum periode dihitung.

**E. Cakupan Anggota Tim yang Dihitung**

- **⚠️ Anggota tanpa `status_period` dilewati**: Dalam perhitungan manager, anggota tim yang **belum memiliki catatan status** (Permanent/Probation) untuk periode tersebut akan **dilewati sepenuhnya** (`if (!status) continue;`) — tidak masuk hitungan target tim, tidak masuk komisi tim, dan tidak muncul di rincian. Pastikan `employee.crawl` sudah dijalankan agar `status_period` tiap anggota terisi sebelum periode dihitung.
- **Cakupan tim**: hierarki tim ditarik rekursif (`getHierarchy`) dan hanya mencakup pegawai dengan `has_dashboard = true`.

**F. Komisi Penjualan Pribadi Manager**

Manager Area juga bisa memiliki data penjualan atas namanya sendiri (invoice dengan `sales_id` = employee ID manager), sama seperti sales biasa. Komisi ini **berdiri sendiri** di luar komisi overriding tim.

- **Rate & perhitungan**: memakai aturan yang sama persis dengan Sales (Bagian 2) — tabel rate New/Upgrade, prorate 10%, recurring, setup/alat, termasuk penalti keterlambatan pembayaran.
- **⚠️ Penentu "capai target" berbeda**: status capai / tidak capai target untuk komisi pribadi manager **diambil dari capaian target Manager** (Bagian 6.A & 6.B — persentase capaian tim terhadap ambang batas dinamis sesuai jumlah bawahan), **bukan** dari aturan sales individual `New Achievement >= 12`. Status ini menentukan:
  - **Rate recurring**: 1.5% bila capai target, 0.5% bila tidak (untuk pegawai Permanent).
  - **Penalti performa 70%** pada tipe New.
- **Tidak ada sirkularitas**: penjualan pribadi manager **tidak** ikut dihitung sebagai aktivitas tim. Perhitungan tim memakai `getHierarchy(..., isSelf = false)` yang menarik mulai dari bawahan langsung, sehingga manager sendiri **tidak** termasuk anggota tim yang dijumlahkan pada Bagian 6.A.

_Total Komisi Manager akhir bulan = `Komisi Penjualan Pribadi` (F) + `Overriding Komisi New` (C) + `Overriding Komisi Recurring` (D)._
_Semua perhitungan Manager menggunakan angka **NET** (setelah dikurangi churn dan penalti masing-masing anggota tim)._

---

### Hierarki Pegawai (Employee Crawl)

Proses ini berjalan pada (`src/crawl/employee.crawl.ts`) dan menunjang keabsahan _target komisi dan besaran tier persentase_:

- **Sinkronisasi Endpoint Eksternal**: Sistem memanggil API dari layanan SDM (Nusawork) untuk mengambil data terbaru dari Pegawai level _Sales_ maupun level pendukung _Admin_.
- **Catatan Historis Kontrak Pegawai**: Seluruh pegawai akan di-insert, dan untuk Sales diberikan log _Status Period (Permanent, Probation, Contract, dll)_ atas periode berjalan tersebut. Hal ini guna memastikan jika ada karyawan kontrak yang promosi (menjadi permanen) di bulan depan, perhitungan komisi di masa periode komisi ini tidak berubah dan tetap mengacu pada _status kontrak saat periode berjalan tersebut_.
