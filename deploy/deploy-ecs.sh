#!/usr/bin/env bash
# ============================================================
# 助贷系统 · 阿里云 ECS 一键部署脚本（bshh 前台 + bshhadmin 后台）
# 适用：Alibaba Cloud Linux / CentOS / RHEL 系（全新机器）
# 用法：以 root 登录 ECS 后执行   bash deploy-ecs.sh
#
# 特性：
#  - 前台域名 HTTPS：wxbshh.com（需放好 SSL 证书 + ICP 备案）
#  - 后台走 HTTP：IP:9292 + Basic Auth（不依赖证书/子域，避开证书不匹配，省事）
#  - 备案前回退：未备案时前台也可用 IP:8080 访问
#  - 简道云凭证【不写入本脚本】，部署后请在后台「简道云接口」页面填写
#
# ⚠ 前置：域名须 ICP 备案 + DNS A 记录指向本机，否则大陆无法用域名访问 80/443
# ============================================================
set -e

# ===================== 可配置项 =====================
DOMAIN="wxbshh.com"
ADMIN_SUB="admin"
FRONT_HOST="$DOMAIN"                      # 前台域名：wxbshh.com
ADMIN_HOST="$ADMIN_SUB.$DOMAIN"          # 后台域名：admin.wxbshh.com
PUBLIC_IP="121.43.194.150"

ADMIN_USER="admin"
ADMIN_PASS="$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 16)"

SSL_DIR="/etc/nginx/ssl"
SSL_CERT="$SSL_DIR/$DOMAIN.fullchain.pem"
SSL_KEY="$SSL_DIR/$DOMAIN.key"
# 后台默认走 HTTP（IP:9292），不需要证书。
# 如日后要给后台也上 HTTPS（独立证书 + 子域），先 export ENABLE_ADMIN_HTTPS=1 与
# SSL_CERT_ADMIN / SSL_KEY_ADMIN 后重跑本脚本即可。
SSL_CERT_ADMIN="${SSL_CERT_ADMIN:-}"
SSL_KEY_ADMIN="${SSL_KEY_ADMIN:-}"

FRONT_IP_PORT=8080    # 备案前用 IP 访问前台
ADMIN_IP_PORT=9292    # 备案前用 IP 访问后台

SHARED_DIR="/var/www/shared"
SHARED_CONFIG="$SHARED_DIR/jdy-config.json"
FRONT_REPO="https://github.com/cc1334468602-oss/bshh.git"
ADMIN_REPO="https://github.com/cc1334468602-oss/bshhadmin.git"
FRONT_DIR="/var/www/bshh"
ADMIN_DIR="/var/www/bshhadmin"

green(){ echo -e "\033[32m$1\033[0m"; }
yellow(){ echo -e "\033[33m$1\033[0m"; }
red(){ echo -e "\033[31m$1\033[0m"; }

echo ""; green ">>> [1/8] 系统更新与基础依赖"; echo ""
(dnf -y update >/dev/null 2>&1 || true)
(dnf -y install git nginx curl tar xz openssl httpd-tools policycoreutils >/dev/null 2>&1) || \
  (yum -y install git nginx curl tar xz openssl httpd-tools policycoreutils)
(systemctl enable --now firewalld >/dev/null 2>&1) || true

echo ""; green ">>> [2/8] 安装 Node.js 20 (LTS)"; echo ""
if ! command -v node >/dev/null 2>&1; then
  if curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && dnf -y install nodejs; then
    echo "  ✓ NodeSource 安装成功"
  else
    yellow "  NodeSource 失败，改用官方二进制包安装 ..."
    VER=$(curl -s https://registry.npmmirror.com/-/binary/node/ | grep -oE 'v20\.[0-9]+\.[0-9]+' | sort -V | tail -1)
    echo "  选定版本 $VER"
    curl -fsSL "https://registry.npmmirror.com/-/binary/node/$VER/node-$VER-linux-x64.tar.xz" -o /tmp/node.tar.xz
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
    rm -f /tmp/node.tar.xz
  fi
fi
node -v; npm -v

echo ""; green ">>> [3/8] 安装 PM2"; echo ""
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --registry=https://registry.npmmirror.com
fi
pm2 -v

echo ""; green ">>> [4/8] 克隆代码仓库"; echo ""
mkdir -p /var/www

# 国内 ECS 直连 github.com 常中途断流，采用：
#   1) 浅克隆(--depth 1，体积小、不易掉) 直连重试
#   2) 公共代理镜像 ghproxy 重试
#   3) codeload tarball 兜底（与 raw 同源 CDN，国内通常可达）
clone_repo() {
  local repo="$1" dir="$2"
  rm -rf "$dir"
  local base="https://github.com/$repo.git"
  local sources=(
    "$base"
    "https://ghproxy.net/$base"
    "https://mirror.ghproxy.com/$base"
  )
  for src in "${sources[@]}"; do
    for try in 1 2 3; do
      echo "  · 尝试 [$src] (第 $try 次)"
      if timeout 90 git clone --depth 1 "$src" "$dir" 2>/dev/null; then
        # 把 origin 还原为干净的 github 地址，便于后续 git pull / update.sh
        git -C "$dir" remote set-url origin "$base"
        echo "  ✓ $repo 克隆成功"; return 0
      fi
      rm -rf "$dir"
      sleep 2
    done
  done
  # 兜底：codeload tarball
  echo "  · 兜底：codeload tarball 下载 $repo"
  local tb="https://codeload.github.com/$repo/tar.gz/refs/heads/main"
  if curl -fsSL "$tb" -o /tmp/repo.tar.gz 2>/dev/null; then
    local parent; parent="$(dirname "$dir")"
    local name; name="$(basename "$repo" | cut -d/ -f2)"
    if tar -xzf /tmp/repo.tar.gz -C "$parent" 2>/dev/null; then
      [ -d "$parent/$name-main" ] && mv "$parent/$name-main" "$dir"
    fi
    rm -f /tmp/repo.tar.gz
    if [ -d "$dir" ] && [ -f "$dir/server.js" ]; then
      echo "  ✓ $repo tarball 解压成功"; return 0
    fi
  fi
  return 1
}

clone_repo "cc1334468602-oss/bshh" "$FRONT_DIR"      || { red "  ✗ 前台仓库克隆失败，请检查 ECS 到 GitHub 的网络或配置代理后重跑本脚本"; exit 1; }
clone_repo "cc1334468602-oss/bshhadmin" "$ADMIN_DIR" || { red "  ✗ 后台仓库克隆失败，请检查 ECS 到 GitHub 的网络或配置代理后重跑本脚本"; exit 1; }

echo ""; green ">>> [5/8] 生成配置（.env + 共享 jdy-config.json）"; echo ""
cat > "$FRONT_DIR/.env" <<'EOF'
PORT=9191
HOST=127.0.0.1
JDY_CONFIG_PATH=/var/www/shared/jdy-config.json
JDY_API_KEY=
JDY_APP_ID=
JDY_ENTRY_CUSTOMER=
JDY_ENTRY_LOAN=
JDY_ENTRY_LOAN_HISTORY=
JDY_ENTRY_CASHFLOW=
JDY_ENTRY_INTENTION=
JDY_ENTRY_FOLLOWUP=
JDY_ENTRY_REPAYMENT=
EOF
chmod 600 "$FRONT_DIR/.env"

cat > "$ADMIN_DIR/.env" <<'EOF'
PORT=9192
HOST=127.0.0.1
JDY_CONFIG_PATH=/var/www/shared/jdy-config.json
JDY_API_KEY=
JDY_APP_ID=
EOF
chmod 600 "$ADMIN_DIR/.env"

mkdir -p "$SHARED_DIR"; chmod 750 "$SHARED_DIR"
cat > "$SHARED_CONFIG" <<'EOF'
{
  "apiKey": "",
  "appId": "",
  "entries": {
    "customer": "",
    "loan": "",
    "loanHistory": "",
    "cashFlow": "",
    "intention": "",
    "followUp": "",
    "repayment": ""
  }
}
EOF
chmod 600 "$SHARED_CONFIG"
green "  ✓ 共享配置已生成（凭证待后台页面填写）"

echo ""; green ">>> [6/8] 启动服务 (PM2)"; echo ""
cd "$FRONT_DIR" && pm2 start ecosystem.config.js
cd "$ADMIN_DIR" && pm2 start ecosystem.config.js
pm2 save
(pm2 startup systemd -u root --hp /root >/dev/null 2>&1) || true

echo ""; green ">>> [7/8] 配置 Nginx（域名 HTTPS + 备案前 IP 回退）"; echo ""
mkdir -p "$SSL_DIR"; chmod 700 "$SSL_DIR"
htpasswd -bc /etc/nginx/.htpasswd "$ADMIN_USER" "$ADMIN_PASS" >/dev/null 2>&1

front_cert_ok=false; admin_cert_ok=false
[ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ] && front_cert_ok=true
# 后台默认只走 HTTP；仅在显式 ENABLE_ADMIN_HTTPS=1 且证书齐全时才启用 443
if [ "${ENABLE_ADMIN_HTTPS:-0}" = "1" ] && [ -n "$SSL_CERT_ADMIN" ] && [ -f "$SSL_CERT_ADMIN" ] && [ -f "$SSL_KEY_ADMIN" ]; then
  admin_cert_ok=true
fi

cat > /etc/nginx/conf.d/bshh.conf <<NGINX
# ===== 备案前：用 IP:${FRONT_IP_PORT} 访问（无需域名/备案）=====
server {
    listen ${FRONT_IP_PORT};
    server_name _;
    client_max_body_size 10m;
    gzip on; gzip_min_length 1k; gzip_comp_level 4;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
    location / {
        proxy_pass http://127.0.0.1:9191;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location ~ /\. { deny all; }
    location = /api/health { proxy_pass http://127.0.0.1:9191; access_log off; }
}

# ===== HTTP 80 → 跳转 HTTPS（备案 + 证书就位后生效）=====
server {
    listen 80;
    server_name ${FRONT_HOST};
    return 301 https://\$host\$request_uri;
}
NGINX

if $front_cert_ok; then
cat >> /etc/nginx/conf.d/bshh.conf <<NGINX

server {
    listen 443 ssl http2;
    server_name ${FRONT_HOST};
    ssl_certificate     ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    client_max_body_size 10m;
    gzip on; gzip_min_length 1k; gzip_comp_level 4;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
    location / {
        proxy_pass http://127.0.0.1:9191;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location ~ /\. { deny all; }
    location = /api/health { proxy_pass http://127.0.0.1:9191; access_log off; }
}
NGINX
fi

cat > /etc/nginx/conf.d/bshhadmin.conf <<NGINX
# ===== 备案前：用 IP:${ADMIN_IP_PORT} 访问（Basic Auth）=====
server {
    listen ${ADMIN_IP_PORT};
    server_name _;
    client_max_body_size 10m;
    gzip on; gzip_min_length 1k; gzip_comp_level 4;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
    auth_basic "Admin Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
    location / {
        proxy_pass http://127.0.0.1:9192;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location ~* (jdy-config\.json|\.env) { deny all; return 403; }
    location ~ /\. { deny all; }
    location = /api/health { proxy_pass http://127.0.0.1:9192; access_log off; }
}

NGINX

if $admin_cert_ok; then
cat >> /etc/nginx/conf.d/bshhadmin.conf <<NGINX

server {
    listen 443 ssl http2;
    server_name ${ADMIN_HOST};
    ssl_certificate     ${SSL_CERT_ADMIN};
    ssl_certificate_key ${SSL_KEY_ADMIN};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    client_max_body_size 10m;
    auth_basic "Admin Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
    # allow 你的公司固定出口IP; deny all;   # ★ 建议再加 IP 白名单
    location / {
        proxy_pass http://127.0.0.1:9192;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location ~* (jdy-config\.json|\.env) { deny all; return 403; }
    location ~ /\. { deny all; }
    location = /api/health { proxy_pass http://127.0.0.1:9192; access_log off; }
}
NGINX
fi

if command -v setsebool >/dev/null 2>&1; then
  setsebool -P httpd_can_network_connect on 2>/dev/null || true
fi
nginx -t && systemctl enable --now nginx

echo ""; green ">>> [8/8] 防火墙放行"; echo ""
(firewall-cmd --permanent --add-service=http >/dev/null 2>&1) || true
(firewall-cmd --permanent --add-service=https >/dev/null 2>&1) || true
(firewall-cmd --permanent --add-port=${FRONT_IP_PORT}/tcp >/dev/null 2>&1) || true
(firewall-cmd --permanent --add-port=${ADMIN_IP_PORT}/tcp >/dev/null 2>&1) || true
(firewall-cmd --reload >/dev/null 2>&1) || true

echo ""
green "=========================================="
green "  部署完成！"
green "=========================================="
echo "【备案前 · IP 访问（立即可用）】"
echo "  前台： http://${PUBLIC_IP}:${FRONT_IP_PORT}/"
echo "  后台： http://${PUBLIC_IP}:${ADMIN_IP_PORT}/   (账号 $ADMIN_USER / 密码 $ADMIN_PASS)"
echo ""
if $front_cert_ok; then
  green "【前台 SSL 证书已检测到 · wxbshh.com HTTPS 已就绪（需先 ICP 备案）】"
  echo "  前台： https://${FRONT_HOST}/"
else
  yellow "【前台 SSL 证书尚未放置 · 域名 HTTPS 暂未启用】"
  echo "  请把 wxbshh.com 证书放到："
  echo "    $SSL_CERT  与  $SSL_KEY"
  echo "  放好后执行：  nginx -s reload"
fi
echo ""
yellow "上线前必做："
echo "  1) ICP 备案：阿里云控制台提交 wxbshh.com 备案（未备案大陆无法用域名访问 80/443）"
echo "  2) DNS：将 wxbshh.com 的 A 记录指向 $PUBLIC_IP（后台用 IP，无需配子域解析）"
echo "  3) 安全组：放行 80 / 443 / $FRONT_IP_PORT / $ADMIN_IP_PORT"
echo "  4) 浏览器开后台 http://${PUBLIC_IP}:${ADMIN_IP_PORT}/ ，登录后在「简道云接口」页填写 API Key / App ID / 各 entry_id"
echo "  5) 部署后请修改 ECS root 密码（本会话中曾出现）；后台建议再加 IP 白名单（见 bshhadmin.conf 注释）"
echo "  6) 前台若用 https，证书仅覆盖 wxbshh.com 即可（后台走 HTTP，不涉及子域证书）"
echo ""
