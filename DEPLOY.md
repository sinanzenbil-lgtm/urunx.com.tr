# Vercel'e Yükleme (Deploy)

## Tek seferlik: Vercel girişi

Terminalde proje klasöründe:

```bash
cd "/Users/sinanmacbookpro/Downloads/urunx.com.tr-main 2 06.02.26 "
npx vercel login
```

- Çıkan linke (örn. `https://vercel.com/oauth/device?user_code=XXXX`) tıklayın
- Tarayıcıda GitHub veya e-posta ile giriş yapın
- "Waiting for authentication..." yazısı kaybolunca giriş tamamlanmıştır (Ctrl+C ile çıkabilirsiniz)

## Her deploy için

Aynı klasörde:

```bash
npm run deploy
```

veya:

```bash
npx vercel --prod
```

Bu komut projeyi Vercel’e yükler ve canlı URL’i verir.
