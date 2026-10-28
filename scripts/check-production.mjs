import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
const root=process.cwd()
const required=[
  'src/App.tsx','src/auth-pages.tsx','src/account-pages.tsx','src/legal-pages.tsx',
  'src/listing-page.tsx','src/site-chrome.tsx','src/lib/auth.ts','worker/index.ts',
  'migrations/0002_native_email_auth.sql','public/_headers','wrangler.toml'
]
const errors=[]
for(const file of required)if(!fs.existsSync(path.join(root,file)))errors.push('Missing required file: '+file)
const read=(file)=>fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file),'utf8'):''
const app=read('src/App.tsx'), worker=read('worker/index.ts'), migration=read('migrations/0002_native_email_auth.sql'), wrangler=read('wrangler.toml')
for(const route of ['/list-property','/privacy','/terms','/verify-email','/reset-password','/review-queue'])if(!app.includes(route))errors.push('App router missing route '+route)
for(const endpoint of ['/api/auth/register','/api/auth/login','/api/auth/verify-email','/api/auth/forgot-password','/api/auth/reset-password','/api/auth/session','/api/properties','/api/favorites','/api/support'])if(!worker.includes(endpoint))errors.push('Worker missing endpoint marker '+endpoint)
for(const marker of ['password_hash','email_verified','email_verification_tokens','password_reset_tokens','auth_rate_limits'])if(!migration.includes(marker))errors.push('Migration missing '+marker)
if(!wrangler.includes('run_worker_first = ["/api/*"]'))errors.push('Wrangler assets must route /api/* through the Worker before SPA fallback')
if(wrangler.includes('REPLACE_WITH_CONFIGURED_D1_DATABASE_ID'))errors.push('Wrangler still contains a placeholder D1 database ID')
if(wrangler.includes('RESEND_API_KEY'))errors.push('Do not store RESEND_API_KEY in wrangler.toml; use a Cloudflare secret')
if(!read('src/legal-pages.tsx').includes('dewifystores@gmail.com'))errors.push('Support email missing from legal/contact pages')
if(!worker.includes('iterations=100000'))errors.push('Worker PBKDF2 hash iteration count must be 100000 for Cloudflare Workers compatibility')
if(!worker.includes('iterations>100000'))errors.push('Worker PBKDF2 verification limit must not exceed 100000 on Cloudflare Workers')
if(worker.includes('iterations=120000')||worker.includes('iterations>500000'))errors.push('Worker PBKDF2 configuration exceeds Cloudflare Workers supported limit')
if(errors.length){console.error('Production smoke checks failed:\n- '+errors.join('\n- '));process.exit(1)}
console.log('Static production smoke checks passed. This does not replace a build, live email test, database migration test, or end-to-end test.')
