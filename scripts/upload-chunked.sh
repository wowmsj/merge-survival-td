#!/bin/bash
# 分块上传：服务器会掐断大流量 SSH 连接，分成小块逐块传
# 用法: ./scripts/upload-chunked.sh <本地文件> <远程目录> <块大小KB>
set -u
FILE="$1"
REMOTE_DIR="$2"
CHUNK_KB="${3:-96}"
KEY="C:\Users\Administrator\.ssh\arkyv_deploy_key"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=20)
REMOTE="ubuntu@154.8.151.82"
NAME=$(basename "$FILE")

split -b "${CHUNK_KB}k" "$FILE" "/tmp/upload_part_"
PARTS=(/tmp/upload_part_*)
TOTAL=${#PARTS[@]}
echo "共 $TOTAL 块（每块 ${CHUNK_KB}KB）"

for i in "${!PARTS[@]}"; do
  n=$(printf "%04d" "$i")
  for attempt in 1 2 3; do
    if ssh "${SSH_OPTS[@]}" "$REMOTE" "cat > $REMOTE_DIR/.part_$n" < "${PARTS[$i]}" 2>/dev/null; then
      break
    fi
    if [ "$attempt" = "3" ]; then
      echo "块 $n 重试 3 次仍失败，中止"
      exit 1
    fi
    echo "块 $n 失败，等 20s 重试（第 $attempt 次）"
    sleep 20
  done
  echo "块 $n/$((TOTAL - 1)) 完成"
  sleep 3
done

ssh "${SSH_OPTS[@]}" "$REMOTE" "cd $REMOTE_DIR && cat .part_* > $NAME && rm -f .part_* && ls -la $NAME"
echo "DONE"
