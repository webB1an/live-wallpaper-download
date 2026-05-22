# 动态壁纸下载工具

批量下载动态壁纸的 Node.js 脚本集合，当前支持：

- MoeWalls
- WallpaperWaifu
- DesktopHut
- Anime Pictures

脚本默认下载对应网站的最新一页，支持指定页码、自定义保存目录、按详情页 URL 去重。动态壁纸脚本使用 `curl.exe` 下载以支持重试和断点续传；Anime Pictures 脚本使用 Playwright 真实浏览器处理站点页面。

## 目录结构

```text
.
├─ downloads\   下载的壁纸视频，本目录不提交到 Git
├─ config\      下载历史记录和最近一次运行结果，本目录只保留占位文件
├─ scripts\     脚本文件
└─ README.md    使用文档
```

## 环境要求

需要本机可以运行：

```powershell
node --version
curl.exe --version
```

Anime Pictures 脚本使用 Playwright 真实浏览器访问页面。克隆仓库后先安装依赖：

```powershell
npm install
npx playwright install chromium
```

## 常用命令

### MoeWalls

下载最新一页：

```powershell
node .\scripts\download-moewalls-first-page.mjs
```

下载指定页，例如第 2 页：

```powershell
node .\scripts\download-moewalls-first-page.mjs --page 2
```

自定义壁纸保存目录：

```powershell
node .\scripts\download-moewalls-first-page.mjs --out "D:\Wallpapers\MoeWalls"
```

### WallpaperWaifu

下载最新一页：

```powershell
node .\scripts\download-wallpaperwaifu-first-page.mjs
```

下载指定页：

```powershell
node .\scripts\download-wallpaperwaifu-first-page.mjs --page 2
```

只解析页面、不下载文件：

```powershell
node .\scripts\download-wallpaperwaifu-first-page.mjs --dry-run
```

### DesktopHut

下载最新一页：

```powershell
node .\scripts\download-desktophut-first-page.mjs
```

下载指定页：

```powershell
node .\scripts\download-desktophut-first-page.mjs --page 2
```

只解析页面、不下载文件：

```powershell
node .\scripts\download-desktophut-first-page.mjs --dry-run
```

### Anime Pictures

Anime Pictures 每次执行最多下载一张未记录的榜单图片。默认从“今日最佳”选择：

```powershell
node .\scripts\download-anime-pictures-best.mjs
```

从“本周最佳”选择：

```powershell
node .\scripts\download-anime-pictures-best.mjs --type week
```

只确认下一张候选图和前五个标签，不下载：

```powershell
node .\scripts\download-anime-pictures-best.mjs --type day --dry-run
```

Anime Pictures 文件名取详情页 `.tags` 的前五个标签，例如：

```text
arknights__arknights endfield__zhuang fangyi (arknights)__chungla__single.png
```

## 通用参数

```text
--page / -p   指定下载第几页；不传默认第 1 页
--out / -o    指定壁纸视频保存目录；不传默认保存到 downloads
--dry-run     WallpaperWaifu、DesktopHut 和 Anime Pictures 脚本可用；只解析页面，不下载文件
--type         Anime Pictures 脚本可用；day 为今日最佳，week 为本周最佳
--help / -h   查看脚本帮助
```

## 去重规则

脚本按“壁纸详情页 URL”去重，不按文件名去重。

运行时会在 `config` 目录生成长期去重记录：

```text
config\downloaded-detail-urls.json
config\downloaded-wallpaperwaifu-detail-urls.json
config\downloaded-desktophut-detail-urls.json
config\downloaded-anime-pictures-detail-urls.json
```

这些 JSON 文件是本地运行状态，默认不会提交到 Git。即使使用 `--out` 修改壁纸保存目录，去重记录仍然固定使用项目根目录下的 `config`。

## 大文件和慢下载

动态壁纸文件较大时，下载可能比较慢。脚本使用 `curl.exe` 下载，并开启：

```text
--retry 6
--retry-delay 2
--retry-all-errors
-C -
```

含义：

- 网络断开会自动重试。
- 支持断点续传。
- 下载失败不会写入历史去重记录。
- 下次重新运行脚本时，会继续尝试下载未完成的壁纸。

## 输出文件

下载的壁纸视频默认保存到：

```text
downloads
```

最近一次运行结果保存在：

```text
config\manifest.json
config\manifest-wallpaperwaifu.json
config\manifest-desktophut.json
config\manifest-anime-pictures.json
```

这些运行结果文件同样不会提交到 Git。
