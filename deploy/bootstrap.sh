#!/usr/bin/env bash
# ==========================================================
# bshh 前台 H5 —— 服务器首次部署一键脚本
# 用法：cd /var/www/bshh && bash deploy/bootstrap.sh
# ==========================================================
set -e

APP_NAME="bshh"
APP_PORT=9191
SHARED_DIR="/var/www/shared"
SHARED_CONFIG="$SHARED_DIR/jdy-config.json"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

green() { echo -e "\033[32m$1\033[0m"; }
yellow(){ echo -e "\033[33m$1\033[0m"; }
red()   { echo -e "\033[31m$1\033[0m"; }

echo ""
green "=========================================="
green "  bshh 前台 H5 —— 首次部署"
green "=========================================="
echo "项目目录：$PROJECT_DIR"
echo ""

# ---------- [1/6] 检查 Node ----------
echo "[1/6] 检查 Node.js 环境"
if ! command -v node >/dev/null 2>&1; then
  yellow "  未检测到 Node.js，开始安装 Node 18 ..."
  if command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    yum install -y nodejs
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
  else
    red "  无法识别包管理器，请手动安装 Node.js 16+ 后重试"
    exit 1
  fi
fi
NODE_VER=$(node -v)
green "  ✓ Node.js $NODE_VER"

NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 16 ]; then
  red "  ✗ Node 版本过低（需要 16+），当前 $NODE_VER"
  exit 1
fi

# ---------- [2/6] 检查 PM2 ----------
echo ""
echo "[2/6] 检查 PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  yellow "  未检测到 PM2，正在安装 ..."
  npm install -g pm2 --registry=https://registry.npmmirror.com
fi
green "  ✓ PM2 $(pm2 -v)"

# ---------- [3/6] 准备共享配置目录 ----------
echo ""
echo "[3/6] 准备共享配置目录"
mkdir -p "$SHARED_DIR"
chmod 750 "$SHARED_DIR"
green "  ✓ $SHARED_DIR"

if [ -f "$SHARED_CONFIG" ]; then
  green "  ✓ 已存在共享配置，前台将直接读取简道云凭证"
else
  yellow "  ! 共享配置尚未生成：$SHARED_CONFIG"
  yellow "    这不影响前台启动，但拉取不到客户数据。"
  yellow "    请部署后台 bshhadmin 并在「简道云接口」页面保存一次配置。"
fi

# ---------- [4/6] 生成 .env ----------
echo ""
echo "[4/6] 生成环境变量文件"
cd "$PROJECT_DIR"
if [ -f .env ]; then
  green "  ✓ .env 已存在，跳过（如需重建请先删除）"
else
  cat > .env <<EOF
PORT=$APP_PORT
HOST=127.0.0.1
JDY_CONFIG_PATH=$SHARED_CONFIG
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
  chmod 600 .env
  green "  ✓ 已生成 .env（凭证统一由后台写入共享配置，此处留空即可）"
fi

mkdir -p logs

# ---------- [5/6] 启动服务 ----------
echo ""
echo "[5/6] 启动服务"
node --check server.js || { red "  ✗ server.js 语法错误"; exit 1; }

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
  green "  ✓ 已重载现有进程"
else
  pm2 start ecosystem.config.js
  green "  ✓ 已启动新进程"
fi
pm2 save >/dev/null 2>&1 || true
pm2 startup 2>/dev/null | grep -E "^sudo" | bash >/dev/null 2>&1 || true

# ---------- [6/6] 健康检查 ----------
echo ""
echo "[6/6] 健康检查"
sleep 3
HEALTH=$(curl -s "http://127.0.0.1:$APP_PORT/api/health" || echo "")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  green "  ✓ 服务健康"
  echo "    $HEALTH"
  if echo "$HEALTH" | grep -q '"jdyReady":false'; then
    echo ""
    yellow "  提示：简道云凭证尚未就绪，前台会回退到 Mock 数据。"
    yellow "        请到后台 bshhadmin 完成「简道云接口」配置。"
  fi
else
  red "  ✗ 健康检查失败，查看日志：pm2 logs $APP_NAME --lines 50"
  exit 1
fi

echo ""
green "=========================================="
green "  前台部署完成"
green "=========================================="
echo ""
echo "本机访问：http://127.0.0.1:$APP_PORT"
echo ""
echo "下一步："
echo "  1. 配置 Nginx：cp deploy/nginx.conf /etc/nginx/conf.d/bshh.conf 并按注释修改"
echo "  2. 阿里云控制台安全组放行 80 / 443 端口"
echo "  3. 部署后台 bshhadmin 并完成简道云配置"
echo ""
echo "常用命令："
echo "  pm2 logs $APP_NAME      查看日志"
echo "  pm2 restart $APP_NAME   重启"
echo "  bash deploy/update.sh   拉取更新并重载"
echo ""
