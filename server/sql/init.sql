-- 在共享 MySQL 容器中执行一次：
--   docker exec -i mysql-common mysql -uroot -p'你的root密码' < server/sql/init.sql
CREATE DATABASE IF NOT EXISTS zhongju_cards
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'zhongju'@'%' IDENTIFIED BY '改成你的数据库密码';
GRANT ALL PRIVILEGES ON zhongju_cards.* TO 'zhongju'@'%';
FLUSH PRIVILEGES;

-- 表结构由服务端启动时自动创建（server/src/db.js），此处无需建表。
