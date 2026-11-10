"""Regression checks with fake Docker/HTTP tools; never contacts a database."""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path

source=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='deployment-regression-') as scratch:
    root=Path(scratch);bin_dir=root/'bin';bin_dir.mkdir()
    docker=bin_dir/'docker'
    docker.write_text(f'#!{sys.executable}\n'+'''import json,os,sys
args=sys.argv[1:]
if args[:1]==['inspect'] and '-f' in args:print('bridge-network')
elif args[:1]==['inspect']:print(json.dumps({'bridge-network':{}}))
elif args[:1]==['exec']:
    sql=sys.stdin.read()
    if 'CREATE DATABASE' in sql and os.environ.get('TEST_FAIL_SQL')=='1':sys.exit(55)
''');docker.chmod(0o755)
    for name,content in [('curl','#!/bin/sh\nexit "${TEST_HTTP_EXIT:-1}"\n'),('sleep','#!/bin/sh\nexit 0\n')]:
        path=bin_dir/name;path.write_text(content);path.chmod(0o755)
    env=dict(os.environ,PATH=str(bin_dir)+os.pathsep+os.environ['PATH'])
    deploy=root/'deploy';deploy.mkdir();shutil.copy2(source/'deploy/deploy.sh',deploy/'deploy.sh')
    staff,admin='regression-staff-passcode','regression-admin-passcode'
    (deploy/'.env').write_text(f'HTTP_PORT=8080\nDB_HOST=mysql-common\nDB_USER=zhongju\nDB_PASSWORD=test-db\nDB_NAME=zhongju_cards\nSHARED_NETWORK=bridge-network\nMYSQL_ROOT_PASSWORD=\nSTAFF_TOKEN={staff}\nADMIN_TOKEN={admin}\nTOKEN_SECRET='+'a'*64+'\n')
    failed=subprocess.run(['bash',str(deploy/'deploy.sh')],env=env,capture_output=True,text=True)
    assert failed.returncode!=0 and '部署完成' not in failed.stdout
    succeeded=subprocess.run(['bash',str(deploy/'deploy.sh')],env=dict(env,TEST_HTTP_EXIT='0'),capture_output=True,text=True)
    assert succeeded.returncode==0 and '部署完成' in succeeded.stdout
    assert all(secret not in failed.stdout+succeeded.stdout for secret in [staff,admin])
    print('PASS failed health check returns nonzero; normal deployment output hides credentials')
    boot=root/'bootstrap';boot.mkdir();shutil.copy2(source/'deploy/bootstrap.py',boot/'bootstrap.py')
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    command=[sys.executable,str(boot/'bootstrap.py'),'--http-port',str(port)]
    first=subprocess.run(command,env=dict(env,TEST_FAIL_SQL='1'),capture_output=True,text=True)
    assert first.returncode!=0 and '--resume' in first.stderr
    before=(boot/'.env').read_text()
    resumed=subprocess.run([sys.executable,str(boot/'bootstrap.py'),'--resume'],env=env,capture_output=True,text=True)
    assert resumed.returncode==0,resumed.stderr
    assert (boot/'.env').read_text()==before
    assert (boot/'.env').stat().st_mode&0o777==0o600
    print('PASS interrupted initialization resumes with unchanged credentials and private permissions')
