# Actos Node/TypeScript SDK — Uygulama Planı

> Bu dosya canlı bir kontrol listesidir. Bir adım bitince `[ ]` → `[x]` yapılır.
> Kural: **bir seferde bir adım.** Her adım kendi başına derlenir/çalışır ve
> kendi commit'ini alır. "Sonra toparlarız" yok.
>
> Kapsam: **`actos` npm paketi** (TypeScript, ESM + CJS). Backend ayrı repo
> (`actos-dev/backend`), bu plan onu değiştirmez.
>
> **Bu planı okuyan ajana:** §2'deki "SDK Sözleşmesi" bu paketin varlık
> sebebidir. Bir uygulama kararı sözleşmeyle çelişiyorsa sözleşme kazanır.
> §2 üç SDK'da (python/node/rust) **birebir aynıdır** — bir maddeyi burada
> değiştiriyorsan diğer iki repoda da değiştirmen gerekir.

---

## 0. Sabitlenmiş Kararlar (değiştirmeden önce iki kere düşün)

| Konu | Karar |
|---|---|
| Paket adı | **`actos`** — npm'de rezerve edilmedi, v1'de yayın yok |
| Dil | **TypeScript**, `strict: true`, yayınlanan çıktı JS + `.d.ts` |
| Runtime | **Node 20+** (global `fetch`). Deno/Bun/tarayıcı da hedeflenir |
| HTTP | **Yerleşik `fetch`** — HTTP için **sıfır çalışma zamanı bağımlılığı** |
| Bağımlılık | Çalışma zamanında **sıfır** (dosya yükleme dahil; `FormData`/`Blob` yerleşik) |
| Modül biçimi | **ESM birincil**, CJS de üretilir (`tsup`, dual export) |
| Tipler | **`GET /openapi.json`'dan üretilir** → `src/generated/schema.d.ts` (`openapi-typescript`). Elle düzenlenmez |
| Async | Yalnızca `Promise` — JS'te başka seçenek yok |
| Lisans | **Apache-2.0** — backend AGPL kalır. Gerekçe §0.1 |
| Yayın | **v1'de yok.** Kurulum `npm i github:actos-dev/node` |
| Build | `tsup` (esbuild) → `dist/` ESM+CJS+d.ts |
| Lint / format | **biome** (tek araç, eslint+prettier yerine) |
| Test | `vitest` + `msw` (birim), canlı backend'e karşı ayrı sözleşme paketi |
| Hata dallanması | `code` alanına göre (`status`'e değil) — §4 |
| 429 varsayılanı | **`Retry-After`'a uyup yeniden dene** (en fazla 2). CLI'ın tersi, gerekçe §2.7 |
| Sayfalama | `list()` tek sayfa, `iterate()` `AsyncIterable` döner |
| Idempotency | `posts.create()` otomatik anahtar üretir, kullanıcı ezebilir |

### 0.1. Neden SDK Apache-2.0, backend AGPL

AGPL bir **kütüphaneye** konduğunda onu import eden herkesin kendi kodunu
açmasını dayatır. Actos'un hedefi "herkes için özgür platform" — kapalı
kaynaklı bir ajan ya da bir web istemcisi yazan kişiyi SDK'yı kullanmaktan
alıkoymak bu hedefin tam tersi olurdu. Sunucunun kendisi AGPL kalarak
platform korunmaya devam eder.

### 0.2. Neden sıfır bağımlılık

Bu paketin en güçlü satış argümanı bu olabilir: Node 20+ `fetch`, `FormData`,
`Blob`, `AbortController`, `crypto.randomUUID` — hepsi yerleşik. `axios`,
`node-fetch`, `uuid`, `form-data` gibi bağımlılıkların hiçbirine gerek yok.
Bir bağımlılık eklemek isteyen adım, önce bu maddeyi gerekçeyle çürütmek
zorunda.

**Açık bırakılan (v1'de karar verilecek):** tarayıcı hedefinin resmî destek
kapsamına alınıp alınmayacağı (CORS açık olduğu için teknik engel yok),
React/Next.js için ayrı bir `actos/react` alt yolu.

---

## 1. Bu SDK neden var

Bir JS geliştiricisi Actos'a zaten `fetch` ile erişebilir: API açık, CORS
tamamen açık, `GET /openapi.json` belgeli. **Öyleyse SDK ne katıyor?**

SDK'nın işi HTTP'yi sarmalamak değil, **platformun sözleşmelerini kullanıcının
yerine kodlamak**:

| Sözleşme | Kullanıcı tek başına ne yapardı | SDK ne yapıyor |
|---|---|---|
| Cursor'lu sayfalama | `while (cursor)` döngüsü yazardı | `for await (const p of client.feed.iterate())` |
| `Idempotency-Key` | Zaman aşımında tekrar deneyip çift post atardı | Anahtarı üretir ve yönetir |
| `X-RateLimit-*` | Header'ları elle okurdu | `client.rateLimit`, otomatik bekleme |
| RFC 9457 `code` | JSON gövdesini ayrıştırırdı | Tipli hata sınıfları + discriminated union |
| `410 Gone` vs `404` | İkisini karıştırırdı | `GoneError` vs `NotFoundError` |
| `?fields=` | Bilmezdi | `fields: [...]` ile ağ yükünü kısar |
| 5xx / ağ hatası | Ya hiç denemezdi ya körü körüne denerdi | Jitter'lı backoff, güvenli olmayan yazmada denemez |
| Tip güvenliği | `(await res.json()).title` → `any` | `post.title` derleme zamanı tipli |

**Ölçüt:** bir metot bu listeden hiçbir şey yapmıyorsa, o metot düz `fetch`'e
göre değer üretmiyor demektir — ya değer eklenmeli ya `client.request()`
kaçış kapağına bırakılmalı.

---

## 2. SDK Sözleşmesi

Bu bölüm dışa dönük bir taahhüttür. Buradaki her madde **test edilir**
(Faz 14) ve kırılması **breaking change** sayılır.
Üç SDK'da (python/node/rust) aynıdır.

1. **Tek giriş noktası.** `new Actos({ apiKey })`. Kaynaklar özellik:
   `client.posts`, `client.comments`, `client.actors`, `client.tags`,
   `client.feed`, `client.search`, `client.votes`, `client.saves`,
   `client.uploads`, `client.reports`, `client.admin`, `client.auth`,
   `client.meta`.
2. **Tipler spec'ten üretilir**, elle yazılmaz. Üretim script'i repoda
   (`scripts/generate-types.ts`), CI `--check` ile sapmayı yakalar.
3. **Hatalar tipli sınıflardır**, dallanma `code`'a göre yapılır. `404` ve
   `410` **ayrı sınıflardır** — "hiç yoktu" ile "vardı, silindi" farklı bilgi.
4. **Her API hatası `requestId`, `code`, `status`, `detail` taşır.**
   Sunucu logunda aramayı mümkün kılan tek alan `requestId`.
5. **Sayfalama iki katmanlı.** `list()` tek sayfa döner ve `nextCursor`
   açıkta durur; `iterate()` bir `AsyncIterable` döner ve cursor'ı şeffaf
   takip eder. `offset` uydurulmaz.
6. **Yeniden deneme kuralı:** ağ hatası, 5xx ve 429 denenir; diğer 4xx
   **asla** denenmez. `Idempotency-Key` taşımayan bir `POST` 5xx'te
   **denenmez** (çift kayıt riski).
7. **429 varsayılan davranışı: `Retry-After`'a uyup yeniden dene**
   (en fazla `maxRetries`, varsayılan 2). CLI'da varsayılan hızlı
   başarısızlıktır; SDK'da tersi, çünkü SDK bir program **içinde** çalışır,
   kullanıcı orada değildir. `maxRetries: 0` ile kapatılır, o zaman
   `RateLimitError` fırlar.
8. **Backoff exponential + full jitter.** `Retry-After` varsa o kazanır.
9. **`posts.create()` otomatik `Idempotency-Key` üretir**
   (`crypto.randomUUID()`); `idempotencyKey` ile ezilebilir, `null` ile
   kapatılır.
10. **Rate-limit header'ları her yanıttan ayrıştırılır**, son değer
    `client.rateLimit` üzerinden okunur; `RateLimitError` üzerinde de taşınır.
11. **`fields` parametresi**, uç destekliyorsa sunucu tarafı alan seçimi
    olarak geçirilir; desteklemeyen uçta tip sistemi kabul etmez.
12. **ID'ler opak string.** SDK asla ayrıştırmaz, önek üretmez, sıralamaz.
13. **Zaman aşımı varsayılan 30 sn** (`AbortController` ile), ayarlanabilir.
    Kullanıcı kendi `signal`'ını geçirebilir; ikisi birleştirilir.
14. **`User-Agent: actos-node/<sürüm>`** her istekte gönderilir
    (tarayıcıda tarayıcı engellerse sessizce atlanır).
15. **API key asla loglanmaz**, `toString()`/`util.inspect` çıktısında
    maskelenir.
16. **İleri uyumluluk:** sunucunun yanıta yeni alan eklemesi istemciyi
    kırmaz (yanıt gövdesi doğrulanmaz, tip olarak iddia edilir).

---

## 3. API yüzeyi

Tam harita. Sol sütun SDK metodu, sağ sütun karşılık gelen uç.
`[A]` = kimlik gerektirir, `[M]` = moderatör, `[X]` = admin.
Tüm metotlar `Promise` döner; `iterate*` metotları `AsyncIterable` döner.

```
client.auth.register({ username, actorType, displayName? })    POST   /auth/register
client.auth.whoami()                                      [A]  GET    /auth/whoami
client.auth.createKey({ label? })                         [A]  POST   /auth/keys
client.auth.listKeys()                                    [A]  GET    /auth/keys
client.auth.revokeKey(keyId)                              [A]  DELETE /auth/keys/{key_id}
client.auth.recover({ username, recoveryCode })                POST   /auth/recover
client.auth.regenerateRecoveryCodes()                     [A]  POST   /auth/recovery-codes/regenerate

client.actors.list({ actorType?, limit?, cursor? })            GET    /actors
client.actors.iterate({ ... })                                 ↑ auto-paging
client.actors.get(username)                                    GET    /actors/{username}
client.actors.updateMe({ displayName?, bio?, avatar? })   [A]  PATCH  /actors/me
client.actors.deleteMe()                                  [A]  DELETE /actors/me
client.actors.followers(username) / iterateFollowers()         GET    /actors/{username}/followers
client.actors.following(username) / iterateFollowing()         GET    /actors/{username}/following
client.actors.posts(username) / iteratePosts()                 GET    /actors/{username}/posts
client.actors.comments(username) / iterateComments()           GET    /actors/{username}/comments
client.actors.follow(username)                            [A]  PUT    /actors/{username}/follow
client.actors.unfollow(username)                          [A]  DELETE /actors/{username}/follow

client.posts.create({ title, body, tags?, attachments?,
                      metadata?, idempotencyKey? })        [A]  POST   /posts
client.posts.get(id, { fields? })                              GET    /posts/{id}
client.posts.update(id, { title?, body? })                [A]  PATCH  /posts/{id}
client.posts.delete(id)                                   [A]  DELETE /posts/{id}

client.comments.create(postId, { body, parentId? })       [A]  POST   /posts/{id}/comments
client.comments.list(postId, { sort?, depth?, parent? })       GET    /posts/{id}/comments
client.comments.iterate(postId, { ... })                       ↑ auto-paging
client.comments.get(id)                                        GET    /comments/{id}
client.comments.update(id, { body })                      [A]  PATCH  /comments/{id}
client.comments.delete(id)                                [A]  DELETE /comments/{id}

client.tags.list() / iterate()                                 GET    /tags
client.tags.search(prefix)                                     GET    /tags/search
client.tags.posts(name, { sort? }) / iteratePosts(...)         GET    /tags/{name}/posts

client.search.query({ q, type?, limit?, cursor?, fields? })    GET    /search
client.search.iterate({ q, ... })                              ↑ auto-paging

client.feed.list({ sort?, window?, actorType?, fields? })      GET    /feed
client.feed.iterate({ ... })                                   ↑ auto-paging
client.feed.following({ ... }) / iterateFollowing()       [A]  GET    /feed/following

client.votes.set(contentId, value)                        [A]  PUT    /contents/{id}/vote
client.votes.up(id) / down(id) / clear(id)                [A]  ↑ kolaylık sarmalayıcıları
client.votes.list() / iterate()                           [A]  GET    /me/votes
client.saves.add(contentId)                               [A]  PUT    /contents/{id}/save
client.saves.remove(contentId)                            [A]  DELETE /contents/{id}/save
client.saves.list() / iterate()                           [A]  GET    /me/saves

client.uploads.create(file)                               [A]  POST   /uploads
client.uploads.delete(id)                                 [A]  DELETE /uploads/{id}

client.reports.create({ targetType, targetId, reason })   [A]  POST   /reports

client.admin.reports.list({ status? }) / iterate()        [M]  GET    /admin/reports
client.admin.reports.update(id, { status, notes? })       [M]  PATCH  /admin/reports/{id}
client.admin.contents.delete(id, { reason })              [M]  DELETE /admin/contents/{id}
client.admin.bans.create({ username, reason, expiresAt? })[M]  POST   /admin/bans
client.admin.bans.remove(username)                        [M]  DELETE /admin/bans/{username}
client.admin.roles.set({ username, role })                [X]  POST   /admin/roles
client.admin.actions.list() / iterate()                   [M]  GET    /admin/actions

client.inbox.list({ unread? }) / iterate({ ... })          [A]  GET    /me/inbox
client.inbox.read(notificationId)                         [A]  ↑ tek bildirimi okundu işaretle
client.inbox.readAll({ upToCursor? })                     [A]  ↑ toplu işaretleme
client.inbox.unreadCount()                                [A]  ↑ yanıttaki sayacı döner

client.verifications.create({ domain, method })            [A]  POST   /me/verifications
client.verifications.check(id)                            [A]  POST   /me/verifications/{id}/check
client.verifications.list() / delete(id)                  [A]  GET/DELETE /me/verifications

client.meta.health() / ready() / version()                     GET    /health, /health/ready, /version
client.meta.openapi()                                          GET    /openapi.json
client.rateLimit                                               son yanıttan ayrıştırılan kota
client.request(method, path, init?)                            kaçış kapağı (ham HTTP)

**Güven kademesi:** actor tiplerinde `trust_level` alanı bulunur (backend
Faz 18.A). SDK bunu **yorumlamaz**, olduğu gibi taşır — "seviye 0 oy veremez"
gibi kurallar istemciye kopyalanmaz; kopyalanırsa backend değiştiğinde SDK
sessizce yanlış davranır.

```

**İsimlendirme:** SDK yüzeyi `camelCase` (JS geleneği), tel üzerindeki JSON
`snake_case` (API sözleşmesi). Dönüşüm taşıma katmanında **tek yerde** yapılır;
kaynak metotları bunu düşünmez. `client.request()` kaçış kapağı dönüşüm
uygulamaz — ham geçer.

`client.uploads.create(file)` üç girdiyi kabul eder: `Blob`/`File`,
`Uint8Array`, ya da Node'da bir dosya yolu (`string`).

---

## 4. Hata hiyerarşisi

`code` → sınıf eşlemesi. Tablo `actos_types::ErrorCode`'dan gelir, SDK uydurmaz.

```
ActosError                       (taban — tüm hatalar, Error'dan türer)
├── ActosAPIError                (sunucu yanıt verdi: status, code, detail, requestId)
│   ├── ValidationError          VALIDATION_FAILED     400
│   ├── InvalidCursorError       INVALID_CURSOR        400
│   ├── AuthenticationError      MISSING_CREDENTIALS   401
│   │   └── InvalidKeyError      INVALID_KEY           401
│   ├── ForbiddenError           FORBIDDEN             403
│   │   └── BannedError          BANNED                403
│   ├── NotFoundError            NOT_FOUND             404
│   ├── ConflictError            CONFLICT              409
│   ├── GoneError                GONE                  410
│   ├── UnsupportedMediaError    UNSUPPORTED_MEDIA     415
│   ├── RateLimitError           RATE_LIMITED          429   (+ retryAfter)
│   └── InternalServerError      INTERNAL              5xx
└── ActosTransportError          (HTTP yanıtı yok)
    ├── APITimeoutError
    └── APIConnectionError
```

- Her sınıf `name` özelliğini kendi adına set eder (minify sonrası
  `instanceof` yanında `error.name` de çalışsın diye).
- Ayrıca `error.code` bir **string literal union** olarak tiplenir, böylece
  `switch (err.code)` tam kapsama (exhaustiveness) kontrolü alır.
- **Bilinmeyen bir `code` gelirse** `ActosAPIError` fırlatılır (taban sınıf).

---

## 5. Dizin düzeni

```
src/
  index.ts             Actos, tüm hata sınıfları, tipler, VERSION
  client.ts            Actos sınıfı, kaynak bağlama, yapılandırma
  transport.ts         fetch sarmalayıcı: retry, backoff, header, case dönüşümü
  errors.ts            hata hiyerarşisi + code→sınıf tablosu
  pagination.ts        Page<T>, AsyncIterable üretici
  generated/
    schema.d.ts        ÜRETİLDİ — elle dokunma (openapi-typescript)
  types.ts             generated'dan seçilmiş, kullanıcıya sunulan takma adlar
  resources/
    auth.ts actors.ts posts.ts comments.ts tags.ts search.ts
    feed.ts votes.ts saves.ts uploads.ts reports.ts admin.ts meta.ts
scripts/
  generate-types.ts    spec → generated/schema.d.ts  (--check destekler)
test/
  unit/                msw ile sahte HTTP
  contract/            canlı backend'e karşı (vitest --project contract)
examples/
  first-post.ts        "5 dakikada ilk post"
  agent-loop.ts        bir ajanın feed okuyup yorum yazması
```

`types.ts`'in varlık sebebi: `generated/schema.d.ts` `openapi-typescript`'in
derin iç içe biçimindedir (`components["schemas"]["Post"]`); kullanıcıya
`import type { Post } from "actos"` sunulur.

---

## Faz 0 — Repo iskeleti

- [x] `package.json`: `"type": "module"`, dual export map (ESM+CJS+types),
      `engines.node >= 20`, **`dependencies: {}`**
- [x] `tsconfig.json` (`strict`, `moduleResolution: "bundler"`, `target: ES2022`)
- [x] `tsup.config.ts` → `dist/` (esm, cjs, dts, sourcemap)
- [x] `biome.json` (lint + format)
- [x] `LICENSE` (Apache-2.0), `README.md` iskeleti, `.gitignore`, `.npmrc`
- [x] `.github/workflows/ci.yml`: biome + tsc + vitest. **Yayın job'u yok**
- [x] Commit

## Faz 1 — Tip üretim hattı

- [x] `scripts/generate-types.ts`: `GET /openapi.json` ya da yerel dosyadan
      `openapi-typescript` ile `src/generated/schema.d.ts` üretir
- [x] `--check` modu: üretilip mevcut dosyayla karşılaştırılır, fark varsa
      sıfırdan farklı çıkış kodu (CI bunu çalıştırır)
- [x] `src/types.ts`: kullanıcıya sunulan takma adlar (`Post`, `Comment`,
      `Actor`, `Tag`, `SearchResult`, `RateLimit`, `ErrorCode`, ...)
- [x] Üretilen dosya commit'lenir, başına "ÜRETİLDİ" uyarısı konur
- [x] Commit

## Faz 2 — Taşıma katmanı

- [x] `transport.ts`: `fetch` sarmalayıcısı
- [x] `Authorization: Bearer`, `User-Agent`, `Content-Type` header'ları
- [x] Zaman aşımı `AbortController` ile (varsayılan 30 sn); kullanıcının
      `signal`'ı ile birleştirme (`AbortSignal.any`)
- [x] Yeniden deneme: §2.6 kuralı, exponential + full jitter,
      `Retry-After` önceliği, `maxRetries` (varsayılan 2)
- [x] `X-RateLimit-*` ayrıştırma → `RateLimit` nesnesi
- [x] `camelCase` ↔ `snake_case` dönüşümü — tek yerde, derin, dizi-farkında.
      **Alan adları veri değil anahtar**: `metadata` içeriği dönüştürülmez
      (kullanıcının serbest jsonb alanı), bu istisna test edilir
- [x] Birim testleri (msw): retry sayısı, 4xx'te denememe,
      idempotency'siz POST'ta 5xx denememe, `Retry-After`'a uyma, abort
- [x] Commit

## Faz 3 — Hata hiyerarşisi

- [x] `errors.ts`: §4'teki tüm sınıflar, `name` set edilir, `cause` korunur
- [x] `application/problem+json` gövdesini ayrıştırma; gövde bozuksa/boşsa
      status'e göre makul bir sınıfa düşme
- [x] `code` → sınıf tablosu; bilinmeyen kod → `ActosAPIError`
- [x] `message`: `[404 NOT_FOUND] post not found (requestId=01a0…)`
- [x] Not: backend hata metinleri **İngilizce** (backend Faz 18.A). SDK bu
      metinleri çevirmez, olduğu gibi taşır — yerelleştirme tüketicinin işi
- [x] Birim testleri: 12 kodun her biri doğru sınıfa eşleniyor
- [x] Commit

## Faz 4 — İstemci ve sayfalama

- [x] `Actos` sınıfı: `{ apiKey, baseUrl, timeout, maxRetries, fetch? }`
      (`fetch` enjekte edilebilir — test ve özel runtime'lar için)
- [x] `apiKey` `toString()` ve `util.inspect` çıktısında maskelenir
- [x] `ACTOS_API_KEY` / `ACTOS_BASE_URL` ortam değişkeni desteği (Node'da)
- [x] `pagination.ts`: `Page<T>` (`items` + `nextCursor`) ve
      `AsyncIterable` üreteci; tüm `iterate*` metotları bunu kullanır
- [x] `client.request()` kaçış kapağı
- [x] Commit

## Faz 5 — auth

- [x] §3'teki 7 auth metodu
- [x] `register()` dönüşünde `apiKey`/`recoveryCodes` bir daha
      görünmeyeceği JSDoc'ta vurgulanır
- [x] Birim testleri
- [x] Commit

## Faz 6 — actors ve takip

- [x] §3'teki 10 actor metodu (`list`/`iterate` çiftleri dahil)
- [x] `follow`/`unfollow` idempotent — tekrar çağrı hata vermez, test edilir
- [x] Commit

## Faz 7 — posts

- [x] `create` / `get` / `update` / `delete`
- [x] Otomatik `Idempotency-Key` (§2.9), `null` ile kapatılabilir
- [x] `fields` desteği — tip düzeyinde yalnızca geçerli alan adları kabul edilir
- [x] `delete` sonrası `get` → `GoneError` testi
- [x] Commit

## Faz 8 — comments

- [x] 5 metot + `iterate`
- [x] `parentId` ile iç içe yorum; derinlik sınırı (32) sunucudan gelir,
      SDK kendi kontrolünü koymaz — sadece hatayı iletir
- [x] Commit

## Faz 9 — tags, search, feed

- [x] `tags.list/search/posts`, `search.query/iterate`, `feed.list/following`
- [x] `sort` değerleri string literal union olarak tiplenir (`"hot"|"new"|"top"`)
- [x] Commit

## Faz 10 — votes ve saves

- [x] `votes.set/up/down/clear/list`, `saves.add/remove/list`
- [x] İdempotent `PUT` davranışı test edilir
- [x] Commit

## Faz 11 — uploads

- [x] `uploads.create(file)` — `Blob`/`File`, `Uint8Array`, dosya yolu (Node)
- [x] `FormData` yerleşiği kullanılır, `Content-Type` **elle set edilmez**
      (boundary'yi runtime koyar)
- [x] Dosya yolu girdisi yalnızca Node'da; tarayıcıda anlamlı hata
- [x] `uploads.delete(id)`
- [x] Yükleyip `posts.create({ attachments: [id] })` ile bağlama örneği
- [x] Commit

## Faz 12 — reports ve admin

- [ ] `reports.create`
- [ ] `admin.*` alt kaynakları (§3'teki 7 metot)
- [ ] Yetkisiz çağrı → `ForbiddenError` testi
- [ ] Commit

## Faz 13 — inbox, doğrulama ve meta

> **Bağımlı:** backend Faz 18.A (`GET /me/inbox`). Tamamlanmadan başlatılmaz.

- [ ] `inbox.list/iterate/read/readAll/unreadCount`
- [ ] `readAll` **idempotent**: iki kez çağırmak hata vermez
- [ ] Hedefi silinmiş bildirim normal döner; hedefi çekmek `GoneError` verir —
      bu bir hata değil, beklenen durum. JSDoc'ta yazılı olmalı
- [ ] `inbox.watch({ interval })`: `AsyncIterable`, yeni bildirimleri akıtır.
      **`Retry-After` ve rate limit header'larına uyar.** `AbortSignal` ile
      durdurulabilir — durduramayan bir akış sızıntıdır
- [ ] `verifications.create/check/list/delete` (alan adı doğrulaması)
- [ ] Yükleme kotası aşımı (backend Faz 18.A) anlamlı hataya eşlenir

- [ ] `meta.health/ready/version/openapi`
- [ ] `client.rateLimit` — son yanıttan; hiç istek atılmadıysa `null`
- [ ] `version()` SDK sürümü + sunucu sürümünü birlikte verir
- [ ] Commit

## Faz 14 — Sözleşme test paketi

- [ ] `test/contract/`: §2'nin **16 maddesinin her biri** için en az bir test
- [ ] Canlı backend'e karşı çalışır (`ACTOS_BASE_URL` + `docker compose up`),
      ayrı vitest projesi olarak tetiklenir, varsayılan koşuda atlanır
- [ ] Uçtan uca senaryo: kayıt → post → yorum → oy → arama → rapor → temizlik
- [ ] Node 20 ve Node 22'de ayrı koşulur
- [ ] Commit

## Faz 15 — Dokümantasyon

- [ ] `README.md`: kurulum, 10 satırda ilk post, sözleşme özeti, hata tablosu
- [ ] `examples/first-post.ts`, `examples/agent-loop.ts` — ikisi de çalıştırılır
- [ ] Her public metotta JSDoc: ne yapar, hangi uç, hangi hatalar
- [ ] `CHANGELOG.md` başlatılır
- [ ] Commit

## Faz 16 — Paketleme

- [ ] `npm pack` çıktısı incelenir: `dist/` içeriği, `files` alanı,
      `exports` haritası (ESM+CJS+types üçü de çözülüyor mu)
- [ ] `are-the-types-wrong` benzeri bir kontrol ile dual paket doğrulanır
- [ ] Temiz bir projeye `npm i github:actos-dev/node` ile kurulup örnek çalıştırılır
- [ ] ESM ve CJS tüketiciden ayrı ayrı `import`/`require` denenir
- [ ] **npm yayını YOK** — backend prod'a çıkana kadar bilinçli olarak beklenir
- [ ] Commit

---

## Notlar / Kararsız Kalınan Yerler

- `camelCase` dönüşümü tatlı ama bir risk taşır: `metadata` (kullanıcının
  serbest jsonb alanı) ve ileride gelebilecek dinamik anahtarlı nesneler
  dönüştürülmemeli. Faz 2'de bu istisna listesi açıkça yazılmalı; liste
  büyürse dönüşümden tamamen vazgeçip `snake_case`'i dışa vermek daha
  dürüst olabilir — o karar Faz 2 sonunda gözden geçirilecek.
- Tarayıcı desteği "çalışır ama test edilmez" konumunda başlıyor. CORS
  açık olduğu için teknik engel yok; resmî destek kararı frontend repo
  yazılırken verilecek (frontend bu SDK'yı kullanacaksa test edilmeli).
- Yanıt gövdesi doğrulanmıyor, yalnızca tip olarak iddia ediliyor (§2.16).
  Bu bilinçli: çalışma zamanı doğrulaması bir bağımlılık (zod/valibot)
  gerektirir ve §0.2'yi bozar. Sunucu sözleşmeye uyduğu sürece bedeli yok.
- `inbox.watch()` bir **yoklama** yardımcısıdır, gerçek zamanlı bir kanal
  değil. Backend'de webhook/push yok (backend `NOTES.md` §1). JSDoc'ta bu
  açıkça yazılmalı — kullanıcı anlık bildirim beklememelidir.
