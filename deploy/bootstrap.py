#!/usr/bin/env python3
"""Create a dedicated database and random credentials for a first deployment."""

import argparse
import json
import os
import re
import secrets
import socket
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shared-network', default='bridge-network', help='Existing Docker network shared by MySQL and the reverse proxy')
    parser.add_argument('--http-port', type=int, default=8080, help='Host loopback port for the web service')
    parser.add_argument('--mysql-container', default='mysql-common', help='Existing MySQL container name and database hostname')
    parser.add_argument('--db-port', type=int, default=3306, help='MySQL port inside its container')
    parser.add_argument('--db-name', default='zhongju_cards', help='New database name')
    parser.add_argument('--db-user', default='zhongju', help='New database user')
    args = parser.parse_args()
    for name, value in [('http-port', args.http_port), ('db-port', args.db_port)]:
        if not 1 <= value <= 65535:
            parser.error(f'--{name} must be between 1 and 65535')
    for name, value, limit in [('db-name', args.db_name, 64), ('db-user', args.db_user, 32)]:
        if not re.fullmatch(r'[A-Za-z0-9_]+', value) or len(value) > limit:
            parser.error(f'--{name} must contain 1 to {limit} letters, digits, or underscores')
    for name, value in [('shared-network', args.shared_network), ('mysql-container', args.mysql_container)]:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', value):
            parser.error(f'--{name} must be a Docker resource name')

    deploy_dir = Path(__file__).resolve().parent
    env_path = deploy_dir / '.env'
    if env_path.exists():
        raise SystemExit('Refusing to replace an existing deployment environment')

    subprocess.run(['docker', 'info'], check=True, stdout=subprocess.DEVNULL)
    networks = json.loads(subprocess.run(
        ['docker', 'inspect', args.mysql_container, '--format', '{{json .NetworkSettings.Networks}}'],
        capture_output=True, text=True, check=True,
    ).stdout)
    if args.shared_network not in networks:
        raise SystemExit('The MySQL container must be connected to the selected shared network')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', args.http_port))

    def root_query(sql):
        return subprocess.run(
            ['docker', 'exec', '-i', args.mysql_container, 'sh', '-c',
             'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N'],
            input=sql, text=True, capture_output=True, check=True,
        ).stdout.strip()

    existing = root_query(
        f"SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{args.db_name}'; "
        f"SELECT User FROM mysql.user WHERE User='{args.db_user}';"
    )
    if existing:
        raise SystemExit('Database or user already exists; refusing to overwrite')

    settings = {
        'HTTP_PORT': str(args.http_port),
        'DB_HOST': args.mysql_container,
        'DB_PORT': str(args.db_port),
        'DB_USER': args.db_user,
        'DB_PASSWORD': secrets.token_hex(24),
        'DB_NAME': args.db_name,
        'SHARED_NETWORK': args.shared_network,
        'MYSQL_ROOT_PASSWORD': '',
        'STAFF_TOKEN': secrets.token_hex(12),
        'ADMIN_TOKEN': secrets.token_hex(16),
        'TOKEN_SECRET': secrets.token_hex(32),
        'DAILY_LIMIT': '5',
        'LOGIN_LIMIT': '10',
    }
    fd = os.open(env_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(''.join(f'{key}={value}\n' for key, value in settings.items()))

    root_query(f"""
CREATE DATABASE `{args.db_name}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '{args.db_user}'@'%' IDENTIFIED BY '{settings['DB_PASSWORD']}';
GRANT ALL PRIVILEGES ON `{args.db_name}`.* TO '{args.db_user}'@'%';
""")
    print('Created dedicated database and user; generated credentials in deploy/.env (0600).')
    subprocess.run(['docker', 'compose', 'config', '--quiet'], cwd=deploy_dir, check=True)
    print(f'Compose configuration validated; HTTP loopback port {args.http_port} available.')


if __name__ == '__main__':
    main()
