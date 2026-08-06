# bshh · 助贷员工端 H5（前台）

面向助贷业务**一线员工**的移动端 H5，用于查看客户线索、匹配银行信贷产品、跟进记录。
本仓库只负责**托管前端页面 + 代理读取**简道云数据，**不保存任何凭证、不提供配置写入**。

> 配套后台仓库：[bshhadmin](https://github.com/cc1334468602-oss/bshhadmin.git)
> 两个仓库通过一份**共享配置文件**联动：后台在管理端改完简道云凭证，前台**无需重启**即生效。

---

## 技术栈

- **后端**：零依赖 Node.js 原生 `http` / `https`，单文件 `server.js`，无需 `npm install`
- **前端**：纯静态 `HTML + CSS + 原生 JS`，无构建步骤
- **数据源**：简道云 v5 API（`POST /api/v5/app/entry/data/list`，`Authorization: Bearer <API_KEY>`）

## 目录结构

```
bshh/
├── index.html              # H5 入口
├── css/h5.css
├── js/
│   ├── app.js              # 页面交互
│   ├── data.js             # 本地 Mock 回退数据（无凭证时使用）
│   └── engine.js           # 匹配引擎（客户 ↔ 银行产品）
├── server.js               # 前台服务（只读代理，端口默认 9191）
├── package.json
├── ecosystem.config.js     # PM2 配置（注入 JDY_CONFIG_PATH / PORT / HOST）
├── .env.example            # 环境变量模板（复制为 .env 填写）
├── .gitignore / .gitattributes
└── deploy/
    ├── bootstrap.sh        # 服务器首次部署一键脚本
    ├── update.sh           # 后续更新（git pull + pm2 reload + 健康检查）
    ├── precheck.sh         # 推送前安全预检（扫描密钥）
    └── nginx.conf          # Nginx 站点模板（前台无访问控制）
```

## 本地启动

```bash
# 需要 Node.js >= 16
node server.js
# 或
npm start
# 默认 http://127.0.0.1:9191
```

前台**只需要数据，不需要自己持有凭证**。凭证来源有两种（优先级从高到低）：

1. **共享配置文件**（推荐，与后台共用）：设置环境变量 `JDY_CONFIG_PATH` 指向前台与后台都可读写的同一文件。
2. **本仓库 `.env`**：复制 `.env.example` 为 `.env` 填写 `JDY_API_KEY` / `JDY_APP_ID` / 7 个 `JDY_ENTRY_*`。
   ```bash
   cp .env.example .env
   # 编辑 .env 填入凭证
   ```

若两者都未配置，前台自动回退到 `js/data.js` 里的 **Mock 数据**，页面仍可正常演示。

## 与后台的联动机制

```
┌─────────────┐   写   ┌──────────────────────┐   读   ┌─────────────┐
│  bshhadmin  │ ─────► │  JDY_CONFIG_PATH      │ ◄───── │    bshh     │
│  (后台9192) │        │  (共享配置文件)        │        │  (前台9191) │
└─────────────┘        └──────────────────────┘        └─────────────┘
```

- 后台 `POST /api/jdy/config` 把凭证写入共享配置文件；
- 前台每次请求都**实时重新读取**该文件（`loadConfig()`），因此后台改完前台立即生效，无需重启；
- 前台**只暴露** `jdyReady` / `ready` 状态，**绝不返回明文 API Key**。

生产环境通常在同一台机器上把 `JDY_CONFIG_PATH` 指向如 `/var/www/shared/jdy-config.json`，
由 Nginx 把 `9191`（前台）、`9192`（后台）反代到不同域名/路径，后台再加 IP 白名单。

## 接口（只读）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/health` | 健康检查，返回 `jdyReady` 布尔 |
| GET  | `/api/jdy/status` | 仅返回 `ready` 状态与来源，**不含凭证** |
| POST | `/api/jdy/customers` | 拉取客户列表（支持按 `salesperson` 过滤） |
| POST | `/api/jdy/loans` | 拉取贷款/产品数据 |
| POST | `/api/jdy/followups` | 拉取跟进记录 |

> 凭证配置、连接测试、数据概览统计等**写操作只在后台 `bshhadmin`**。

## 部署

1. 服务器首次部署：`bash deploy/bootstrap.sh`（自动准备共享配置目录、生成 `.env`、配置 Nginx、PM2 启动）。
2. 后续更新：`bash deploy/update.sh`（一行 `git pull` + 零停机 reload + 健康检查）。
3. 推送前务必本地跑 `bash deploy/precheck.sh`，确认无密钥入库。

详细部署与安全加固见 `bshhadmin` 仓库的 `DEPLOY` 说明及 `deploy/nginx.conf` 注释。

## 安全要点

- 简道云 API Key 只存在于共享配置文件或 `.env`，**代码中零硬编码**；
- 前台对配置文件路径做目录穿越防护，且**不暴露任何凭证明文接口**；
- 仓库 `.gitignore` 已排除 `.env` / `jdy-config.json` / 证书 / `*.local.md`；
- 推送前 `precheck.sh` 会扫描 32 位密钥特征与 24 位 entry_id 特征。
