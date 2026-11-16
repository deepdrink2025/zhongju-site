import express from 'express';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/app.js';
import {fakePool} from './fakePool.mjs';

if(process.env.NODE_ENV==='production')throw new Error('UI demo server must not run in production');
const outer=express(),pool=fakePool();
const api=createApp({pool,dailyLimit:50});
outer.use((req,res,next)=>req.path.startsWith('/api/')?api(req,res,next):next());
const dist=fileURLToPath(new URL('../../dist/',import.meta.url));
outer.use(express.static(dist));outer.get('*',(_req,res)=>res.sendFile(dist+'index.html'));
const server=outer.listen(0,'127.0.0.1',()=>console.log('UI_TEST_URL=http://127.0.0.1:'+server.address().port));
