# CLAUDE.md — Clash

## Proje Özeti
Clash of Clans hesap analiz aracı. `clash.malierdogan.com` adresinde yayınlanır.
- **Subdomain:** clash.malierdogan.com
- **GitHub Org:** github.com/malierdogancom/clash (private)
- **Firebase Hosting:** `portfolio-mali-erdogan` projesi, target: `clash` → `clash-malierdogan`
- **Page title:** "CoC Account Analyzer — clash.malierdogan.com"
- **Favicon:** `public/favicon.svg` (altın kale ikonu)

## Tech Stack
- **Vanilla HTML/JS/CSS** (framework yok — league.malierdogan.com ile aynı pattern)
- **Build adımı yok** — doğrudan `public/` deploy edilir
- **Node/npm:** Gerekmez

## Nasıl Çalışır
Kullanıcı oyun içinden JSON export alır ve siteye yapıştırır. JavaScript bu JSON'u parse edip:
1. `data/mappings.json`'dan ID → name çözümler
2. Bina grupları, hero'lar, aktif upgrade'ler, timerlar gösterilir
3. Sonraki aşamalarda optimizasyon önerileri eklenecek

## Veri Kaynağı
`public/data/mappings.json` — ID → name mapping için:
- Kaynak: pghant gist + COCDP wiki + manuel doğrulama
- Otomatik fetch için temiz CoC API yok — game update sonrası elle güncellenir
- Belirsiz ID'ler: Yanlış isim görüldüğünde `mappings.json`'ı düzelt

## Proje Yapısı
```
public/
  index.html          ← tek sayfa UI
  app.js              ← tüm parsing + render logic
  style.css           ← dark CoC temalı CSS
  favicon.svg         ← altın kale ikonu
  data/
    mappings.json     ← ID → {name, category, ...} mapping
```

## Firebase Yapısı
- **Project ID:** `portfolio-mali-erdogan`
- **Hosting target:** `clash` → site ID: `clash-malierdogan`
- **Firestore/Auth/Functions:** YOK — tamamen statik

## CI/CD Süreci
- **Trigger:** `main` branch'e push → production deploy, PR → preview, `workflow_dispatch` → manuel
- **Workflow:** `.github/workflows/firebase-deploy.yml`
- **Build:** Yok — `public/` klasörü direkt deploy
- **Deploy tool:** `FirebaseExtended/action-hosting-deploy@v0`
- **Target:** `clash`
- **Secrets:** `FIREBASE_SERVICE_ACCOUNT_PORTFOLIO_MALI_ERDOGAN` (org secret — otomatik)

## Build Aşamaları (Roadmap)
- **Aşama 1 (Mevcut):** JSON parse → bina listesi, hero'lar, timerlar, builder durumu
- **Aşama 2:** `game_data.json` ile max level karşılaştırması, renk kodlaması
- **Aşama 3:** TH rush optimizasyon algoritması

## Bilinen Kısıtlar
- `mappings.json` game update'lerle güncel tutulmalı (manuel)
- Bazı ID'ler hâlâ belirsiz — kullanıcı feedback ile düzeltilir
- `fetch('data/mappings.json')` çalışması için web server gerekir; lokal test için: `python -m http.server 8080`

---

## Yeni Subdomain Ekleme Rehberi
(Bkz. `portfolio/CLAUDE.md` → Yeni Subdomain Ekleme Rehberi)
