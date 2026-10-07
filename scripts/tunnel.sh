#!/bin/bash
# localhost.run 隧道自动重连守护：断开 5 秒后自动重建
while true; do
  ssh -i /root/.ssh/lhr_key \
      -o StrictHostKeyChecking=no \
      -o ServerAliveInterval=10 \
      -o ServerAliveCountMax=3 \
      -o ExitOnForwardFailure=yes \
      -R zongyitang.lhr.rocks:80:localhost:3000 plan@localhost.run >> /tmp/tunnel.log 2>&1
  echo "$(date) 隧道断开，5秒后重连" >> /tmp/tunnel.log
  sleep 5
done
