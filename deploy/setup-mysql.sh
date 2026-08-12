#!/usr/bin/env bash
# ============================================================
# setup-mysql.sh — 在阿里云 ECS 上安装并初始化数据库（MariaDB / MySQL 兼容）
#
# 说明：
#  - 采用 MariaDB（与 MySQL 完全兼容，mysql2 驱动通用，且阿里云默认源即可安装，国内可达）
#  - 创建数据库 bshh_db、应用账号 bshh_user（仅本机 localhost 可连），并导入表结构
#  - 幂等：重复执行不会破坏已有数据
#  - 支持环境变量 MYSQL_ROOT_PASSWORD 传入 root 密码
#  - root 无密码时优先尝试 socket 认证（sudo mysql）
#
# 用法：bash setup-mysql.sh
# ============================================================
set -e

green(){ echo -e "\033[32m$1\033[0m"; }
yellow(){ echo -e "\033[33m$1\033[0m"; }
red(){ echo -e "\033[31m$1\033[0m"; }

DB_NAME="bshh_db"
DB_USER="bshh_user"
DB_PASS="Bshh@2026"
DB_HOST="localhost"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE=""
[ -f "$SCRIPT_DIR/../db/schema.sql" ] && SCHEMA_FILE="$SCRIPT_DIR/../db/schema.sql"
[ -z "$SCHEMA_FILE" ] && SCHEMA_FILE="/var/www/bshh/db/schema.sql"

APP_MYSQL="mysql -u${DB_USER} -p${DB_PASS} -h127.0.0.1"
ROOT_MYSQL=""
ROOT_OK=0
APP_OK=0

echo ""; green ">>> 安装并初始化数据库（MariaDB / MySQL 兼容）"; echo ""

# 1) 安装服务端（幂等）
if ! command -v mysqld >/dev/null 2>&1 && ! command -v mariadbd >/dev/null 2>&1; then
  yellow "  未检测到 MySQL/MariaDB 服务端，尝试安装 mariadb-server..."
  (dnf -y install mariadb-server mariadb >/dev/null 2>&1) || (yum -y install mariadb-server mariadb >/dev/null 2>&1) || {
    red "  ✗ 无法安装 mariadb-server，请手动安装后重跑本脚本"; exit 1;
  }
fi

# 2) 启动并设置开机自启
SVC="mariadb"
systemctl enable --now "$SVC" >/dev/null 2>&1 || { SVC="mysqld"; systemctl enable --now "$SVC" >/dev/null 2>&1 || true; }
sleep 3

# 3) 探测 root 登录方式（多种方式逐个尝试）
detect_root_login() {
  # 3.1 无密码 root
  if mysql -u root -e "SELECT 1;" >/dev/null 2>&1; then
    ROOT_MYSQL="mysql -u root"; ROOT_OK=1; return 0
  fi
  # 3.2 sudo socket 认证（MariaDB 默认 root 用 unix_socket）
  if sudo mysql -u root -e "SELECT 1;" >/dev/null 2>&1; then
    ROOT_MYSQL="sudo mysql -u root"; ROOT_OK=1; return 0
  fi
  # 3.3 环境变量传入的 root 密码
  if [ -n "$MYSQL_ROOT_PASSWORD" ] && mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT 1;" >/dev/null 2>&1; then
    ROOT_MYSQL="mysql -u root -p\"$MYSQL_ROOT_PASSWORD\""; ROOT_OK=1; return 0
  fi
  # 3.4 之前保存的 root 密码文件
  if [ -f /root/.bshh_mysql_root ]; then
    local rp; rp="$(cat /root/.bshh_mysql_root)"
    if mysql -u root -p"$rp" -e "SELECT 1;" >/dev/null 2>&1; then
      ROOT_MYSQL="mysql -u root -p\"$rp\""; ROOT_OK=1; return 0
    fi
  fi
  # 3.5 MySQL 5.7+ 初始临时密码（Alibaba Cloud Linux 某些镜像）
  local tmp_pass=""
  [ -f /var/log/mysqld.log ] && tmp_pass="$(grep 'temporary password' /var/log/mysqld.log | tail -1 | awk -F': ' '{print $NF}' | tr -d '[:space:]')"
  if [ -n "$tmp_pass" ] && mysql -u root -p"$tmp_pass" -e "SELECT 1;" --connect-expired-password >/dev/null 2>&1; then
    ROOT_MYSQL="mysql -u root -p\"$tmp_pass\""; ROOT_OK=1
    # 保存临时密码供后续使用
    echo "$tmp_pass" > /root/.bshh_mysql_root; chmod 600 /root/.bshh_mysql_root
    return 0
  fi
  return 1
}

# 4) 探测应用账号是否已可用
detect_app_login() {
  if $APP_MYSQL -e "SELECT 1;" >/dev/null 2>&1; then
    APP_OK=1; return 0
  fi
  # 尝试走 localhost 套接字
  if mysql -u"$DB_USER" -p"$DB_PASS" -hlocalhost -e "SELECT 1;" >/dev/null 2>&1; then
    APP_MYSQL="mysql -u${DB_USER} -p${DB_PASS} -hlocalhost"; APP_OK=1; return 0
  fi
  return 1
}

detect_app_login
if [ "$APP_OK" = "1" ]; then
  green "  ✓ 应用账号 ${DB_USER} 可正常连接"
fi

if [ "$APP_OK" = "0" ]; then
  detect_root_login || true
fi

# 5) 需要 root 才能完成的操作：建库、建账号、授权
run_as_root() {
  if [ "$ROOT_OK" = "0" ]; then
    red "  ✗ 无法以 root 身份登录 MariaDB/MySQL"
    echo ""
    yellow "  可能原因及解决方案："
    yellow "    1) root 已设置密码：重新运行脚本并传入密码"
    yellow "         MYSQL_ROOT_PASSWORD='你的root密码' bash setup-mysql.sh"
    yellow "    2) 手动执行以下 SQL 创建库和账号，然后重跑本脚本："
    echo ""
    cat <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
    echo ""
    yellow "    3) 若你的 root 使用 unix_socket 认证，可尝试：sudo mysql -u root"
    exit 1
  fi

  yellow "  使用 root 管理方式：${ROOT_MYSQL}"

  # 5.1 建库
  if $ROOT_MYSQL -e "USE ${DB_NAME};" >/dev/null 2>&1; then
    green "  ✓ 数据库 ${DB_NAME} 已存在"
  else
    $ROOT_MYSQL -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
    green "  ✓ 已创建数据库 ${DB_NAME}"
  fi

  # 5.2 应用账号与权限（固定密码 Bshh@2026，与 .env 保持一致）
  $ROOT_MYSQL <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
  green "  ✓ 应用账号 ${DB_USER} 已就绪（localhost / 127.0.0.1）"
}

run_as_root

# 6) 导入/校验表结构（可用 root 或应用账号）
IMPORTER="$ROOT_MYSQL"
[ "$ROOT_OK" = "0" ] && IMPORTER="$APP_MYSQL"

if [ -f "$SCHEMA_FILE" ]; then
  $IMPORTER "${DB_NAME}" < "$SCHEMA_FILE"
  green "  ✓ 已导入/更新表结构：$SCHEMA_FILE"
else
  red "  ✗ 未找到 schema.sql（$SCHEMA_FILE），请确认仓库已克隆"
fi

# 7) 校验应用账号
if $APP_MYSQL -e "SELECT 1;" >/dev/null 2>&1; then
  green "  ✓ 应用账号 ${DB_USER}@127.0.0.1 连接正常"
else
  yellow "  ⚠ 应用账号连接校验未通过，请检查 MariaDB 是否监听 127.0.0.1（bind-address）"
fi

# 8) 导出连接信息
cat > /tmp/bshh_db.env <<ENV
DB_HOST=${DB_HOST}
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
DB_NAME=${DB_NAME}
ENV

green "  ✓ 数据库初始化完成"
green "    连接信息已写入 /tmp/bshh_db.env"
echo ""
