#!/usr/bin/env bash
# 一键部署：构建 -> 上传 -> 验证（Git Bash 下运行：bash scripts/deploy.sh）
set -e
KEY="C:\Users\Administrator\.ssh\arkyv_deploy_key"
SERVER="ubuntu@154.8.151.82"
SSH="ssh -i $KEY -o StrictHostKeyChecking=no -o BatchMode=yes"
SCP="scp -i $KEY -o StrictHostKeyChecking=no -o BatchMode=yes"

echo "==> 构建生产包"
npm run build

echo "==> 上传 dist（先清远端旧文件）"
$SSH $SERVER "rm -rf ~/merge-survival/dist && mkdir -p ~/merge-survival/dist"
$SCP -r dist $SERVER:~/merge-survival/

echo "==> 验证"
curl -s -o /dev/null -w "首页 HTTP %{http_code}\n" http://154.8.151.82/
echo "==> 完成：http://154.8.151.82/"
