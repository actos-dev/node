# Yapılacaklar — Node SDK

> Durum özeti: Faz 0–12, 14–16 ve Faz 13.A tamamlanmış ve kodda doğrulanmıştır.
> Geriye kalan tek gerçek iş, backend Faz 18.A'nın eklediği `/me/inbox*` uçları
> ve dört küçük şema alanı (`avatar`, `actor_type`, `body_html`, ve otomatik
> gelecek `avatar_url`/`trust_level`) için SDK tarafını yazmak. `verifications.*`
> bu kapsamın dışında — plandan düşülmesi gerekiyor (bkz. §3). Kod hiçbir yerde
> değiştirilmedi; bu dosya salt doğrulama sonucudur.
> Son kontrol: 2026-09-03, backend Faz 18.A sonrası
> (`actos-backend/docs/openapi.json`: 45 yol; `node/openapi.json`: 42 yol, eski).

---

## 1. Backend Faz 18.A'dan doğan eksikler

Doğrulama yöntemi: `node/openapi.json` (42 yol) ile
`actos-backend/docs/openapi.json` (45 yol) `python3 -c "json diff"` ile
karşılaştırıldı. Fark tamamen ekleyici, hiçbir yol/şema kaldırılmamış,
hiçbir `ErrorCode` eklenmemiş (`ErrorCode` enum'u iki tarafta birebir aynı,
12 değer) — yani hata hiyerarşisinde (`src/errors.ts`) değişiklik gerekmiyor.

### 1.1. `node/openapi.json` güncel değil (kaynak dosya)

- **Dosya:** `node/openapi.json` (196 KB, 42 yol)
- **Ne yapılacak:** `actos-backend/docs/openapi.json` (45 yol) ile değiştir.
- **Neden:** `scripts/generate-types.ts` kaynak öncelik sırası şu: `--source` >
  `ACTOS_OPENAPI_SOURCE` > canlı `127.0.0.1:3100` > yerel `openapi.json`. CI
  (`.github/workflows/ci.yml:29`, `generate:types:check -- --source
  ./openapi.json`) doğrudan bu yerel dosyaya karşı kontrol ediyor — dosya
  güncellenmeden `schema.d.ts`'teki eksiklik **CI'da hiç görünmez** (iki taraf
  da aynı eski haliyle tutarlı kaldığı için yeşil kalır). Doğrulandı:
  `npx tsx scripts/generate-types.ts --check --source ./openapi.json` →
  "up-to-date"; aynı komut `--source
  .../actos-backend/docs/openapi.json` ile → "out of date".

### 1.2. `src/generated/schema.d.ts` yeniden üretilmeli

- **Dosya:** `src/generated/schema.d.ts`
- **Ne yapılacak:** 1.1 sonrası `npm run generate:types` (repoda **çalıştırmadım**,
  görev talimatı gereği).
- **Tuzak yok gibi görünüyor:** `types.ts`'teki `Actor`, `Post`, `Comment`,
  `CommentNode` takma adları `CamelCase<Schema["ActorSummary"|"ContentSummary"|
  "CommentNodeResponse"]>` şeklinde **jenerik** tanımlı (`src/types.ts:35,40,41,43`)
  — yani `avatarUrl`, `trustLevel`, `bodyHtml` alanları şema yeniden
  üretilir üretilmez otomatik olarak bu tiplere düşer, elle alan eklemeye
  gerek yok. Doğrulandı: `ActorSummary` yeni alanları `avatar_url`,
  `trust_level`; `ContentSummary` yeni alanı `body_html` (backend spec'inde,
  `python3` şema diff'i ile karşılaştırıldı).

### 1.3. `inbox` kaynağı hiç yok — sıfırdan yazılmalı

- **Dosya (yok, oluşturulacak):** `src/resources/inbox.ts`
- **Bağlanacağı yer:** `src/client.ts:35-64` — `readonly inbox: InboxResource;`
  alanı ve constructor'da `this.inbox = new InboxResource(this.transport);`
  satırı yok, eklenmeli (diğer 13 kaynağın yanına).
- **Kapsayacağı 3 uç** (backend spec'inde doğrulandı, `actos-backend/docs/openapi.json`):
  - `GET /me/inbox` — parametreler: `unread?: boolean`, `cursor?: string`,
    `limit?: string`. Yanıt `InboxResponse { notifications: NotificationSummary[],
    next_cursor, unread_count }`.
  - `POST /me/inbox/read` — parametre: `cursor?: string` (verilmezse tümü
    okunur). Yanıt `MarkAllReadResponse { marked: number }`. **Idempotent**
    (spec açıkça söylüyor: zaten okunmuş olanlar `marked`'a sayılmaz).
  - `PATCH /me/inbox/{id}/read` — 204 döner, idempotent (tekrar çağrı
    `read_at`'i ileri götürmez, yine 204). Başka actor'ün bildirimi → 404
    (var olduğu bilgisi sızmaz) — bu zaten `NotFoundError`'a otomatik düşer,
    yeni hata sınıfı gerekmiyor.
- **PLAN.md'de karşılığı:** §3 satır 226-229, Faz 13.B satır 453-458
  (`inbox.list/iterate/read/readAll/unreadCount`, `readAll` idempotentliği,
  silinmiş hedefte `GoneError` davranışı, `inbox.watch({ interval })`).
- **`unreadCount()` için ayrı uç yok:** `InboxResponse.unread_count` alanından
  türetilecek istemci-taraflı bir kolaylık metodu (muhtemelen `list({limit:1})`
  ya da benzeri bir tek-sayfa çağrısından `unread_count`'u döndürmek) —
  backend'de `/me/inbox/unread-count` gibi ayrı bir uç **yok**, doğrulandı
  (spec'te sadece 3 `/me/inbox*` yolu var).
- **`inbox.watch({ interval })`:** backend'de push/webhook yok
  (`node/NOTES.md` bunu doğrudan yazmıyor ama `PLAN.md:506` "yoklama
  yardımcısı" olduğunu açıkça belirtiyor) — istemci taraflı bir polling
  sarmalayıcısı, `AsyncIterable`, `Retry-After`/rate-limit header'larına
  uyacak ve `AbortSignal` ile durdurulabilecek. Yeni bir backend ucu
  gerektirmiyor, sadece `inbox.list({ unread: true })`'u periyodik çağıran
  bir sarmalayıcı.
- **Tipler (`src/types.ts`) eklenmeli:** `NotificationSummary`/`InboxResponse`/
  `MarkAllReadResponse` şema yeniden üretildikten sonra `Schema[...]` altında
  görünecek; `types.ts`'e bunların `CamelCase<...>` takma adları ve
  `ListInboxParams` gibi parametre arayüzleri eklenmeli (mevcut `ListActorsParams`,
  `ListCommentsParams` deseniyle tutarlı, bkz. `src/types.ts:120-123,179-185`).

### 1.4. `feed.list` / `feed.following` — `actorType` parametresi eksik

- **Dosya:** `src/types.ts:309-319` (`FeedParams`, `FeedFollowingParams` —
  ikisinde de `actorType` yok) ve `src/resources/feed.ts:20-45,64-90`
  (`list()`/`following()` içindeki `query` nesnesi elle `sort/window/cursor/
  limit/fields` alanlarını sayıyor, `actorType` eklenmedikçe geçmeyecek).
- **Doğrulama:** Backend spec'te `GET /feed` ve `GET /feed/following` artık
  `actor_type` parametresi kabul ediyor (`python3` parametre diff'i ile
  doğrulandı: `new params: {'actor_type'}`, `fields`/`sort`/`window`/`cursor`/
  `limit` değişmedi).
- **Not:** `src/resources/feed.ts:14-16`'daki JSDoc yorumu şu anda açıkça
  "No `actorType` filtering is supported on this endpoint" diyor — bu satır
  da güncellenmeli, yoksa yanlış bilgi kalır.
- **Tuzak yok:** query key dönüşümü zaten transport katmanında jenerik
  (`stringCamelToSnake`, `src/transport.ts:154`), sadece `feed.ts`'teki elle
  yazılmış query nesnesine `actorType: params?.actorType` satırı eklemek
  yeterli — transport otomatik `actor_type`'a çevirir.

### 1.5. `actors.updateMe` — `avatar` parametresi eksik

- **Dosya:** `src/types.ts:108-111` (`UpdateProfileInput` yalnızca
  `displayName`, `bio` içeriyor).
- **Doğrulama:** Backend `UpdateProfileRequest` şemasında `avatar: string |
  null` eklenmiş — yükleme id'si (`f_...`, `POST /uploads`'un döndürdüğü
  id), `displayName`/`bio` ile aynı "gönderilmezse dokunma / `null`'sa
  temizle / değer varsa güncelle" (`Option<Option<T>>`) deseninde.
- **`src/resources/actors.ts:85-91` (`updateMe`) kod değişikliği
  gerektirmiyor:** `body: input` olarak tüm nesneyi geçiyor, transport body
  dönüşümünü jenerik yapıyor — sadece tipe `avatar?: string | null` eklemek
  yeterli.
- **Hata davranışı için not (kod değişikliği gerekmez, JSDoc'a eklenebilir):**
  Backend geçersiz/başkasına ait/zaten başka içeriğe bağlı bir upload id
  verilirse sırasıyla 404/403/409 döner — üçü de mevcut hata sınıflarına
  (`NotFoundError`/`ForbiddenError`/`ConflictError`) zaten düşüyor, yeni
  sınıf gerekmiyor.

### 1.6. `comments.list`/`iterate` — `bodyHtml` bayrağı eksik

- **Dosya:** `src/types.ts:179-185` (`ListCommentsParams`).
- **Doğrulama:** Backend `GET /posts/{id}/comments` üzerinde yeni `body_html:
  boolean` query parametresi var. **`?fields=` değil** — endpoint zaten
  `fields`'i desteklemiyor (ağaç yapısını bozacağı için, `node/NOTES.md`
  §4'te de doğrulanmış), bu yüzden `body_html` ayrı bir tek-amaçlı bayrak
  olarak eklenmiş (spec açıklamasında böyle gerekçelendirilmiş).
- **`src/resources/comments.ts` kod değişikliği gerektirmiyor:** hem
  `list()` (satır 51-58) hem `iterate()` (satır 66-79) parametre nesnesini
  doğrudan `query: params as Record<string, unknown>` şeklinde geçiyor —
  transport katmanı `bodyHtml` anahtarını otomatik `body_html`'e çevirecek.
  Sadece `ListCommentsParams` tipine `bodyHtml?: boolean` eklemek yeterli.

### 1.7. Sözleşme/birim testleri güncellenmeli (yeni kod yazıldıkça)

- **Dosya:** `test/contract/contract.test.ts:23-42` (§2.1 testi) — yeni
  `client.inbox` özelliği eklenince `expect(client.inbox).toBeDefined();`
  satırı da eklenmeli, yoksa test kaynak listesini tam kapsamaz.
- Yeni `test/unit/inbox.test.ts` yazılmalı (diğer 14 kaynağın hepsinde
  `test/unit/<kaynak>.test.ts` deseni var, `inbox.ts` için yok — çünkü kaynak
  henüz yok).
- `test/contract/e2e.test.ts` senaryosuna inbox akışı (bildirim üret → listele
  → okundu işaretle → `unread_count` düşüşünü doğrula) eklenmesi PLAN §14'ün
  "uçtan uca senaryo" ruhuyla tutarlı olur, ama PLAN'da açıkça zorunlu
  tutulmamış — öneri, zorunluluk değil.

---

## 2. Planda `[x]` ama kodda eksik/eskimiş

Doğrulama: PLAN.md'de işaretli tüm fazlar (0-12, 13.A, 14-16) tek tek kodda
karşılığı arandı — `src/`, `test/`, `examples/`, `README.md`. **Hiçbir
`[x]` madde için kodda eksik/eskimiş bir şey bulunamadı.** Özellikle:

- Faz 2'nin camelCase↔snake_case dönüşümü ve `metadata` istisnası kodda
  duruyor ve test ediliyor (`test/unit/case.test.ts`, `src/utils/case.ts`).
- Faz 3'ün 12 hata kodu → sınıf eşlemesi `src/errors.ts`'te tam; backend'in
  güncel `ErrorCode` enum'u ile birebir aynı (12/12, yeni kod yok).
- Faz 14'ün 16 maddelik SDK sözleşmesi (`test/contract/contract.test.ts`)
  §2.1'den §2.16'ya kadar tek tek test ediliyor, hiçbiri `.skip`/`.todo`
  değil (repo genelinde `grep -rn ".skip\|.todo"` test/ boş döndü).
- Faz 16 paketleme adımları (`npm pack`, dual export, vs.) bu görevde
  yeniden çalıştırılmadı (kod yazma/çalıştırma yasağı gereği build
  komutları hariç tutuldu) — ama bu fazın kendisi kod değişikliği
  gerektirmiyor, spec değişikliğinden etkilenmiyor.

Tek gri alan: Faz 13.A satırı "Commit (13.A) — Faz 14 commit'ine (a381a71)
dahil edildi" diyor; bu commit'in gerçekten var olup olmadığını
doğrulamadım (repo bir git deposu değil gibi görünüyor içeriden — `.git`
dizini var ama commit geçmişini bu görev kapsamında incelemedim, konu
kod/test doğrulaması değil sadece commit kaydı olduğu için önemsiz).

---

## 3. Plandan düşülmesi gerekenler (yapılmayacak)

### 3.1. `verifications.*` — PLAN.md'den kaldırılmalı, "yapılacak" değil

- **PLAN.md'deki yanıltıcı satırlar:** satır 65 (`inbox.*` ve
  `verifications.*` | Faz 13.B — "backend'i bekliyor" izlenimi veriyor),
  satır 231-233 (§3 API yüzeyinde `client.verifications.*` üç metot),
  satır 460 (Faz 13.B checklist: `verifications.create/check/list/delete`).
- **Neden yanlış:** Bu backend'de "henüz yapılmadı, 18.A'da gelecek" değil.
  `actos-backend/NOTES.md` §9.2 (satır 288-379) alan adı doğrulamasının
  **v1'e süresiz ertelendiğini** açıkça karara bağlıyor: "Karar: v1'e
  girmiyor" (satır 290). Gerekçe salt kapsam değil, güvenlik: §9.2.4
  (satır 344-368) HTTPS yöntemi seçilirse SSRF yüzeyi ve DNS rebinding
  TOCTOU riskini detaylandırıyor; §9.2.5 (satır 379-393) "henüz olmayan bir
  problemi çözüyor" ve "backend'in şu an hiç dışa giden isteği yok, bu
  özellik ağ erişimi + yeni bağımlılık ekliyor" diyerek reddediyor.
  Yeniden değerlendirme tetikleyicisi net: "biri kimlik taklidinden
  şikayet ettiğinde ya da bir kurum 'kimliğimi nasıl kanıtlarım' diye
  sorduğunda" — bugün değil.
- **Doğrulama:** `actos-backend/docs/openapi.json`'da `/me/verifications*`
  yollarının hiçbiri yok (45 yol listesinde sıfır eşleşme), `Check` adında
  bir şema var ama farklı bir amaca hizmet ediyor gibi görünüyor (görev
  kapsamında derinlemesine incelenmedi — verifications ile ilgisiz
  olduğu, ismin genel bir "kontrol" tipi olmasından anlaşılıyor).
- **Ne yapılmalı:** PLAN.md'nin ilgili üç yerinde `verifications.*` "Faz
  13.B — bloke" listesinden çıkarılıp ayrı bir not olarak "v1 kapsamı
  dışında, backend NOTES.md §9.2'ye bakınız, geri gelirse tekrar
  planlanır" şeklinde işaretlenmeli. **Bu satırların `[x]` yapılması
  YANLIŞ olur** — hiç yazılmayacaklar, "yapıldı" değiller. Doğru işlem
  satırları silmek/taşımak, çentiklemek değil.
- **Not:** Bu düzeltmeyi ben yapmadım (talimat gereği PLAN.md dahil
  hiçbir dosyaya dokunmadım) — yöneticinin bu turda PLAN.md'yi elle
  düzeltmesi gerekiyor.

---

## 4. Diğer teknik borç

### 4.1. Spec dili değişimi — otomatik yan etki, ayrı iş değil

Backend'in tüm yol-seviyesi `summary`/`description` metinleri artık
İngilizce (doğrulandı: `info.description` ve `/posts/{id}` gibi örnek
yolların `summary` alanı Türkçeden İngilizceye çevrilmiş). Bileşen
şemalarının (`components.schemas.*`) kendi `description` alanları büyük
ölçüde Türkçe kalmış (örn. `ActorStats`, `ProblemDetails` — spot-check
edildi, aynı kaldı). Bu, `schema.d.ts`'in JSDoc yorumlarını karışık dilde
bırakacak ama bu bir hata değil, kaynağın kendisi öyle — §1.2'deki
`generate:types` çalıştırıldığında otomatik yansıyacak, ayrı bir iş
maddesi açmaya gerek yok.

### 4.2. Yükleme kotası hatası — PLAN'daki madde zaten karşılanmış

Faz 13.B'nin son maddesi ("Yükleme kotası aşımı anlamlı hataya eşlenir",
PLAN.md:461) aslında **halihazırda karşılanmış durumda**, ayrı iş
gerektirmiyor: `POST /uploads` yanıt kodları backend'de değişmemiş
(`400/401/415/429`, eski ve yeni spec birebir aynı — doğrulandı), ve
415 (`UNSUPPORTED_MEDIA`, "type, size, or content validation" hatalarının
hepsini kapsıyor) zaten `UnsupportedMediaError` sınıfına eşli
(`src/errors.ts:248-256`). Bu satır PLAN'da işaretsiz duruyor ama kodda
tamamlanma anlamında ekstra çalışma gerektirmiyor — Faz 13.B commit'i
atılırken bu alt madde de `[x]` yapılabilir, ayrıca kod yazmaya gerek yok.

### 4.3. CI, yerel `openapi.json`'a karşı kontrol ediyor — sürüklenme sessiz kalabilir

`.github/workflows/ci.yml:29`, `generate:types:check`'i canlı backend'e değil
repodaki `openapi.json` kopyasına karşı çalıştırıyor. Bu, bu turun neden
sessizce yaşandığını açıklıyor: iki dosya (`openapi.json` ve `schema.d.ts`)
birbirleriyle tutarlı kaldığı sürece CI yeşil kalıyor, gerçek backend'den
sapma otomatik yakalanmıyor. Bu bir tasarım tercihi (canlı sunucuya CI'da
bağımlı olmamak) ve değiştirilmesi bu görevin kapsamı dışında — sadece
"neden fark edilmedi" sorusuna yanıt olarak not düşülüyor. Yöneticinin
bilmesi gereken tek şey: `openapi.json`'ı güncellemek CI'ı otomatik
kırmayacak, `schema.d.ts` de aynı anda güncellenmeli (§1.1 + §1.2 birlikte
yapılmalı).

---

## 5. Sıra önerisi

1. **`node/openapi.json`'ı değiştir** → `actos-backend/docs/openapi.json`
   ile (§1.1).
2. **`npm run generate:types`** çalıştır → `src/generated/schema.d.ts`
   yeniden üretilir; `Actor`/`Post`/`Comment`/`CommentNode` tipleri
   `avatarUrl`/`trustLevel`/`bodyHtml`'i otomatik alır (§1.2).
3. **`src/resources/inbox.ts`** yaz + `src/client.ts`'e bağla + `src/types.ts`'e
   `InboxResponse`/`NotificationSummary`/`MarkAllReadResponse` takma adları ve
   `ListInboxParams` ekle (§1.3). Bu en büyük parça.
4. **Üç küçük tip/parametre eklemesi** — `FeedParams.actorType`,
   `UpdateProfileInput.avatar`, `ListCommentsParams.bodyHtml` — ve
   `feed.ts`'teki tek satırlık query eşlemesi (§1.4, §1.5, §1.6). Bunlar
   birbirinden bağımsız, paralel/ayrı commit'ler olabilir.
5. **Testler**: `test/unit/inbox.test.ts` yeni yazılmalı;
   `test/contract/contract.test.ts:23`'e `client.inbox` satırı eklenmeli;
   mevcut `feed.test.ts`/`actors.test.ts`/`comments.test.ts`'e yeni
   parametreler için birim testleri eklenmeli.
6. **`PLAN.md` düzeltmesi** (yönetici tarafından): Faz 13.B'yi ikiye böl —
   inbox kısmı `[x]`'e taşınabilir hale gelecek, `verifications.*` ayrı bir
   "v1 kapsamı dışı" notuna dönüştürülüp checklist'ten çıkarılmalı (§3.1).
7. **README.md**'ye inbox örneği eklenmesi düşünülebilir (zorunlu değil,
   PLAN Faz 15 zaten `[x]` ve yeni uç eklemek README'yi otomatik
   güncellemiyor) — öneri, doğrulanmış bir eksik değil.

**Doğrulanamadı / kapsam dışı bırakıldı:**
- Faz 13.A'nın "a381a71" commit'ine gerçekten dahil olup olmadığı (git
  geçmişi bu görevde incelenmedi, sadece kod/test/spec doğrulaması
  yapıldı).
- Backend spec'teki `Check` şemasının verifications'la ilgisi olup
  olmadığı (isimden bağımsız bir amaca hizmet ettiği görülüyor ama
  derinlemesine incelenmedi — zaten verifications yapılmayacağı için
  önemi yok).
