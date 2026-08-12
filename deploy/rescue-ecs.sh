#!/usr/bin/env bash
# ==========================================================
# ECS 救援脚本：修复 /var/www/bshh 与 /var/www/bshhadmin
# - 非 git 仓库 / 代码缺失 setup-mysql.sh 时可用
# - 用 codeload tarball 下载最新代码（兼容国内 ECS 网络）
# 用法：保存为 /tmp/rescue.sh，然后 bash /tmp/rescue.sh
# ==========================================================
set -e

green() { echo -e "\033[32m$1\033[0m"; }
yellow(){ echo -e "\033[33m$1\033[0m"; }
red()   { echo -e "\033[31m$1\033[0m"; }

TIMESTAMP=$(date +%s)
BASE=/var/www
REPOS=(
  "bshh|cc1334468602-oss/bshh|9191"
  "bshhadmin|cc1334468602-oss/bshhadmin|9192"
)

# 保留简道云配置文件（如果有）
if [ -f "/var/www/shared/jdy-config.json" ]; then
  mkdir -p /var/www/shared.bak
  cp /var/www/shared/jdy-config.json "/var/www/shared.bak/jdy-config.json.${TIMESTAMP}"
  green "✓ 已备份 /var/www/shared/jdy-config.json"
fi

for item in "${REPOS[@]}"; do
  IFS='|' read -r DIR SLUG PORT <<< "$item"
  TARGET="$BASE/$DIR"
  TARBALL="https://codeload.github.com/$SLUG/tarball/refs/heads/main"
  TMPD=$(mktemp -d)

  echo ""
  green "=== 修复 $DIR ($SLUG) ==="

  # 备份原目录
  if [ -d "$TARGET" ]; then
    BACKUP="${TARGET}.bak.${TIMESTAMP}"
    yellow "  备份原目录到 $BACKUP"
    mv "$TARGET" "$BACKUP"
  fi

  # 下载最新 tarball
  echo "  下载最新代码..."
  if ! curl -fsSL "$TARBALL" -o "$TMPD/src.tar.gz"; then
    red "  ✗ 下载失败：$TARBALL"
    rm -rf "$TMPD"
    exit 1
  fi

  # 解压并定位源码根目录
  mkdir -p "$TMPD/extract"
  tar -xzf "$TMPD/src.tar.gz" -C "$TMPD/extract"
  SRC=$(ls -d "$TMPD/extract"/*/ | head -1)

  # 移动到目标位置
  mv "$SRC" "$TARGET"

  # 还原 .env（保留旧配置，避免 JDY 密钥丢失）
  if [ -f "$BACKUP/.env" ]; then
    cp "$BACKUP/.env" "$TARGET/.env"
    green "  ✓ 已还原 .env"
  fi

  # 若 .env 仍不存在，创建默认最小配置
  if [ ! -f "$TARGET/.env" ]; then
    cat > "$TARGET/.env" <<EOF
PORT=$PORT
HOST=127.0.0.1
JDY_CONFIG_PATH=/var/www/shared/jdy-config.json
DB_HOST=localhost
DB_PORT=3306
DB_USER=bshh_user
DB_PASS=Bshh@2026
DB_NAME=bshh_db
EOF
    chmod 600 "$TARGET/.env"
    green "  ✓ 已创建默认 .env"
  fi

  # 初始化 git（让 update.sh 能识别版本、后续可走 tarball 兜底）
  cd "$TARGET"
  git init -q
  git remote add origin "https://github.com/$SLUG.git"
  git add -A
  git -c user.email="agent@workbuddy.ai" -c user.name="WorkBuddy" commit -q -m "rescue from tarball"

  rm -rf "$TMPD"
  green "  ✓ $DIR 已重建为 git 仓库"
done

# 还原简道云配置
if [ ! -f "/var/www/shared/jdy-config.json" ] && [ -f "/var/www/shared.bak/jdy-config.json.${TIMESTAMP}" ]; then
  cp "/var/www/shared.bak/jdy-config.json.${TIMESTAMP}" /var/www/shared/jdy-config.json
  green "✓ 已还原简道云配置文件"
fi

# 安装并初始化 MySQL
echo ""
green "=== 安装并初始化 MySQL ==="
bash /var/www/bshh/deploy/setup-mysql.sh

# 更新前台（带 tarball 兜底）
echo ""
green "=== 更新前台 bshh ==="
cd /var/www/bshh && bash deploy/update.sh

# 更新后台
echo ""
green "=== 更新后台 bshhadmin ==="
cd /var/www/bshhadmin && bash deploy/update.sh

echo ""
green "=== 救援完成 ==="
echo "前台: http://<ECS公网IP>:8080"
echo "后台: http://<ECS公网IP>:9292"
echo "后台 Basic Auth 账号密码：grep -E '账号|密码' /tmp/deploy.log"
