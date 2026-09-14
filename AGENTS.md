# AGENTS.md

## 專案用途

這是一個繁體中文的自行車資訊工具網站，協助騎士將騎乘資料轉換成可理解、可調整的訓練與路線規劃決策。

目前提供：

- 首頁 `/`：介紹網站與可用工具。
- 武嶺配速器 `/pacer/`：依 FTP、體重、車重、環境與車況，估算西進武嶺 53K 的完賽時間與七段配速。
- 訓練預測器 `/predict/`（測試中）：依目標時間、FTP 與近期訓練資料，估算西進武嶺的達標機率與訓練缺口；COROS MCP 尚未串接，目前使用示範資料。

工具結果是訓練與路線規劃估算，不是比賽成績保證。修改模型或文案時，保留透明計算、可調整輸入與限制說明。

## 技術架構

- 純 HTML、CSS、原生 JavaScript，沒有前端框架或 bundler。
- 根目錄 `index.html` 是首頁。
- `wuling-pacer-53k/` 是配速器，計算邏輯在 `calculator.js`，頁面互動在 `app.js`。
- `wuling-pacer-53k-predict/` 是訓練預測器，頁面互動與模型在 `app.js`。
- `Dockerfile` 使用 Nginx 映像，將三個頁面部署至 `/`、`/pacer/`、`/predict/`。
- `nginx.conf` 定義靜態檔案路由、無尾斜線重新導向、`sitemap.xml` 與 `robots.txt`。
- 部署目標是 Google Cloud Run；`cloudbuild.yaml` 負責建置、推送與部署容器。

## 開發與驗證

修改配速器計算邏輯後，在 `wuling-pacer-53k/` 執行：

```bash
npm test
```

修改 Nginx 或部署檔案後，至少執行 Docker build，並確認以下端點回應正常：

- `/`
- `/pacer/`
- `/predict/`
- `/sitemap.xml`
- `/robots.txt`

## 新增網站功能的必要同步

新增或移除任何可由搜尋引擎存取的頁面時，不能只修改 HTML 或 JavaScript。必須同步檢查並更新：

1. `Dockerfile`：確認新頁面被複製到正確的公開路徑。
2. `nginx.conf`：新增必要的靜態路由、重新導向或 `try_files` 規則。
3. `nginx.conf` 的 sitemap：將正式、可索引的頁面加入 `/sitemap.xml`；移除已不存在或不應索引的頁面。
4. `nginx.conf` 的 robots：確認 `/robots.txt` 仍允許必要路徑並指向 sitemap。
5. 頁面 SEO：補上唯一的 `<title>`、`meta description`，必要時加入 canonical URL。
6. 驗證：重新執行相關測試與 Docker endpoint smoke test。

目前 sitemap 會使用請求的 `$host` 產生絕對 HTTPS URL，因此不要在 sitemap 中填入 placeholder 網域，也不要改成相對 URL。

## 修改原則

- 優先採用最小且直接的修改，不引入不必要的依賴。
- 預設使用 ASCII；使用者可見文字依現有頁面維持繁體中文。
- 不要把互動中的計算結果、帶 query 參數的情境頁或外部參考資料加入 sitemap，除非它們是穩定且應被索引的公開頁面。
- 不要修改或還原與目前工作無關的既有變更。
