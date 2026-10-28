export type Env = {
  DB?: D1Database
  R2?: R2Bucket
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  SUPPORT_EMAIL?: string
  APP_URL?: string
}
type UserRow = { id:string; email:string; name:string; role:string; password_hash:string|null; email_verified:number }
type PropertyRow = { id:string; slug:string; title:string; purpose:'sale'|'rent'; property_type:string; location:string; city:string; price:number; price_period:string|null; bedrooms:number; bathrooms:number; area:number; description:string; amenities_json:string; status:string; created_at:string; owner_id:string; owner_name?:string; favorite?:number }
const json = (body:unknown, status=200, extra:HeadersInit={}) => {
  const headers=new Headers(extra); headers.set('content-type','application/json; charset=utf-8'); headers.set('cache-control','no-store'); headers.set('x-content-type-options','nosniff')
  return new Response(JSON.stringify(body),{status,headers})
}
const ok=(data:unknown,status=200,extra:HeadersInit={})=>json({ok:true,data},status,extra)
const fail=(error:string,status=400)=>json({ok:false,error},status)
const uuid=()=>crypto.randomUUID()
const bytes=(n:number)=>crypto.getRandomValues(new Uint8Array(n))
const b64=(a:ArrayBuffer|Uint8Array)=>{const u=a instanceof Uint8Array?a:new Uint8Array(a);let s='';for(const x of u)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
const unb64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
const digest=async(s:string)=>b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))
const randomToken=()=>b64(bytes(32))
const nowIso=()=>new Date().toISOString()
const future=(minutes:number)=>new Date(Date.now()+minutes*60_000).toISOString()
const normalizeEmail=(s:string)=>s.trim().toLowerCase()
const clean=(v:unknown,max=500)=>typeof v==='string'?v.trim().slice(0,max):''
const safeInt=(v:unknown,min=0,max=100_000_000)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null}
const userView=(u:UserRow)=>({id:u.id,email:u.email,name:u.name,role:u.role,emailVerified:u.email_verified===1})
async function passwordHash(password:string) {
  const salt=bytes(16), iterations=120000
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits'])
  const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256)
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(derived)}`
}
async function verifyPassword(password:string,stored:string|null) {
  if(!stored)return false
  const [kind,iterationText,saltText,expected]=stored.split('$')
  const iterations=Number(iterationText)
  if(kind!=='pbkdf2'||!Number.isInteger(iterations)||iterations<10000||iterations>500000||!saltText||!expected)return false
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits'])
  const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(saltText),iterations},key,256))
  const target=unb64(expected)
  if(actual.length!==target.length)return false
  let mismatch=0;for(let i=0;i<actual.length;i++)mismatch|=actual[i]^target[i]
  return mismatch===0
}
function cookieToken(request:Request) {
  const header=request.headers.get('cookie')||''
  const found=header.split(';').map(x=>x.trim()).find(x=>x.startsWith('zh_session='))
  return found?decodeURIComponent(found.slice('zh_session='.length)):''
}
const sessionCookie=(token:string,maxAge:number)=>`zh_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
async function getUser(request:Request,env:Env):Promise<UserRow|null>{
  const token=cookieToken(request);if(!token||!env.DB)return null
  const row=await env.DB.prepare('SELECT u.id,u.email,u.name,u.role,u.password_hash,u.email_verified FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.email_verified=1').bind(await digest(token),nowIso()).first<UserRow>()
  return row??null
}
async function requireUser(request:Request,env:Env){const user=await getUser(request,env);return user}
async function sendEmail(env:Env,to:string,subject:string,html:string) {
  if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL)return false
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[to],subject,html})})
  return response.ok
}
function emailHtml(title:string,body:string,url:string,button:string) {
  const safeUrl=url.replace(/&/g,'&amp;').replace(/"/g,'&quot;')
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#182230;line-height:1.65"><p style="font-weight:700">ZameenHub</p><h1 style="font-size:26px">${title}</h1><p>${body}</p><p style="margin:28px 0"><a href="${safeUrl}" style="background:#2864dc;color:#fff;text-decoration:none;padding:13px 18px;border-radius:3px;display:inline-block">${button}</a></p><p style="font-size:12px;color:#647184">If you did not request this, you can ignore this email. Never share this link with anyone.</p><p style="font-size:12px;color:#647184">Support: ${envSupportPlaceholder}</p></div>`.replace('${envSupportPlaceholder}','dewifystores@gmail.com')
}
async function limited(db:D1Database,key:string,max=8,windowMinutes=15) {
  const keyHash=await digest(key), now=Date.now(), windowMs=windowMinutes*60_000
  const row=await db.prepare('SELECT window_started_at,request_count FROM auth_rate_limits WHERE key_hash=?').bind(keyHash).first<{window_started_at:string;request_count:number}>()
  if(!row||now-Date.parse(row.window_started_at)>windowMs) {
    await db.prepare('INSERT INTO auth_rate_limits(key_hash,window_started_at,request_count) VALUES(?,?,1) ON CONFLICT(key_hash) DO UPDATE SET window_started_at=excluded.window_started_at,request_count=1').bind(keyHash,nowIso()).run()
    return true
  }
  if(row.request_count>=max)return false
  await db.prepare('UPDATE auth_rate_limits SET request_count=request_count+1 WHERE key_hash=?').bind(keyHash).run()
  return true
}
async function authLimit(request:Request,db:D1Database,route:string,max=8) {
  const ip=request.headers.get('CF-Connecting-IP')||'unknown'
  return limited(db,route+':'+ip,max,15)
}
async function issueToken(db:D1Database,userId:string,purpose:'verify'|'activate',minutes=30) {
  const token=randomToken()
  await db.prepare('DELETE FROM email_verification_tokens WHERE user_id=? AND purpose=?').bind(userId,purpose).run()
  await db.prepare('INSERT INTO email_verification_tokens(id,user_id,token_hash,purpose,expires_at) VALUES(?,?,?,?,?)').bind(uuid(),userId,await digest(token),purpose,future(minutes)).run()
  return token
}
async function createSession(db:D1Database,userId:string) {
  const token=randomToken()
  await db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').bind(uuid(),userId,await digest(token),future(60*24*14)).run()
  return token
}
async function body(request:Request) {try {const v=await request.json() as unknown;return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null}catch{return null}}
function slugify(s:string){return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||uuid().slice(0,8)}
function propertyView(p:PropertyRow,images:string[]=[]) {
  return {id:p.id,slug:p.slug,title:p.title,location:p.location,city:p.city,purpose:p.purpose,propertyType:p.property_type,price:p.price,pricePeriod:p.price_period||undefined,bedrooms:p.bedrooms,bathrooms:p.bathrooms,area:p.area,areaUnit:'sq ft',image:images[0]||'',gallery:images,description:p.description,amenities:parseArray(p.amenities_json),status:p.status,verified:p.status==='published',favorite:!!p.favorite}
}
function parseArray(s:string){try{const a=JSON.parse(s);return Array.isArray(a)?a.filter(x=>typeof x==='string').slice(0,50):[]}catch{return []}}
async function propertyImages(db:D1Database,id:string) {
  const result=await db.prepare('SELECT object_key FROM property_images WHERE property_id=? ORDER BY sort_order ASC').bind(id).all<{object_key:string}>()
  // Image URLs are not emitted until a public R2 delivery URL is explicitly configured.
  return result.results.map(()=> '').filter(Boolean)
}
async function withProperty(db:D1Database,p:PropertyRow){return propertyView(p,await propertyImages(db,p.id))}
function sameOrigin(request:Request,url:URL) {
  const origin=request.headers.get('Origin')
  return !origin||origin===url.origin
}

export default { async fetch(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url), path=url.pathname, method=request.method.toUpperCase()
  if(!path.startsWith('/api/'))return new Response('Not found',{status:404})
  if(method==='OPTIONS')return new Response(null,{status:204,headers:{'Allow':'GET, POST, PATCH, DELETE, OPTIONS','Cache-Control':'no-store'}})
  if(method!=='GET'&&!sameOrigin(request,url))return fail('Request origin could not be validated.',403)
  if(path==='/api/health'&&method==='GET')return ok({service:'zameenhub-api'})
  if(!env.DB)return fail('Database is not configured for this environment.',503)
  const db=env.DB
  try {
    if(path==='/api/auth/session'&&method==='GET') {
      const user=await getUser(request,env)
      return ok(user?{authenticated:true,user:userView(user)}:{authenticated:false})
    }
    if(path==='/api/auth/logout'&&method==='POST') {
      const token=cookieToken(request)
      if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run()
      return ok({loggedOut:true},200,{'Set-Cookie':sessionCookie('',0)})
    }
    if(path==='/api/auth/register'&&method==='POST') {
      if(!await authLimit(request,db,'register',5))return fail('Too many attempts. Please wait before trying again.',429)
      const input=await body(request);if(!input)return fail('Invalid request body.')
      const name=clean(input.name,100),email=normalizeEmail(clean(input.email,254)),password=clean(input.password,128)
      if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8||password.length>128||input.acceptedTerms!==true)return fail('Enter your name and a valid email, choose a password of at least 8 characters, and accept the Terms.')
      let user=await db.prepare('SELECT id,email,name,role,password_hash,email_verified FROM users WHERE email=?').bind(email).first<UserRow>()
      if(user) {
        if(!user.password_hash) {
          const token=await issueToken(db,user.id,'activate',30)
          const link=`${env.APP_URL||url.origin}/activate-account?token=${encodeURIComponent(token)}`
          const sent=await sendEmail(env,email,'Activate your ZameenHub account',emailHtml('Secure your account','Set a password and verify your email to activate your existing ZameenHub account.',link,'Activate account'))
          return ok({message:sent?'We sent account activation instructions to your email.':'Email delivery is not configured yet. Please contact support at dewifystores@gmail.com.'})
        }
        return ok({message:'If you can register with this address, we will email the next steps. Try signing in or use password recovery.'})
      }
      const id=uuid(),hash=await passwordHash(password)
      await db.prepare('INSERT INTO users(id,email,name,role,password_hash,email_verified,terms_accepted_at) VALUES(?,?,?,"user",?,0,?)').bind(id,email,name,hash,nowIso()).run()
      const token=await issueToken(db,id,'verify',30)
      const link=`${env.APP_URL||url.origin}/verify-email?token=${encodeURIComponent(token)}`
      const sent=await sendEmail(env,email,'Verify your ZameenHub email',emailHtml('Confirm your email','Use the link below to verify your email address. It expires in 30 minutes.',link,'Verify email'))
      return ok({message:sent?'Account created. Check your inbox for the verification link.':'Your account was created, but email delivery is not configured. Contact dewifystores@gmail.com before trying to sign in.'},201)
    }
    if(path==='/api/auth/verify-email'&&method==='POST') {
      if(!await authLimit(request,db,'verify',8))return fail('Too many attempts. Please wait before trying again.',429)
      const input=await body(request),token=clean(input?.token,200);if(!token)return fail('Verification token is missing.')
      const tokenHash=await digest(token)
      const record=await db.prepare("SELECT user_id FROM email_verification_tokens WHERE token_hash=? AND purpose='verify' AND expires_at>?").bind(tokenHash,nowIso()).first<{user_id:string}>()
      if(!record)return fail('This verification link is invalid or expired. Request a new one.',400)
      await db.batch([
        db.prepare('UPDATE users SET email_verified=1,email_verified_at=?,updated_at=? WHERE id=?').bind(nowIso(),nowIso(),record.user_id),
        db.prepare('DELETE FROM email_verification_tokens WHERE user_id=?').bind(record.user_id)
      ])
      return ok({message:'Email verified. You can now sign in.'})
    }
    if(path==='/api/auth/activate-account'&&method==='POST') {
      if(!await authLimit(request,db,'activate',5))return fail('Too many attempts. Please wait before trying again.',429)
      const input=await body(request),token=clean(input?.token,200),password=clean(input?.password,128)
      if(password.length<8||password.length>128||input?.acceptedTerms!==true)return fail('Choose a password of at least 8 characters and accept the Terms.')
      const record=await db.prepare("SELECT user_id FROM email_verification_tokens WHERE token_hash=? AND purpose='activate' AND expires_at>?").bind(await digest(token),nowIso()).first<{user_id:string}>()
      if(!record)return fail('This activation link is invalid or expired. Request a new one.',400)
      const hash=await passwordHash(password)
      await db.batch([
        db.prepare('UPDATE users SET password_hash=?,email_verified=1,email_verified_at=?,terms_accepted_at=?,updated_at=? WHERE id=?').bind(hash,nowIso(),nowIso(),nowIso(),record.user_id),
        db.prepare('DELETE FROM email_verification_tokens WHERE user_id=?').bind(record.user_id)
      ])
      return ok({message:'Your account is activated. Sign in to continue.'})
    }
    if(path==='/api/auth/resend-verification'&&method==='POST') {
      if(!await authLimit(request,db,'resend',4))return fail('Too many requests. Please wait before trying again.',429)
      const input=await body(request),email=normalizeEmail(clean(input?.email,254))
      const user=await db.prepare('SELECT id,email,name,role,password_hash,email_verified FROM users WHERE email=?').bind(email).first<UserRow>()
      if(user&&!user.email_verified) {
        const purpose=user.password_hash?'verify':'activate'
        const token=await issueToken(db,user.id,purpose,30)
        const route=purpose==='verify'?'verify-email':'activate-account'
        const link=`${env.APP_URL||url.origin}/${route}?token=${encodeURIComponent(token)}`
        await sendEmail(env,email,purpose==='verify'?'Verify your ZameenHub email':'Activate your ZameenHub account',emailHtml('Finish setting up ZameenHub','Use this one-time link to continue. It expires in 30 minutes.',link,'Continue'))
      }
      return ok({message:'If this address needs verification or activation, instructions will be sent shortly.'})
    }
    if(path==='/api/auth/login'&&method==='POST') {
      if(!await authLimit(request,db,'login',8))return fail('Too many sign-in attempts. Please wait and try again.',429)
      const input=await body(request),email=normalizeEmail(clean(input?.email,254)),password=clean(input?.password,128)
      const user=await db.prepare('SELECT id,email,name,role,password_hash,email_verified FROM users WHERE email=?').bind(email).first<UserRow>()
      const valid=await verifyPassword(password,user?.password_hash||null)
      if(!user||!valid)return fail('Email or password is incorrect.',401)
      if(user.email_verified!==1)return fail('Please verify your email before signing in. Use the resend verification option if needed.',403)
      const token=await createSession(db,user.id)
      return ok({user:userView(user)},200,{'Set-Cookie':sessionCookie(token,60*24*14)})
    }
    if(path==='/api/auth/forgot-password'&&method==='POST') {
      if(!await authLimit(request,db,'forgot',4))return fail('Too many requests. Please wait before trying again.',429)
      const input=await body(request),email=normalizeEmail(clean(input?.email,254))
      const user=await db.prepare('SELECT id,email,name,role,password_hash,email_verified FROM users WHERE email=?').bind(email).first<UserRow>()
      if(user?.password_hash&&user.email_verified) {
        const token=randomToken()
        await db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').bind(user.id).run()
        await db.prepare('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').bind(uuid(),user.id,await digest(token),future(30)).run()
        const link=`${env.APP_URL||url.origin}/reset-password?token=${encodeURIComponent(token)}`
        await sendEmail(env,email,'Reset your ZameenHub password',emailHtml('Reset your password','This one-time link expires in 30 minutes. If you did not request it, ignore this email.',link,'Reset password'))
      }
      return ok({message:'If a verified account matches that address, password-reset instructions will be sent shortly.'})
    }
    if(path==='/api/auth/reset-password'&&method==='POST') {
      if(!await authLimit(request,db,'reset',5))return fail('Too many attempts. Please wait before trying again.',429)
      const input=await body(request),token=clean(input?.token,200),password=clean(input?.password,128)
      if(password.length<8||password.length>128)return fail('Choose a password between 8 and 128 characters.')
      const record=await db.prepare('SELECT user_id FROM password_reset_tokens WHERE token_hash=? AND expires_at>?').bind(await digest(token),nowIso()).first<{user_id:string}>()
      if(!record)return fail('This password-reset link is invalid or expired. Request a new one.',400)
      const hash=await passwordHash(password)
      await db.batch([
        db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').bind(hash,nowIso(),record.user_id),
        db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').bind(record.user_id),
        db.prepare('DELETE FROM sessions WHERE user_id=?').bind(record.user_id)
      ])
      return ok({message:'Password updated. All existing sessions have been signed out; sign in with your new password.'})
    }
    if(path==='/api/properties'&&method==='GET') {
      const q=clean(url.searchParams.get('q'),120),purpose=clean(url.searchParams.get('purpose'),8),type=clean(url.searchParams.get('type'),40),beds=safeInt(url.searchParams.get('beds'),0,100),sort=url.searchParams.get('sort')
      let sql="SELECT p.* FROM properties p WHERE p.status='published'",args:unknown[]=[]
      if(q){sql+=' AND (p.location LIKE ? OR p.city LIKE ? OR p.title LIKE ?)';const term='%'+q.replace(/[%_]/g,'')+'%';args.push(term,term,term)}
      if(purpose==='sale'||purpose==='rent'){sql+=' AND p.purpose=?';args.push(purpose)}
      if(type){sql+=' AND p.property_type=?';args.push(type)}
      if(beds!==null&&beds>0){sql+=' AND p.bedrooms>=?';args.push(beds)}
      sql+=sort==='price-asc'?' ORDER BY p.price ASC':sort==='price-desc'?' ORDER BY p.price DESC':' ORDER BY p.created_at DESC'
      sql+=' LIMIT 100'
      const result=await db.prepare(sql).bind(...args).all<PropertyRow>()
      return ok(await Promise.all(result.results.map(p=>withProperty(db,p))))
    }
    const detailMatch=path.match(/^\/api\/properties\/([^/]+)$/)
    if(detailMatch&&method==='GET') {
      const slug=decodeURIComponent(detailMatch[1])
      const p=await db.prepare("SELECT * FROM properties WHERE slug=? AND status='published'").bind(slug).first<PropertyRow>()
      if(!p)return fail('Property not found or no longer available.',404)
      return ok(await withProperty(db,p))
    }
    if(path==='/api/properties'&&method==='POST') {
      const user=await requireUser(request,env)
      if(!user)return fail('Sign in with a verified email before listing a property.',401)
      const input=await body(request);if(!input)return fail('Invalid listing request.')
      const title=clean(input.title,120),location=clean(input.location,240),city=clean(input.city,100),purpose=clean(input.purpose,8),propertyType=clean(input.propertyType,40),description=clean(input.description,8000)
      const price=safeInt(input.price,1,1_000_000_000),bedrooms=safeInt(input.bedrooms,0,100),bathrooms=safeInt(input.bathrooms,0,100),area=safeInt(input.area,0,100_000_000)
      if(title.length<6||!location||!city||!['sale','rent'].includes(purpose)||!['Apartment','House','Villa','Studio','Plot'].includes(propertyType)||price===null||bedrooms===null||bathrooms===null||area===null||description.length<20)return fail('Complete all required fields with valid values. Description must be at least 20 characters.')
      const id=uuid(),slug=`${slugify(title)}-${id.slice(0,8)}`
      await db.prepare("INSERT INTO properties(id,owner_id,slug,title,purpose,property_type,location,city,price,bedrooms,bathrooms,area,description,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')").bind(id,user.id,slug,title,purpose,propertyType,location,city,price,bedrooms,bathrooms,area,description).run()
      return ok({id,status:'pending'},201)
    }
    if(path==='/api/my/properties'&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to view your listings.',401)
      const result=await db.prepare('SELECT * FROM properties WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all<PropertyRow>()
      return ok(result.results.map(p=>propertyView(p,[])))
    }
    if(path==='/api/favorites'&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to view saved properties.',401)
      const result=await db.prepare("SELECT p.*,1 AS favorite FROM favorites f JOIN properties p ON p.id=f.property_id WHERE f.user_id=? AND p.status='published' ORDER BY f.created_at DESC LIMIT 100").bind(user.id).all<PropertyRow>()
      return ok(await Promise.all(result.results.map(p=>withProperty(db,p))))
    }
    const favoriteMatch=path.match(/^\/api\/favorites\/([^/]+)$/)
    if(favoriteMatch) {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to save properties.',401)
      const id=decodeURIComponent(favoriteMatch[1])
      if(method==='GET') {
        const row=await db.prepare("SELECT 1 AS saved FROM favorites f JOIN properties p ON p.id=f.property_id WHERE f.user_id=? AND f.property_id=? AND p.status='published'").bind(user.id,id).first<{saved:number}>()
        return ok({saved:!!row})
      }
      if(method==='POST') {
        const p=await db.prepare("SELECT id FROM properties WHERE id=? AND status='published'").bind(id).first<{id:string}>();if(!p)return fail('Property not found.',404)
        await db.prepare('INSERT OR IGNORE INTO favorites(user_id,property_id) VALUES(?,?)').bind(user.id,id).run()
        return ok({saved:true})
      }
      if(method==='DELETE') {await db.prepare('DELETE FROM favorites WHERE user_id=? AND property_id=?').bind(user.id,id).run();return ok({saved:false})}
    }
    if(path==='/api/admin/review-queue'&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to review listings.',403)
      const result=await db.prepare("SELECT * FROM properties WHERE status='pending' ORDER BY created_at ASC LIMIT 100").all<PropertyRow>()
      return ok(result.results.map(p=>propertyView(p,[])))
    }
    const reviewMatch=path.match(/^\/api\/admin\/properties\/([^/]+)$/)
    if(reviewMatch&&method==='PATCH') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to review listings.',403)
      const input=await body(request),status=clean(input?.status,20)
      if(status!=='published'&&status!=='rejected')return fail('Unsupported review status.')
      const result=await db.prepare("UPDATE properties SET status=?,updated_at=? WHERE id=? AND status='pending'").bind(status,nowIso(),decodeURIComponent(reviewMatch[1])).run()
      if(!result.meta.changes)return fail('Listing was not pending or could not be found.',404)
      return ok({status})
    }
    if(path==='/api/inquiries'&&method==='POST') {
      if(!await authLimit(request,db,'inquiry',12))return fail('Too many requests. Please wait and try again.',429)
      const input=await body(request),propertyId=clean(input?.propertyId,80),message=clean(input?.message,4000),email=normalizeEmail(clean(input?.email,254))
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||message.length<12)return fail('Enter a valid email and a message of at least 12 characters.')
      const property=await db.prepare("SELECT p.id,p.owner_id,p.title,u.email AS owner_email FROM properties p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND p.status='published'").bind(propertyId).first<{id:string;owner_id:string;title:string;owner_email:string}>()
      if(!property)return fail('This property is no longer available.',404)
      const sender=await getUser(request,env),reference=uuid()
      await db.prepare("INSERT INTO inquiries(id,property_id,sender_id,email,message,status) VALUES(?,?,?,?,?,'new')").bind(reference,propertyId,sender?.id||null,email,message).run()
      const sent=await sendEmail(env,property.owner_email,'New inquiry about your ZameenHub listing',emailHtml('A new property inquiry',`Someone has asked about “${property.title.replace(/[<>]/g,'') }”. Reply to the sender at ${email.replace(/[<>]/g,'')}. Message: ${message.replace(/[<>]/g,'')}`,env.APP_URL||url.origin,'Open ZameenHub'))
      return ok({reference,notificationSent:sent},201)
    }
    if(path==='/api/support'&&method==='POST') {
      if(!await authLimit(request,db,'support',8))return fail('Too many requests. Please wait and try again.',429)
      const input=await body(request),email=normalizeEmail(clean(input?.email,254)),message=clean(input?.message,4000)
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||message.length<12)return fail('Enter a valid email and a message of at least 12 characters.')
      const sent=await sendEmail(env,env.SUPPORT_EMAIL||'dewifystores@gmail.com','ZameenHub support request',emailHtml('Support request',`From: ${email.replace(/[<>]/g,'')}<br><br>${message.replace(/[<>]/g,'')}`,env.APP_URL||url.origin,'Open support site'))
      if(!sent)return fail('Support email could not be delivered. Please email dewifystores@gmail.com directly.',503)
      return ok({message:'Your support request was sent. We will follow up at the email you provided.'},201)
    }
    return fail('Route not found.',404)
  } catch(error) {
    console.error('ZameenHub API error',error instanceof Error?error.message:'unknown error')
    return fail('The service could not complete this request. Please try again.',500)
  }
} }
