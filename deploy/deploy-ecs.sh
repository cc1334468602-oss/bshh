#!/usr/bin/env bash
# ============================================================
# 助贷系统 · 阿里云 ECS 一键部署脚本（bshh 前台 + bshhadmin 后台）
# 适用：Alibaba Cloud Linux / CentOS / RHEL 系（全新机器）
# 用法：以 root 登录 ECS 后执行   bash deploy-ecs.sh
#
# 脚本会自动：装依赖 → 克隆两仓库 → 生成配置 → PM2 启动 → Nginx 反代 → 放端口
# 简道云凭证【不写入本脚本】，部署后请在后台网页「简道云接口」页面填写。
# ============================================================
set -e

ADMIN_USER="admin"
ADMIN_PASS="$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 16)"
SHARED_DIR="/var/www/shared"
SHARED_CONFIG="$SHARED_DIR/jdy-config.json"
FRONT_REPO="https://github.com/cc1334468602-oss/bshh.git"
ADMIN_REPO="https://github.com/cc1334468602-oss/bshhadmin.git"
FRONT_DIR="/var/www/bshh"
ADMIN_DIR="/var/www/bshhadmin"
ADMIN_PORT=9292
PUBLIC_IP="121.43.194.150"

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
[ -d "$FRONT_DIR" ] || git clone "$FRONT_REPO" "$FRONT_DIR"
[ -d "$ADMIN_DIR" ] || git clone "$ADMIN_REPO" "$ADMIN_DIR"

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

echo ""; green ">>> [7/8] 配置 Nginx 反代"; echo ""
htpasswd -bc /etc/nginx/.htpasswd "$ADMIN_USER" "$ADMIN_PASS" >/dev/null 2>&1

cat > /etc/nginx/conf.d/bshh.conf <<'NGINX'
server {
    listen 80;
    server_name 121.43.194.150;
    client_max_body_size 10m;
    gzip on; gzip_min_length 1k; gzip_comp_level 4;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
    location / {
        proxy_pass http://127.0.0.1:9191;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location ~ /\. { deny all; }
    location = /api/health { proxy_pass http://127.0.0.1:9191; access_log off; }
}
NGINX

cat > /etc/nginx/conf.d/bshhadmin.conf <<'NGINX'
server {
    listen 9292;
    server_name 121.43.194.150;
    client_max_body_size 10m;
    gzip on; gzip_min_length 1k; gzip_comp_level 4;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    # 后台访问控制：Basic Auth（必开）+ IP 白名单（强烈建议再加一层）
    auth_basic "Admin Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
    # allow 你的公司固定出口IP;   # ★ 取消注释并改为你的办公网络公网 IP
    # deny all;

    location / {
        proxy_pass http://127.0.0.1:9192;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location ~* (jdy-config\.json|\.env) { deny all; return 403; }
    location ~ /\. { deny all; }
    location = /api/health { proxy_pass http://127.0.0.1:9192; access_log off; }
}
NGINX

# SELinux：允许 nginx 连接上游（RHEL 系常见 502 的根因）
if command -v setsebool >/dev/null 2>&1; then
  setsebool -P httpd_can_network_connect on 2>/dev/null || true
fi
nginx -t && systemctl enable --now nginx

echo ""; green ">>> [8/8] 防火墙放行"; echo ""
(firewall-cmd --permanent --add-service=http >/dev/null 2>&1) || true
(firewall-cmd --permanent --add-port=${ADMIN_PORT}/tcp >/dev/null 2>&1) || true
(firewall-cmd --reload >/dev/null 2>&1) || true

echo ""
green "=========================================="
green "  部署完成！"
green "=========================================="
echo "前台访问： http://${PUBLIC_IP}/"
echo "后台访问： http://${PUBLIC_IP}:${ADMIN_PORT}/"
echo "后台账号： ${ADMIN_USER}"
echo "后台密码： ${ADMIN_PASS}"
echo ""
yellow "下一步（重要）："
echo "  1) 阿里云控制台 → 该实例「安全组」→ 入方向放行 80 与 ${ADMIN_PORT} 端口"
echo "     （源 0.0.0.0/0，或限定为你自己的 IP 更安全）"
echo "  2) 浏览器打开后台，登录后在「简道云接口」页面填写 API Key / App ID / 各 entry_id"
echo "  3) 保存后前台即时读取真实数据（无需重启）"
echo "  4) 建议：后台再加 IP 白名单 + 后续上 HTTPS（Let's Encrypt 免费证书）"
echo ""
yellow "安全提醒：本脚本登录用的 ECS root 密码请部署后修改；后台密码已随机生成请妥善保存。"
echo ""
