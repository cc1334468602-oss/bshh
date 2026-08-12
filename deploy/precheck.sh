#!/usr/bin/env bash
# ==========================================================
# bshh —— 推送前安全预检
# 用法：bash deploy/precheck.sh
# 作用：确认没有任何凭证会被推送到远程仓库
# ==========================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

green() { echo -e "\033[32m$1\033[0m"; }
yellow(){ echo -e "\033[33m$1\033[0m"; }
red()   { echo -e "\033[31m$1\033[0m"; }

FAIL=0
echo ""
echo "=========================================="
echo "  bshh 推送前安全预检"
echo "=========================================="
echo ""

# ---------- 1. .gitignore 规则 ----------
echo "[1/5] 检查 .gitignore 规则"
for rule in ".env" "jdy-config.json"; do
  if grep -qx "$rule" .gitignore 2>/dev/null; then
    green "  ✓ 已忽略 $rule"
  else
    red "  ✗ .gitignore 缺少规则：$rule"
    FAIL=1
  fi
done

# ---------- 2. 敏感文件是否被跟踪 ----------
echo ""
echo "[2/5] 检查敏感文件是否已被 Git 跟踪"
TRACKED_SENSITIVE=$(git ls-files 2>/dev/null | grep -E "^\.env$|jdy-config\.json|\.local\.md$|凭证" || true)
if [ -z "$TRACKED_SENSITIVE" ]; then
  green "  ✓ 无敏感文件被跟踪"
else
  red "  ✗ 以下敏感文件已被跟踪，必须移除："
  echo "$TRACKED_SENSITIVE" | sed 's/^/      /'
  yellow "    修复：git rm --cached <文件名>"
  FAIL=1
fi

# ---------- 3. 已跟踪文件中的密钥特征 ----------
echo ""
echo "[3/5] 扫描已跟踪文件中的密钥特征串"
HITS=""
for f in $(git ls-files 2>/dev/null); do
  [ -f "$f" ] || continue
  case "$f" in
    *.png|*.jpg|*.ico|*.gz) continue ;;
  esac
  # 简道云 API Key 为 32 位字母数字；entry_id 为 24 位十六进制
  M=$(grep -nE "[A-Za-z0-9]{32}|\b[0-9a-f]{24}\b" "$f" 2>/dev/null | grep -vE "^\s*#|例如|示例|placeholder|你的|xxxx|X{6,}" || true)
  if [ -n "$M" ]; then
    HITS="$HITS\n  $f:\n$(echo "$M" | sed 's/^/      /')"
  fi
done
if [ -z "$HITS" ]; then
  green "  ✓ 未发现疑似密钥"
else
  yellow "  ! 发现疑似密钥特征，请人工确认是否为占位符："
  echo -e "$HITS"
fi

# ---------- 4. 本地敏感文件存在性 ----------
echo ""
echo "[4/5] 检查本地敏感文件状态"
if [ -f .env ]; then
  if git check-ignore -q .env 2>/dev/null; then
    green "  ✓ .env 存在且已被忽略"
  else
    red "  ✗ .env 存在但未被忽略！"
    FAIL=1
  fi
else
  yellow "  ! 本地无 .env（本地开发需要，服务器由 bootstrap.sh 生成）"
fi

# ---------- 5. 远程仓库 ----------
echo ""
echo "[5/5] 检查远程仓库配置"
REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REMOTE" ]; then
  yellow "  ! 尚未配置远程仓库"
  echo "    git remote add origin https://github.com/cc1334468602-oss/bshh.git"
else
  green "  ✓ origin → $REMOTE"
fi

# ---------- 结论 ----------
echo ""
echo "=========================================="
if [ "$FAIL" -eq 0 ]; then
  green "  预检通过，可以安全推送"
  echo ""
  echo "  git push -u origin main"
else
  red "  预检未通过，请先修复上述问题"
fi
echo "=========================================="
echo ""
exit $FAIL
