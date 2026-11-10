#!/usr/bin/env python3
"""Initialize a deployment, or safely resume it with the previously saved credentials."""
import argparse
import json
import os
import re
import secrets
import socket
import subprocess
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shared-network',default='bridge-network')
    parser.add_argument('--http-port',type=int,default=8080)
    parser.add_argument('--mysql-container',default='mysql-common')
    parser.add_argument('--db-port',type=int,default=3306)
    parser.add_argument('--db-name',default='zhongju_cards')
    parser.add_argument('--db-user',default='zhongju')
    parser.add_argument('--resume',action='store_true',help='Resume using the saved .env without rotating credentials')
    args=parser.parse_args()
    deploy_dir=Path(__file__).resolve().parent
    env_path=deploy_dir/'.env'
    if args.resume:
        if not env_path.is_file(): parser.error('--resume requires an existing .env')
        settings=dict(line.split('=',1) for line in env_path.read_text().splitlines() if '=' in line and not line.startswith('#'))
        try:
            args.http_port=int(settings['HTTP_PORT']); args.db_port=int(settings['DB_PORT'])
            args.mysql_container=settings['DB_HOST']; args.shared_network=settings['SHARED_NETWORK']
            args.db_name=settings['DB_NAME']; args.db_user=settings['DB_USER']
            if not re.fullmatch(r'[a-f0-9]{40,}',settings['DB_PASSWORD']): raise ValueError('Unexpected saved password format')
            for key in ['STAFF_TOKEN','ADMIN_TOKEN','TOKEN_SECRET']:
                if not settings.get(key): raise ValueError('Missing credentials')
        except (KeyError,ValueError): parser.error('Saved .env is not a bootstrap configuration; verify it manually')
        env_path.chmod(0o600)
    elif env_path.exists():
        parser.error('Configuration exists; use --resume to continue initialization without changing its credentials')
    for name,value in [('http-port',args.http_port),('db-port',args.db_port)]:
        if not 1<=value<=65535: parser.error(f'--{name} must be between 1 and 65535')
    for name,value,limit in [('db-name',args.db_name,64),('db-user',args.db_user,32)]:
        if not re.fullmatch(r'[A-Za-z0-9_]+',value) or len(value)>limit: parser.error(f'Invalid --{name}')
    for name,value in [('shared-network',args.shared_network),('mysql-container',args.mysql_container)]:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*',value): parser.error(f'Invalid --{name}')
    subprocess.run(['docker','info'],check=True,stdout=subprocess.DEVNULL)
    networks=json.loads(subprocess.run(['docker','inspect',args.mysql_container,'--format','{{json .NetworkSettings.Networks}}'],capture_output=True,text=True,check=True).stdout)
    if args.shared_network not in networks: parser.error('MySQL must be connected to the shared network')
    if not args.resume:
        with socket.socket() as sock: sock.bind(('127.0.0.1',args.http_port))
    def root_query(sql):
        return subprocess.run(['docker','exec','-i',args.mysql_container,'sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N'],input=sql,text=True,capture_output=True,check=True).stdout.strip()
    if not args.resume:
        existing=root_query(f"SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{args.db_name}'; SELECT User FROM mysql.user WHERE User='{args.db_user}';")
        if existing: parser.error('Database or user exists; refusing to overwrite')
        settings={'HTTP_PORT':str(args.http_port),'DB_HOST':args.mysql_container,'DB_PORT':str(args.db_port),'DB_USER':args.db_user,'DB_PASSWORD':secrets.token_hex(24),'DB_NAME':args.db_name,'SHARED_NETWORK':args.shared_network,'MYSQL_ROOT_PASSWORD':'','STAFF_TOKEN':secrets.token_hex(16),'ADMIN_TOKEN':secrets.token_hex(16),'TOKEN_SECRET':secrets.token_hex(32),'DAILY_LIMIT':'5','LOGIN_LIMIT':'10','QUOTA_TIME_ZONE':'Asia/Shanghai','TRUST_PROXY':'loopback,uniquelocal'}
        fd=os.open(env_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as target: target.write(''.join(f'{key}={value}\n' for key,value in settings.items()))
    try:
        root_query(f"CREATE DATABASE IF NOT EXISTS `{args.db_name}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS '{args.db_user}'@'%' IDENTIFIED BY '{settings['DB_PASSWORD']}';")
        # Authenticate before granting: never change an existing user's password during recovery.
        subprocess.run(['docker','exec','-i',args.mysql_container,'sh','-c','IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql -h127.0.0.1 -u "$1" -P "$2" -N -e "SELECT 1"','sh',args.db_user,str(args.db_port)],input=settings['DB_PASSWORD']+'\n',text=True,capture_output=True,check=True)
        root_query(f"GRANT ALL PRIVILEGES ON `{args.db_name}`.* TO '{args.db_user}'@'%';")
        subprocess.run(['docker','compose','config','--quiet'],cwd=deploy_dir,check=True)
    except subprocess.CalledProcessError:
        raise SystemExit('Initialization incomplete. Credentials were retained. Check database access, then run python3 bootstrap.py --resume; no existing user password will be changed.')
    print('Database and configuration ready. Credentials remain in deploy/.env (0600).')

if __name__=='__main__':main()
