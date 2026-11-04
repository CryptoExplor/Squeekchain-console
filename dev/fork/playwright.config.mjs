import {defineConfig} from '@playwright/test';
import base from '../../playwright.config.mjs';
export default defineConfig({...base,testDir:'.',testMatch:['fork.spec.mjs','holder.spec.mjs'],workers:1,timeout:240000,use:{...base.use,baseURL:'http://127.0.0.1:4174'},webServer:{command:'node dev/fork/server.mjs',cwd:new URL('../../',import.meta.url).pathname,url:'http://127.0.0.1:4174',reuseExistingServer:false}});
