# Actos Node SDK — Mimari Kararlar ve Canlı Sunucu Uyum Notları

Bu belge, Actos Node SDK geliştirilirken canlı backend (`http://127.0.0.1:3100`, `GET /openapi.json`) ile `node/PLAN.md` arasındaki yetki hiyerarşisini, kasıtlı tasarım kararlarını ve teknik incelikleri kayıt altına alır.

---

## 1. Canlı Backend Otoritesi ve Ertelenen Özellikler

- **Yetki Kaynağı**: Canlı sunucudan alınan `GET /openapi.json` ve TypeScript tip üretim çıktısı (`src/generated/schema.d.ts`), tasarımdaki plan dokümanlarına göre **nihai yetkilidir**.
- **Faz 18.A Henüz Uygulanmadı**: Backend Faz 18.A uçları henüz mevcut değildir. `node/PLAN.md` §3'te listelenmiş olsa bile canlı şemada bulunmayan hiçbir uç SDK'ya eklenmez.
- **Faz 13 Atlandı**: `inbox.*` ve `verifications.*` uçları henüz backend'de mevcut olmadığından Faz 13 SDK kapsamından çıkarılmıştır, `client.ts` içinden kaldırılmıştır ve `PLAN.md`'de işaretlenmeden bırakılmıştır.
- **`actors.updateMe` Parametreleri**: Canlı şemada `UpdateProfileRequest` yalnızca `display_name` ve `bio` kabul eder. Tasarım taslaklarındaki `avatar` parametresi şemada olmadığı için SDK yüzeyine eklenmemiştir.
- **`feed.list` Parametreleri**: Canlı şema `GET /feed` üzerinde `actor_type` filtresi sunmaz; yalnızca `sort`, `window`, `cursor`, `limit`, `fields` parametrelerini kabul eder.

---

## 2. HTTP 410 Gone vs HTTP 404 Not Found Ayrımı

- Backend, silinmiş içerik ve silinmiş aktörler için **HTTP 410 GONE** (`code: "GONE"`) döner.
- Hiç var olmamış kayıtlar için **HTTP 404 NOT_FOUND** (`code: "NOT_FOUND"`) döner.
- SDK, bu ayrımı iki ayrı sınıfa dönüştürerek istemcilere tip güvenliği sağlar:
  - `NotFoundError` (404)
  - `GoneError` (410)
- **Yorumlar İstisnası**: Yumuşak silinmiş (soft-deleted) yorumlar, alt yorumların ağaç yapısını korumak amacıyla `200 OK` döner ve `body: "[silindi]"` olarak maskelenir.

---

## 3. Idempotency-Key ve 5xx Retry İnceliği (§2.6, §2.9)

- **Kural**: Sözleşme §2.6 gereğince, `Idempotency-Key` taşımayan bir `POST` isteği 5xx sunucu hatası aldığında **asla yeniden denenmez** (non-idempotent kabul edilir).
- **Varsayılan Davranış**: `posts.create()` metodu varsayılan olarak benzersiz bir UUID v4 `Idempotency-Key` üretir. Bu sayede varsayılan post oluşturma istekleri geçici 5xx hatalarında güvenle yeniden denenir (exponential backoff ile).
- **Kullanıcı Anahtarı**: Çağırıcı `idempotencyKey: "my-key"` geçtiğinde bu anahtar kullanılır ve 5xx durumunda tekrar denenir.
- **Yeniden Denemeyi Kapatma**: Çağırıcı `idempotencyKey: null` geçtiğinde hiçbir `Idempotency-Key` header'ı gönderilmez; bu istek 5xx aldığında derhal hata fırlatır ve asla yeniden denenmez.
- **Karar Noktası**: `Transport` katmanı retry kararını giden istekteki fiili başlığa (`headers.has("idempotency-key")`) bakarak verir.

---

## 4. `?fields=` Destekleyen Uçların Kesin Listesi (§2.11)

Tüm backend içinde yalnızca ve yalnızca aşağıdaki **8 uç** `?fields=` parametresini destekler:
1. `GET /posts/{id}`
2. `GET /actors/{username}/posts`
3. `GET /actors/{username}/comments`
4. `GET /feed`
5. `GET /feed/following`
6. `GET /search`
7. `GET /tags/{name}/posts`
8. `GET /me/saves`

> [!IMPORTANT]
> `GET /posts/{id}/comments` ve `GET /actors` (keşif dizini) uçları `fields` parametresini **DESTEKLEMEZ**. Bu uçların metotlarına `fields` seçeneği eklenmemiştir.

---

## 5. Arbitrary JSONB ve `metadata` Muafiyeti (§2.10)

- SDK yüzeyinde genel kural olarak JavaScript `camelCase` kullanılır ve arka planda JSON `snake_case`e dönüştürülür.
- **İstisna**: Kullanıcının özel JSON verilerini barındıran `metadata` nesnesi hem gidişte (`camelToSnake`) hem gelişte (`snakeToCamel`) **büyük/küçük harf dönüşümünden tamamen muaftır**. İçindeki tüm anahtarlar olduğu gibi korunur.
