import { base32Encode, matchedTotpCounter } from './totp'
import { DOCUMENT_TYPE_LABELS, detectDocumentFormat, isPropertyDocumentRole, isPropertyDocumentType, MAX_PROPERTY_DOCUMENT_BYTES, MAX_PROPERTY_DOCUMENTS_PER_PROPERTY, sanitizeDocumentFileName, sanitizeDocumentLabel } from './property-documents'
export type Env = {
  DB?: D1Database
  R2?: R2Bucket
  MFA_ENCRYPTION_KEY?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  SUPPORT_EMAIL?: string
  APP_URL?: string
}
type UserRow = { id:string; email:string; name:string; role:string; password_hash:string|null; email_verified:number; profile_image_url?:string|null; mfa_enabled?:number; mfa_secret_ciphertext?:string|null; mfa_pending_secret_ciphertext?:string|null; mfa_pending_expires_at?:string|null; mfa_last_counter?:number }
type PropertyRow = { id:string; slug:string; title:string; purpose:'sale'|'rent'; property_type:string; location:string; city:string; price:number; price_period:string|null; bedrooms:number; bathrooms:number; area:number; description:string; amenities_json:string; status:string; created_at:string; updated_at?:string; owner_id:string; owner_name?:string; owner_profile_image_url?:string|null; favorite?:number; ai_risk_level?:string; ai_risk_score?:number; ai_risk_reasons_json?:string; ai_screened_at?:string|null; ai_model?:string; verification_status?:string; verification_evidence_type?:string; verification_evidence_url?:string; verification_submitted_at?:string|null; verification_reviewed_at?:string|null; verification_reviewed_by?:string|null; verification_note?:string }
type PropertyDocumentRow = {id:string;property_id:string;owner_id:string;document_role:'private_original'|'public_copy';document_type:string;display_label:string;file_extension:string;content_type:string;size_bytes:number;sha256:string;object_key:string;possible_duplicate:number;visibility:'private'|'public'|'withdrawn';processing_status:'stored'|'unavailable';review_status:'pending'|'reviewed'|'inconclusive';public_review_summary:string;submitted_at:string;published_at:string|null;withdrawn_at:string|null;reviewed_at:string|null;reviewer_id:string|null;review_note:string;last_actor_id:string|null;updated_at:string}
const json = (body:unknown, status=200, extra:HeadersInit={}) => {
  const headers=new Headers(extra)
  headers.set('content-type','application/json; charset=utf-8')
  headers.set('cache-control','no-store')
  headers.set('x-content-type-options','nosniff')
  headers.set('x-frame-options','DENY')
  headers.set('referrer-policy','strict-origin-when-cross-origin')
  headers.set('permissions-policy','camera=(), microphone=(), geolocation=()')
  headers.set('cross-origin-opener-policy','same-origin')
  headers.set('strict-transport-security','max-age=31536000')
  return new Response(JSON.stringify(body),{status,headers})
}
const ok=(data:unknown,status=200,extra:HeadersInit={})=>json({ok:true,data},status,extra)
const okWithCookies=(data:unknown,status:number,cookies:string[])=>{
  const headers=new Headers()
  for(const cookie of cookies)headers.append('Set-Cookie',cookie)
  return ok(data,status,headers)
}
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
function safeNextPath(value:unknown){const s=clean(value,500);if(!s.startsWith('/')||s.startsWith('//')||s.includes('\\'))return '';try{const u=new URL(s,'https://zameenhub.invalid');return u.origin==='https://zameenhub.invalid'?u.pathname+u.search+u.hash:''}catch{return ''}}
const clean=(v:unknown,max=500)=>typeof v==='string'?v.trim().slice(0,max):''
const passwordValue=(v:unknown)=>typeof v==='string'?v:''
const safeInt=(v:unknown,min=0,max=100_000_000)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null}
const userView=(u:UserRow)=>({id:u.id,email:u.email,name:u.name,role:u.role,emailVerified:u.email_verified===1,mfaEnabled:u.mfa_enabled===1,profileImageUrl:u.profile_image_url||''})
async function passwordHash(password:string) {
  const salt=bytes(16), iterations=100000
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits'])
  const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256)
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(derived)}`
}
async function verifyPassword(password:string,stored:string|null) {
  if(!stored||password.length<8||password.length>128)return false
  const [kind,iterationText,saltText,expected]=stored.split('$')
  const iterations=Number(iterationText)
  if(kind!=='pbkdf2'||!Number.isInteger(iterations)||iterations<10000||iterations>100000||!saltText||!expected)return false
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits'])
  const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(saltText),iterations},key,256))
  const target=unb64(expected)
  if(actual.length!==target.length)return false
  let mismatch=0;for(let i=0;i<actual.length;i++)mismatch|=actual[i]^target[i]
  return mismatch===0
}
async function encryptionKey(env:Env) {
  if(!env.MFA_ENCRYPTION_KEY||env.MFA_ENCRYPTION_KEY.length<32)throw new Error('MFA_ENCRYPTION_KEY must be configured as a 32-character-or-longer Cloudflare secret')
  const material=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.MFA_ENCRYPTION_KEY))
  return crypto.subtle.importKey('raw',material,{name:'AES-GCM'},false,['encrypt','decrypt'])
}
async function encryptMfaSecret(secret:string,env:Env) {
  const key=await encryptionKey(env),iv=bytes(12)
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(secret)))
  const packed=new Uint8Array(iv.length+ciphertext.length);packed.set(iv);packed.set(ciphertext,iv.length)
  return b64(packed)
}
async function decryptMfaSecret(packedValue:string,env:Env) {
  const packed=unb64(packedValue)
  if(packed.length<29)throw new Error('Invalid encrypted MFA secret')
  const key=await encryptionKey(env),iv=packed.slice(0,12),ciphertext=packed.slice(12)
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ciphertext)
  return new TextDecoder().decode(clear)
}
async function verifyMfaCode(db:D1Database,user:UserRow,code:unknown,env:Env) {
  if(user.mfa_enabled!==1)return false
  const normalized=clean(code,40).replace(/[\s-]/g,'').toUpperCase()
  // Recovery codes are independently hashed and must remain usable if the
  // authenticator encryption key is accidentally lost or unavailable.
  if(/^[A-F0-9]{24}$/.test(normalized)){
    const backup=await db.prepare('SELECT id FROM mfa_recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL').bind(user.id,await digest(normalized)).first<{id:string}>()
    if(backup){
      const consumed=await db.prepare('UPDATE mfa_recovery_codes SET used_at=? WHERE id=? AND used_at IS NULL').bind(nowIso(),backup.id).run()
      if(consumed.meta.changes===1)return true
    }
  }
  if(!user.mfa_secret_ciphertext||!env.MFA_ENCRYPTION_KEY)return false
  const secret=await decryptMfaSecret(user.mfa_secret_ciphertext,env)
  const counter=await matchedTotpCounter(secret,normalized)
  if(counter===null||counter<=Number(user.mfa_last_counter||0))return false
  const consumed=await db.prepare('UPDATE users SET mfa_last_counter=?,updated_at=? WHERE id=? AND COALESCE(mfa_last_counter,0)<?').bind(counter,nowIso(),user.id,counter).run()
  return consumed.meta.changes===1
}
function requestCookie(request:Request,name:string) {
  const prefix=name+'='
  const found=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(prefix))
  return found?found.slice(prefix.length):''
}
function cookieToken(request:Request) { return requestCookie(request,'zh_session') }
const sessionCookie=(token:string,maxAge:number)=>`zh_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
const mfaChallengeCookie=(token:string,maxAge:number)=>`zh_mfa=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
async function getUser(request:Request,env:Env):Promise<UserRow|null>{
  const token=cookieToken(request);if(!token||!env.DB)return null
  const row=await env.DB.prepare('SELECT u.id,u.email,u.name,u.role,u.password_hash,u.email_verified,u.profile_image_url,u.mfa_enabled,u.mfa_secret_ciphertext,u.mfa_last_counter FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.email_verified=1').bind(await digest(token),nowIso()).first<UserRow>()
  return row??null
}
async function requireUser(request:Request,env:Env){const user=await getUser(request,env);return user}
async function sendEmail(env:Env,to:string,subject:string,html:string,text:string) {
  if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL)return false
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[to],subject,html,text})})
    return response.ok
  } catch {
    return false
  }
}
const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
function emailHtml(title:string,body:string,url:string,button:string) {
  const safeUrl=escapeHtml(url)
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#182230"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff"><tr><td style="padding:32px 28px;line-height:1.6"><p style="margin:0 0 20px;font-weight:700;font-size:17px;color:#182230">ZameenHub</p><h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#182230">${escapeHtml(title)}</h1><p style="margin:0 0 24px;white-space:pre-line;color:#445164">${escapeHtml(body)}</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr><td align="center" bgcolor="#2864dc" style="background:#2864dc;border-radius:4px"><a href="${safeUrl}" target="_blank" style="display:inline-block;padding:14px 22px;color:#ffffff !important;text-decoration:none;font-weight:700;font-size:15px;border-radius:4px" rel="noopener noreferrer">${escapeHtml(button)}</a></td></tr></table><p style="margin:18px 0 6px;font-size:13px;color:#647184">If the button does not work, copy and open this link in your browser:</p><p style="margin:0 0 24px;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word"><a href="${safeUrl}" target="_blank" style="color:#1746a2;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all" rel="noopener noreferrer">${safeUrl}</a></p><p style="margin:0;font-size:12px;line-height:1.6;color:#647184">If you did not request this, you can ignore this email. Never share this link with anyone.</p><p style="margin:10px 0 0;font-size:12px;color:#647184">Support: dewifystores@gmail.com</p></td></tr></table></td></tr></table></body></html>`
}
function emailText(title:string,body:string,url:string,button:string) {
  return `ZameenHub\n\n${title}\n\n${body}\n\n${button}:\n${url}\n\nIf you did not request this, you can ignore this email. Never share this link with anyone.\n\nSupport: dewifystores@gmail.com`
}
async function limited(db:D1Database,key:string,max=8,windowMinutes=15) {
  const keyHash=await digest(key), now=Date.now(), current=nowIso()
  const cutoff=new Date(now-windowMinutes*60_000).toISOString()
  // Increment and check in one SQLite statement. The former SELECT-then-UPDATE
  // approach allowed parallel requests to all pass against the same stale count.
  const row=await db.prepare(`INSERT INTO auth_rate_limits(key_hash,window_started_at,request_count)
    VALUES(?,?,1)
    ON CONFLICT(key_hash) DO UPDATE SET
      window_started_at=CASE WHEN auth_rate_limits.window_started_at<=? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END,
      request_count=CASE WHEN auth_rate_limits.window_started_at<=? THEN 1 ELSE auth_rate_limits.request_count+1 END
    RETURNING request_count`).bind(keyHash,current,cutoff,cutoff).first<{request_count:number}>()
  // The keys are hashed and contain no request payloads; remove old windows
  // occasionally so arbitrary email/IP attempts cannot grow this table forever.
  if(bytes(1)[0]<2) {
    const old=new Date(now-7*24*60*60_000).toISOString()
    await db.prepare('DELETE FROM auth_rate_limits WHERE window_started_at<?').bind(old).run()
  }
  return !!row&&row.request_count<=max
}
async function authLimit(request:Request,db:D1Database,route:string,max=8) {
  const ip=request.headers.get('CF-Connecting-IP')||'unknown'
  return limited(db,route+':'+ip,max,15)
}
async function issueToken(db:D1Database,userId:string,purpose:'verify'|'activate',minutes=30) {
  const token=randomToken()
  await db.batch([
    db.prepare('DELETE FROM email_verification_tokens WHERE user_id=? AND purpose=?').bind(userId,purpose),
    db.prepare('INSERT INTO email_verification_tokens(id,user_id,token_hash,purpose,expires_at) VALUES(?,?,?,?,?)').bind(uuid(),userId,await digest(token),purpose,future(minutes))
  ])
  return token
}
async function createSession(db:D1Database,userId:string) {
  const token=randomToken()
  await db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').bind(uuid(),userId,await digest(token),future(60*24*14)).run()
  return token
}
async function body(request:Request) {
  try {
    const declared=Number(request.headers.get('content-length')||0)
    if(Number.isFinite(declared)&&declared>32768)return null
    const reader=request.body?.getReader()
    if(!reader)return null
    const chunks:Uint8Array[]=[]
    let total=0
    while(true) {
      const {done,value}=await reader.read()
      if(done)break
      total+=value.byteLength
      if(total>32768) {
        await reader.cancel('Request body exceeds the 32 KiB limit').catch(()=>{})
        return null
      }
      chunks.push(value)
    }
    const buffer=new Uint8Array(total)
    let offset=0
    for(const chunk of chunks) {
      buffer.set(chunk,offset)
      offset+=chunk.byteLength
    }
    const raw=new TextDecoder('utf-8',{fatal:true}).decode(buffer)
    const value=JSON.parse(raw) as unknown
    return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null
  } catch { return null }
}
async function readCappedBytes(request:Request,limit:number):Promise<{bytes?:Uint8Array;error?:'missing'|'too-large'|'invalid'}> {
 const declared=request.headers.get('content-length')
 if(declared&&/^\d+$/.test(declared)&&Number(declared)>limit){await request.body?.cancel('File too large').catch(()=>{});return {error:'too-large'}}
 const reader=request.body?.getReader();if(!reader)return {error:'missing'}
 try{const chunks:Uint8Array[]=[];let total=0
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength
   if(total>limit){await reader.cancel('File too large').catch(()=>{});return {error:'too-large'}}
   chunks.push(value)}
  if(total===0)return {error:'missing'}
  const buffer=new Uint8Array(total);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength}return {bytes:buffer}
 }catch{return {error:'invalid'}}
}
function decodeDocumentHeader(value:string|null):string|null{if(value===null)return null;try{return decodeURIComponent(value)}catch{return null}}
async function sha256Hex(value:Uint8Array):Promise<string>{const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',value));return [...hash].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
async function flushDocumentObjectCleanup(db:D1Database,bucket?:R2Bucket){
 if(!bucket)return
 try{const pending=await db.prepare('SELECT object_key FROM property_document_object_cleanup ORDER BY created_at ASC LIMIT 25').all<{object_key:string}>()
  for(const row of pending.results){try{await bucket.delete(row.object_key);await db.prepare('DELETE FROM property_document_object_cleanup WHERE object_key=?').bind(row.object_key).run()}catch{/* keep cleanup key queued; never log object keys */}}
 }catch{/* do not serve objects without public metadata; retain cleanup keys for retry */}
}
function slugify(s:string){return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||uuid().slice(0,8)}
function propertyView(p:PropertyRow,images:string[]=[],videoUrl='',includePrivateVerification=false) {
  const verificationStatus=p.verification_status||'unverified'
  return {
    id:p.id,slug:p.slug,title:p.title,location:p.location,city:p.city,purpose:p.purpose,
    propertyType:p.property_type,price:p.price,pricePeriod:p.price_period||undefined,
    bedrooms:p.bedrooms,bathrooms:p.bathrooms,area:p.area,areaUnit:'sq ft',
    image:images[0]||'',gallery:images,videoUrl:videoUrl||'',description:p.description,
    amenities:parseArray(p.amenities_json),status:p.status,
    verified:verificationStatus==='verified',
    verificationStatus:includePrivateVerification?verificationStatus:(verificationStatus==='verified'?'verified':'unverified'),
    ownerName:p.owner_name||'',ownerProfileImageUrl:p.owner_profile_image_url||'',
    favorite:!!p.favorite,
    ...(includePrivateVerification ? {
      verificationEvidenceType:p.verification_evidence_type||'none',
      verificationEvidenceUrl:p.verification_evidence_url||'',
      verificationSubmittedAt:p.verification_submitted_at||undefined,
      verificationReviewedAt:p.verification_reviewed_at||undefined,
      verificationNote:p.verification_note||''
    } : {}),
  }
}
function parseArray(s:string){try{const a=JSON.parse(s);return Array.isArray(a)?a.filter(x=>typeof x==='string').slice(0,50):[]}catch{return []}}
const allowedAmenityNames=new Set(['Parking','Lift','Power backup','Security','Balcony','Garden','Gym','Swimming pool','Clubhouse','Furnished','Pet-friendly'])
function sanitizeAmenities(value:unknown):string[]{
  if(!Array.isArray(value))return []
  return [...new Set(value.filter((item):item is string=>typeof item==='string').map(item=>clean(item,40)).filter(item=>allowedAmenityNames.has(item)))].slice(0,11)
}
function normalizeHttpsUrl(value:unknown,max=1500):string|null {
  if(typeof value!=='string'||value.length>max)return null
  const raw=clean(value,max)
  if(!raw||raw.length>max)return null
  try {
    const parsed=new URL(raw)
    const host=parsed.hostname.toLowerCase()
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||!host||!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)||host.includes(':'))return null
    return parsed.toString()
  } catch { return null }
}
function sanitizeImageUrls(value:unknown):string[]|null {
  if(value===undefined||value===null)return []
  if(!Array.isArray(value)||value.length>5)return null
  const urls:string[]=[]
  for(const item of value) {
    if(typeof item!=='string'||item.length>1500)return null
    const raw=clean(item,1500)
    if(!raw)continue
    const normalized=normalizeHttpsUrl(raw,1500)
    if(!normalized)return null
    if(!urls.includes(normalized))urls.push(normalized)
  }
  return urls.length<=5?urls:null
}
function sanitizeVideoUrl(value:unknown):string|null {
  if(value===undefined||value===null||value==='')return ''
  if(typeof value!=='string'||value.length>1500)return null
  const raw=clean(value,1500)
  if(!raw)return ''
  const normalized=normalizeHttpsUrl(raw,1500)
  if(!normalized)return null
  try {
    const parsed=new URL(normalized),host=parsed.hostname.toLowerCase(),path=parsed.pathname.toLowerCase()
    const hostedVideo=host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com')||host==='youtube-nocookie.com'||host.endsWith('.youtube-nocookie.com')||host==='vimeo.com'||host.endsWith('.vimeo.com')
    const directVideo=/\.(mp4|webm|ogg|m3u8)$/.test(path)
    return hostedVideo||directVideo?normalized:null
  } catch { return null }
}
const verificationEvidenceTypes=new Set(['none','official_record','property_tax_record','registry_reference','other_public_record'])
function sanitizeVerificationEvidence(input:Record<string,unknown>):{type:string;url:string;status:'unverified'|'submitted';submittedAt:string|null}|null {
  const rawType=clean(input.verificationEvidenceType,40)||'none'
  if(typeof input.verificationEvidenceUrl==='string'&&input.verificationEvidenceUrl.length>1500)return null
  if(input.verificationEvidenceUrl!==undefined&&input.verificationEvidenceUrl!==null&&typeof input.verificationEvidenceUrl!=='string')return null
  const rawUrl=clean(input.verificationEvidenceUrl,1500)
  if(!verificationEvidenceTypes.has(rawType))return null
  if(!rawUrl&&rawType==='none')return {type:'none',url:'',status:'unverified',submittedAt:null}
  const normalized=normalizeHttpsUrl(rawUrl,1500)
  if(rawType==='none'||!normalized)return null
  return {type:rawType,url:normalized,status:'submitted',submittedAt:nowIso()}
}
function mediaInsertStatements(db:D1Database,id:string,images:string[],videoUrl:string):D1PreparedStatement[] {
  const statements:D1PreparedStatement[]=[]
  images.forEach((mediaUrl,index)=>statements.push(db.prepare("INSERT INTO property_media(id,property_id,media_type,media_url,alt_text,sort_order) VALUES(?,?,'image',?,?,?)").bind(uuid(),id,mediaUrl,'Property image '+(index+1),index)))
  if(videoUrl)statements.push(db.prepare("INSERT INTO property_media(id,property_id,media_type,media_url,alt_text,sort_order) VALUES(?,?,'video',?,'Property video',0)").bind(uuid(),id,videoUrl))
  return statements
}
async function savePropertyMedia(db:D1Database,id:string,images:string[],videoUrl:string) {
  await db.batch([db.prepare('DELETE FROM property_media WHERE property_id=?').bind(id),...mediaInsertStatements(db,id,images,videoUrl)])
}
async function propertyMedia(db:D1Database,id:string) {
  const result=await db.prepare('SELECT media_type,media_url FROM property_media WHERE property_id=? ORDER BY sort_order ASC').bind(id).all<{media_type:string;media_url:string}>()
  const rows=result.results
  return {images:rows.filter(row=>row.media_type==='image').slice(0,5).map(row=>row.media_url),videoUrl:rows.find(row=>row.media_type==='video')?.media_url||''}
}
async function withProperty(db:D1Database,p:PropertyRow,includePrivateVerification=false) {
  const media=await propertyMedia(db,p.id)
  return propertyView(p,media.images,media.videoUrl,includePrivateVerification)
}
function sameOrigin(request:Request,url:URL) {
  return request.headers.get('Origin')===url.origin
}

export default {
  async scheduled(_controller:ScheduledController,env:Env):Promise<void> {
    if(env.DB)await flushDocumentObjectCleanup(env.DB,env.R2)
  },
  async fetch(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url), path=url.pathname, method=request.method.toUpperCase()
  if(!path.startsWith('/api/'))return new Response('Not found',{status:404})
  if(method==='OPTIONS')return new Response(null,{status:204,headers:{'Allow':'GET, POST, PATCH, DELETE, OPTIONS','Cache-Control':'no-store'}})
  if(method!=='GET'&&!sameOrigin(request,url))return fail('Request origin could not be validated.',403)
  if(path==='/api/health'&&method==='GET') {
    if(!env.DB)return fail('Service unavailable.',503)
    try {
      const health=await env.DB.prepare('SELECT 1 AS ready').first<{ready:number}>()
      if(health?.ready!==1)return fail('Service unavailable.',503)
      return ok({service:'zameenhub-api',database:'ready'})
    } catch {
      return fail('Service unavailable.',503)
    }
  }
  if(!env.DB)return fail('Database is not configured for this environment.',503)
  const db=env.DB
  try {
    if(path==='/api/auth/session'&&method==='GET') {
      const user=await getUser(request,env)
      return ok(user?{authenticated:true,user:userView(user)}:{authenticated:false})
    }
    if(path==='/api/auth/mfa/status'&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in before checking two-factor setup.',401)
      return ok({enabled:user.mfa_enabled===1,configured:typeof env.MFA_ENCRYPTION_KEY==='string'&&env.MFA_ENCRYPTION_KEY.length>=32})
    }
    if(path==='/api/auth/logout'&&method==='POST') {
      const token=cookieToken(request)
      if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run()
      const challenge=requestCookie(request,'zh_mfa')
      if(challenge)await db.prepare('DELETE FROM auth_mfa_challenges WHERE token_hash=?').bind(await digest(challenge)).run()
      return okWithCookies({loggedOut:true},200,[sessionCookie('',0),mfaChallengeCookie('',0)])
    }
    if(path==='/api/auth/register'&&method==='POST') {
      const registrationMessage='If this address can be registered, check your inbox for any next steps. If no email arrives, try signing in or password recovery, or contact dewifystores@gmail.com. Email delivery depends on service configuration.'
      if(!await authLimit(request,db,'register',5))return fail('Too many attempts. Please wait before trying again.',429)
      const input=await body(request);if(!input)return fail('Invalid request body.')
      const nextPath=safeNextPath(input.next)
      const name=clean(input.name,100),email=normalizeEmail(clean(input.email,254)),password=passwordValue(input.password)
      if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8||password.length>128||input.acceptedTerms!==true)return fail('Enter your name and a valid email, choose a password of at least 8 characters, and accept the Terms.')
      if(!await limited(db,'register-email:'+email,3,60))return fail('Too many account setup requests for this email. Please wait before trying again.',429)

      // Do the same password-hash work for new and existing addresses, and
      // return the same status/message so sign-up cannot be used to enumerate accounts.
      const hash=await passwordHash(password)
      const user=await db.prepare('SELECT id,email,name,role,password_hash,email_verified FROM users WHERE email=?').bind(email).first<UserRow>()
      if(user) {
        if(!user.password_hash) {
          const token=await issueToken(db,user.id,'activate',30)
          const link=`${env.APP_URL||url.origin}/activate-account?token=${encodeURIComponent(token)}${nextPath?'&next='+encodeURIComponent(nextPath):''}`
          await sendEmail(env,email,'Activate your ZameenHub account',emailHtml('Secure your account','Set a password and verify your email to activate your existing ZameenHub account.',link,'Activate account'),emailText('Secure your account','Set a password and verify your email to activate your existing ZameenHub account.',link,'Activate account'))
          return ok({message:registrationMessage})
        }
        if(user.email_verified!==1) {
          const token=await issueToken(db,user.id,'verify',30)
          const link=`${env.APP_URL||url.origin}/verify-email?token=${encodeURIComponent(token)}${nextPath?'&next='+encodeURIComponent(nextPath):''}`
          await sendEmail(env,email,'Verify your ZameenHub email',emailHtml('Confirm your email','Use the link below to verify your email address. It expires in 30 minutes.',link,'Verify email'),emailText('Confirm your email','Use the link below to verify your email address. It expires in 30 minutes.',link,'Verify email'))
          return ok({message:registrationMessage})
        }
        const appBase=env.APP_URL||url.origin
        const signInUrl=`${appBase.endsWith('/')?appBase.slice(0,-1):appBase}/login`
        const helpTitle='Sign in to ZameenHub'
        const helpBody='A request was made to create or access a ZameenHub account using this email address. If you already have an account, sign in or use password recovery. If you did not make this request, you can ignore this message; no password or account setting was changed.'
        await sendEmail(env,email,'Sign-in help for ZameenHub',emailHtml(helpTitle,helpBody,signInUrl,'Open sign in'),emailText(helpTitle,helpBody,signInUrl,'Open sign in'))
        return ok({message:registrationMessage})
      }

      const id=uuid()
      await db.prepare('INSERT INTO users(id,email,name,role,password_hash,email_verified,terms_accepted_at) VALUES(?,?,?,"user",?,0,?)').bind(id,email,name,hash,nowIso()).run()
      const token=await issueToken(db,id,'verify',30)
      const link=`${env.APP_URL||url.origin}/verify-email?token=${encodeURIComponent(token)}${nextPath?'&next='+encodeURIComponent(nextPath):''}`
      await sendEmail(env,email,'Verify your ZameenHub email',emailHtml('Confirm your email','Use the link below to verify your email address. It expires in 30 minutes.',link,'Verify email'),emailText('Confirm your email','Use the link below to verify your email address. It expires in 30 minutes.',link,'Verify email'))
      return ok({message:registrationMessage})
    }
    if(path==='/api/auth/verify-email'&&method==='POST') {
      if(!await authLimit(request,db,'verify',8))return fail('Too many attempts. Please wait before trying again.',429)
      const input=await body(request),token=clean(input?.token,200);if(!token)return fail('Verification token is missing.')
      const tokenHash=await digest(token)
      const record=await db.prepare("DELETE FROM email_verification_tokens WHERE token_hash=? AND purpose='verify' AND expires_at>? RETURNING user_id").bind(tokenHash,nowIso()).first<{user_id:string}>()
      if(!record)return fail('This verification link is invalid or expired. Request a new one.',400)
      await db.batch([
        db.prepare('UPDATE users SET email_verified=1,email_verified_at=?,updated_at=? WHERE id=?').bind(nowIso(),nowIso(),record.user_id),
        db.prepare("DELETE FROM email_verification_tokens WHERE user_id=? AND purpose='verify'").bind(record.user_id)
      ])
      return ok({message:'Email verified. You can now sign in.'})
    }
    if(path==='/api/auth/activate-account'&&method==='POST') {
      if(!await authLimit(request,db,'activate',5))return fail('Too many attempts. Please wait before trying again.',429)
      const input=await body(request),token=clean(input?.token,200),password=passwordValue(input?.password)
      if(password.length<8||password.length>128||input?.acceptedTerms!==true)return fail('Choose a password of at least 8 characters and accept the Terms.')
      const record=await db.prepare("DELETE FROM email_verification_tokens WHERE token_hash=? AND purpose='activate' AND expires_at>? RETURNING user_id").bind(await digest(token),nowIso()).first<{user_id:string}>()
      if(!record)return fail('This activation link is invalid or expired. Request a new one.',400)
      const hash=await passwordHash(password)
      await db.batch([
        db.prepare('UPDATE users SET password_hash=?,email_verified=1,email_verified_at=?,terms_accepted_at=?,updated_at=? WHERE id=? AND password_hash IS NULL').bind(hash,nowIso(),nowIso(),nowIso(),record.user_id),
        db.prepare("DELETE FROM email_verification_tokens WHERE user_id=? AND purpose='activate'").bind(record.user_id)
      ])
      return ok({message:'Your account is activated. Sign in to continue.'})
    }
    if(path==='/api/auth/resend-verification'&&method==='POST') {
      if(!await authLimit(request,db,'resend',4))return fail('Too many requests. Please wait before trying again.',429)
      const input=await body(request),email=normalizeEmail(clean(input?.email,254)),nextPath=safeNextPath(input?.next)
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return ok({message:'If this address needs verification or activation, instructions will be sent shortly.'})
      if(!await limited(db,'resend-email:'+email,3,60))return ok({message:'If this address needs verification or activation, instructions will be sent shortly.'})
      const user=await db.prepare('SELECT id,email,name,role,password_hash,email_verified FROM users WHERE email=?').bind(email).first<UserRow>()
      if(user&&!user.email_verified) {
        const purpose=user.password_hash?'verify':'activate'
        const token=await issueToken(db,user.id,purpose,30)
        const route=purpose==='verify'?'verify-email':'activate-account'
        const link=`${env.APP_URL||url.origin}/${route}?token=${encodeURIComponent(token)}${nextPath?'&next='+encodeURIComponent(nextPath):''}`
        await sendEmail(env,email,purpose==='verify'?'Verify your ZameenHub email':'Activate your ZameenHub account',emailHtml('Finish setting up ZameenHub','Use this one-time link to continue. It expires in 30 minutes.',link,'Continue'),emailText('Finish setting up ZameenHub','Use this one-time link to continue. It expires in 30 minutes.',link,'Continue'))
      }
      return ok({message:'If this address needs verification or activation, instructions will be sent shortly.'})
    }
    if(path==='/api/auth/login'&&method==='POST') {
      if(!await authLimit(request,db,'login',8))return fail('Too many sign-in attempts. Please wait and try again.',429)
      const input=await body(request);if(!input)return fail('Invalid request body.')
      const email=normalizeEmail(clean(input.email,254)),password=passwordValue(input.password)
      if(!await limited(db,'login-email:'+email,8,15))return fail('Too many sign-in attempts. Please wait and try again.',429)
      const user=await db.prepare('SELECT id,email,name,role,password_hash,email_verified,mfa_enabled,mfa_secret_ciphertext,mfa_last_counter FROM users WHERE email=?').bind(email).first<UserRow>()
      // Match the PBKDF2 work for unknown emails to reduce account-enumeration
      // through response timing. The dummy expected digest is intentionally invalid.
      const dummyHash='pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      const valid=await verifyPassword(password,user?.password_hash||dummyHash)
      if(!user||!valid)return fail('Email or password is incorrect.',401)
      if(user.email_verified!==1)return fail('Please verify your email before signing in. Use the resend verification option if needed.',403)
      const previousToken=cookieToken(request)
      if(previousToken)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(previousToken)).run()
      const previousChallenge=requestCookie(request,'zh_mfa')
      if(previousChallenge)await db.prepare('DELETE FROM auth_mfa_challenges WHERE token_hash=?').bind(await digest(previousChallenge)).run()
      if(user.mfa_enabled===1){
        const challenge=randomToken()
        await db.prepare('DELETE FROM auth_mfa_challenges WHERE expires_at<=?').bind(nowIso()).run()
        await db.prepare('INSERT INTO auth_mfa_challenges(id,user_id,token_hash,attempts,expires_at) VALUES(?,?,?,0,?)').bind(uuid(),user.id,await digest(challenge),future(5)).run()
        return okWithCookies({mfaRequired:true},200,[sessionCookie('',0),mfaChallengeCookie(challenge,300)])
      }
      const token=await createSession(db,user.id)
      return okWithCookies({user:userView(user),mfaRequired:false},200,[sessionCookie(token,60*24*14),mfaChallengeCookie('',0)])
    }
    if(path==='/api/auth/mfa/verify'&&method==='POST') {
      if(!await authLimit(request,db,'mfa-verify',8))return fail('Too many verification attempts. Please wait before trying again.',429)
      const challenge=requestCookie(request,'zh_mfa')
      if(!challenge)return fail('Your two-factor sign-in has expired. Please sign in again.',401)
      const challengeHash=await digest(challenge)
      const record=await db.prepare('SELECT id,user_id,attempts,expires_at FROM auth_mfa_challenges WHERE token_hash=? AND expires_at>?').bind(challengeHash,nowIso()).first<{id:string;user_id:string;attempts:number;expires_at:string}>()
      if(!record)return fail('Your two-factor sign-in has expired. Please sign in again.',401)
      if(record.attempts>=5){await db.prepare('DELETE FROM auth_mfa_challenges WHERE id=?').bind(record.id).run();return fail('Too many incorrect codes. Please sign in again.',429)}
      const input=await body(request),code=clean(input?.code,40)
      const recoveryLike=/^[A-F0-9]{24}$/i.test(code.replace(/[\\s-]/g,''))
      if((!env.MFA_ENCRYPTION_KEY||env.MFA_ENCRYPTION_KEY.length<32)&&!recoveryLike) {
        return fail('Authenticator verification is unavailable because the server encryption secret is not configured. Use an unused recovery code if you have one, or contact site support.',503)
      }
      const attempt=await db.prepare('UPDATE auth_mfa_challenges SET attempts=attempts+1 WHERE id=? AND expires_at>? AND attempts<5').bind(record.id,nowIso()).run()
      if(!attempt.meta.changes)return fail('Too many incorrect codes. Please sign in again.',429)
      const user=await db.prepare('SELECT id,email,name,role,password_hash,email_verified,mfa_enabled,mfa_secret_ciphertext,mfa_last_counter FROM users WHERE id=?').bind(record.user_id).first<UserRow>()
      let valid=false
      try { valid=!!user&&user.email_verified===1&&await verifyMfaCode(db,user,code,env) } catch { valid=false }
      if(!valid){
        if(record.attempts+1>=5)await db.prepare('DELETE FROM auth_mfa_challenges WHERE id=?').bind(record.id).run()
        return fail('That code is invalid or expired. Check your authenticator and try again.',401)
      }
      const token=await createSession(db,record.user_id)
      await db.prepare('DELETE FROM auth_mfa_challenges WHERE id=?').bind(record.id).run()
      return okWithCookies({user:userView(user as UserRow)},200,[sessionCookie(token,60*24*14),mfaChallengeCookie('',0)])
    }
    if(path==='/api/auth/mfa/setup'&&method==='POST') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in before enabling two-factor authentication.',401)
      if(!await authLimit(request,db,'mfa-setup',5)||!await limited(db,'mfa-setup-user:'+user.id,5,15))return fail('Too many setup attempts. Please wait before trying again.',429)
      if(user.mfa_enabled===1)return fail('Two-factor authentication is already enabled.')
      if(!env.MFA_ENCRYPTION_KEY||env.MFA_ENCRYPTION_KEY.length<32)return fail('MFA_ENCRYPTION_KEY must be set as a Cloudflare Secret of at least 32 characters before setup.',503)
      const input=await body(request),password=passwordValue(input?.password)
      if(!await verifyPassword(password,user.password_hash))return fail('Current password is incorrect.',401)
      const secret=base32Encode(bytes(20)),ciphertext=await encryptMfaSecret(secret,env)
      await db.prepare('UPDATE users SET mfa_pending_secret_ciphertext=?,mfa_pending_expires_at=?,updated_at=? WHERE id=?').bind(ciphertext,future(10),nowIso(),user.id).run()
      const otpAuthUri='otpauth://totp/'+encodeURIComponent('ZameenHub:'+user.email)+'?secret='+secret+'&issuer=ZameenHub&algorithm=SHA1&digits=6&period=30'
      return ok({secret,otpAuthUri,expiresInMinutes:10})
    }
    if(path==='/api/auth/mfa/enable'&&method==='POST') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in before enabling two-factor authentication.',401)
      if(!await authLimit(request,db,'mfa-enable',5)||!await limited(db,'mfa-enable-user:'+user.id,5,15))return fail('Too many verification attempts. Please wait before trying again.',429)
      const input=await body(request),password=passwordValue(input?.password),code=clean(input?.code,20)
      if(!await verifyPassword(password,user.password_hash))return fail('Current password is incorrect.',401)
      const pending=await db.prepare('SELECT mfa_pending_secret_ciphertext,mfa_pending_expires_at FROM users WHERE id=?').bind(user.id).first<{mfa_pending_secret_ciphertext:string|null;mfa_pending_expires_at:string|null}>()
      if(!pending?.mfa_pending_secret_ciphertext||!pending.mfa_pending_expires_at||Date.parse(pending.mfa_pending_expires_at)<=Date.now())return fail('Your authenticator setup expired. Start setup again.',400)
      const secret=await decryptMfaSecret(pending.mfa_pending_secret_ciphertext,env)
      const setupCounter=await matchedTotpCounter(secret,code)
      if(setupCounter===null)return fail('That authenticator code is invalid. Check the code and try again.',400)
      const encrypted=pending.mfa_pending_secret_ciphertext
      const recoveryCodes=Array.from({length:10},()=>Array.from(bytes(12),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase())
      const currentSessionHash=await digest(cookieToken(request))
      const statements=[
        db.prepare('UPDATE users SET mfa_enabled=1,mfa_secret_ciphertext=?,mfa_pending_secret_ciphertext=NULL,mfa_pending_expires_at=NULL,mfa_last_counter=?,updated_at=? WHERE id=?').bind(encrypted,setupCounter,nowIso(),user.id),
        db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').bind(user.id,currentSessionHash),
        ...await Promise.all(recoveryCodes.map(async codeValue=>db.prepare('INSERT INTO mfa_recovery_codes(id,user_id,code_hash) VALUES(?,?,?)').bind(uuid(),user.id,await digest(codeValue))))
      ]
      await db.batch(statements)
      await sendEmail(env,user.email,'Two-factor authentication enabled on ZameenHub',emailHtml('Two-factor authentication enabled','Authenticator-based two-factor authentication was enabled for your account. If you did not do this, sign in, disable it, and contact support.',env.APP_URL||url.origin,'Open ZameenHub'),emailText('Two-factor authentication enabled','Authenticator-based two-factor authentication was enabled for your account. If you did not do this, sign in, disable it, and contact support.',env.APP_URL||url.origin,'Open ZameenHub'))
      return ok({enabled:true,recoveryCodes})
    }
    if(path==='/api/auth/mfa/disable'&&method==='POST') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in before changing two-factor authentication.',401)
      if(!await authLimit(request,db,'mfa-disable',5)||!await limited(db,'mfa-disable-user:'+user.id,5,15))return fail('Too many verification attempts. Please wait before trying again.',429)
      if(user.mfa_enabled!==1)return fail('Two-factor authentication is not enabled.')
      const input=await body(request),password=passwordValue(input?.password)
      if(!await verifyPassword(password,user.password_hash))return fail('Current password is incorrect.',401)
      let valid=false
      try { valid=await verifyMfaCode(db,user,input?.code,env) } catch { valid=false }
      if(!valid)return fail('Enter a valid authenticator or unused recovery code.',401)
      const currentSessionHash=await digest(cookieToken(request))
      await db.batch([
        db.prepare('UPDATE users SET mfa_enabled=0,mfa_secret_ciphertext=NULL,mfa_pending_secret_ciphertext=NULL,mfa_pending_expires_at=NULL,updated_at=? WHERE id=?').bind(nowIso(),user.id),
        db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').bind(user.id,currentSessionHash),
        db.prepare('DELETE FROM auth_mfa_challenges WHERE user_id=?').bind(user.id)
      ])
      await sendEmail(env,user.email,'Two-factor authentication disabled on ZameenHub',emailHtml('Two-factor authentication disabled','Authenticator-based two-factor authentication was disabled for your account. If you did not do this, reset your password and contact support.',env.APP_URL||url.origin,'Open ZameenHub'),emailText('Two-factor authentication disabled','Authenticator-based two-factor authentication was disabled for your account. If you did not do this, reset your password and contact support.',env.APP_URL||url.origin,'Open ZameenHub'))
      return ok({enabled:false})
    }
    if(path==='/api/auth/forgot-password'&&method==='POST') {
      if(!await authLimit(request,db,'forgot',4))return fail('Too many requests. Please wait before trying again.',429)
      const input=await body(request),email=normalizeEmail(clean(input?.email,254))
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return ok({message:'If a verified account matches that address, password-reset instructions will be sent shortly.'})
      if(!await limited(db,'forgot-email:'+email,3,60))return ok({message:'If a verified account matches that address, password-reset instructions will be sent shortly.'})
      const user=await db.prepare('SELECT id,email,name,role,password_hash,email_verified FROM users WHERE email=?').bind(email).first<UserRow>()
      if(user?.password_hash&&user.email_verified) {
        const token=randomToken()
        await db.batch([
          db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').bind(user.id),
          db.prepare('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').bind(uuid(),user.id,await digest(token),future(30))
        ])
        const link=`${env.APP_URL||url.origin}/reset-password?token=${encodeURIComponent(token)}`
        await sendEmail(env,email,'Reset your ZameenHub password',emailHtml('Reset your password','This one-time link expires in 30 minutes. If you did not request it, ignore this email.',link,'Reset password'),emailText('Reset your password','This one-time link expires in 30 minutes. If you did not request it, ignore this email.',link,'Reset password'))
      }
      return ok({message:'If a verified account matches that address, password-reset instructions will be sent shortly.'})
    }
    if(path==='/api/auth/reset-password'&&method==='POST') {
      if(!await authLimit(request,db,'reset',5))return fail('Too many attempts. Please wait before trying again.',429)
      const input=await body(request),token=clean(input?.token,200),password=passwordValue(input?.password)
      if(password.length<8||password.length>128)return fail('Choose a password between 8 and 128 characters.')
      const record=await db.prepare('DELETE FROM password_reset_tokens WHERE token_hash=? AND expires_at>? RETURNING user_id').bind(await digest(token),nowIso()).first<{user_id:string}>()
      if(!record)return fail('This password-reset link is invalid or expired. Request a new one.',400)
      const hash=await passwordHash(password)
      await db.batch([
        db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').bind(hash,nowIso(),record.user_id),
        db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').bind(record.user_id),
        db.prepare('DELETE FROM sessions WHERE user_id=?').bind(record.user_id),
        db.prepare('DELETE FROM auth_mfa_challenges WHERE user_id=?').bind(record.user_id)
      ])
      return ok({message:'Password updated. All existing sessions have been signed out; sign in with your new password.'})
    }
    if(path==='/api/account/profile'&&method==='PATCH') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to update your profile.',401)
      if(!await authLimit(request,db,'profile-image',8)||!await limited(db,'profile-image-user:'+user.id,12,60))return fail('Too many profile changes. Please wait before trying again.',429)
      const input=await body(request);if(!input)return fail('Invalid profile update.')
      if(input.profileImageUrl!==undefined&&input.profileImageUrl!==null&&typeof input.profileImageUrl!=='string')return fail('Profile image must be a public HTTPS image URL.')
      if(typeof input.profileImageUrl==='string'&&input.profileImageUrl.length>1500)return fail('Profile image URL is too long (maximum 1500 characters).')
      const raw=clean(input.profileImageUrl,1500)
      const profileImageUrl=raw?normalizeHttpsUrl(raw,1500):''
      if(raw&&!profileImageUrl)return fail('Use a complete public HTTPS image URL. Local, data, and non-HTTPS URLs are not accepted.')
      await db.prepare('UPDATE users SET profile_image_url=?,updated_at=? WHERE id=?').bind(profileImageUrl,nowIso(),user.id).run()
      return ok({profileImageUrl:profileImageUrl||''})
    }
    if(path==='/api/account/delete'&&method==='POST') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in before deleting your account.',401)
      if(!await authLimit(request,db,'account-delete',4)||!await limited(db,'account-delete-user:'+user.id,3,60))return fail('Too many account deletion attempts. Please wait before trying again.',429)
      if(user.role==='admin'){
        const administrators=await db.prepare("SELECT COUNT(*) AS total FROM users WHERE role='admin'").first<{total:number}>()
        if((administrators?.total||0)<=1)return fail('The last administrator cannot delete this account. Assign another trusted administrator first.',409)
      }
      const input=await body(request)
      if(input?.confirmText!=='DELETE')return fail('Type DELETE to confirm account deletion.')
      const password=passwordValue(input?.password)
      if(!await verifyPassword(password,user.password_hash))return fail('Current password is incorrect.',401)
      if(user.mfa_enabled===1){
        let valid=false
        try { valid=await verifyMfaCode(db,user,input?.code,env) } catch { valid=false }
        if(!valid)return fail('Enter a valid authenticator or unused recovery code to confirm account deletion.',401)
      }
      // Explicitly remove owned listings first because properties.owner_id uses ON DELETE RESTRICT.
      const accountRateKeys=await Promise.all([
        'login-email:'+user.email,'register-email:'+user.email,'resend-email:'+user.email,'forgot-email:'+user.email,
        'listing-user:'+user.id,'listing-edit-user:'+user.id,'listing-manage-user:'+user.id,'listing-delete-user:'+user.id,
        'mfa-setup-user:'+user.id,'mfa-enable-user:'+user.id,'mfa-disable-user:'+user.id,'account-delete-user:'+user.id,
        'property-report-user:'+user.id,'inquiry-inbox-user:'+user.id,'inquiry-update-user:'+user.id,
        'moderation-user:'+user.id,'report-review-user:'+user.id
      ].map(key=>digest(key)))
      // Keep the last-admin guard inside the atomic batch as well: two admins
      // attempting deletion at once must not both observe a count of two.
      const canDeleteAdmin=`(role<>'admin' OR (SELECT COUNT(*) FROM users WHERE role='admin')>1)`
      const deletion=await db.batch([
        db.prepare(`INSERT OR IGNORE INTO property_document_object_cleanup(object_key,created_at) SELECT d.object_key,? FROM property_documents d JOIN properties p ON p.id=d.property_id WHERE p.owner_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND ${canDeleteAdmin})`).bind(nowIso(),user.id,user.id),
        db.prepare(`DELETE FROM inquiries WHERE sender_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND ${canDeleteAdmin})`).bind(user.id,user.id),
        db.prepare(`DELETE FROM properties WHERE owner_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND ${canDeleteAdmin})`).bind(user.id,user.id),
        db.prepare(`DELETE FROM users WHERE id=? AND ${canDeleteAdmin}`).bind(user.id),
        ...accountRateKeys.map(key=>db.prepare('DELETE FROM auth_rate_limits WHERE key_hash=? AND NOT EXISTS (SELECT 1 FROM users WHERE id=?)').bind(key,user.id))
      ])
      if(!deletion[3]?.meta?.changes)return fail('The last administrator cannot delete this account. Assign another trusted administrator first.',409)
      await flushDocumentObjectCleanup(db,env.R2)
      return okWithCookies({deleted:true},200,[sessionCookie('',0),mfaChallengeCookie('',0)])
    }
    if(path==='/api/properties'&&method==='GET') {
      const q=clean(url.searchParams.get('q'),120),purpose=clean(url.searchParams.get('purpose'),8),type=clean(url.searchParams.get('type'),40),bedsRaw=url.searchParams.get('beds'),bathsRaw=url.searchParams.get('baths'),minPriceRaw=url.searchParams.get('minPrice'),maxPriceRaw=url.searchParams.get('maxPrice'),minAreaRaw=url.searchParams.get('minArea'),maxAreaRaw=url.searchParams.get('maxArea'),amenityRaw=url.searchParams.get('amenities'),beds=bedsRaw?safeInt(bedsRaw,0,100):null,baths=bathsRaw?safeInt(bathsRaw,0,100):null,minPrice=minPriceRaw?safeInt(minPriceRaw,0,1_000_000_000):null,maxPrice=maxPriceRaw?safeInt(maxPriceRaw,0,1_000_000_000):null,minArea=minAreaRaw?safeInt(minAreaRaw,0,100_000_000):null,maxArea=maxAreaRaw?safeInt(maxAreaRaw,0,100_000_000):null,requestedAmenities=sanitizeAmenities(amenityRaw?amenityRaw.split(','):[]),sort=url.searchParams.get('sort')
      const viewer=await getUser(request,env); let sql="SELECT p.*,u.name AS owner_name,u.profile_image_url AS owner_profile_image_url, CASE WHEN f.user_id IS NULL THEN 0 ELSE 1 END AS favorite FROM properties p JOIN users u ON u.id=p.owner_id LEFT JOIN favorites f ON f.property_id=p.id AND f.user_id=? WHERE p.status='published'",args:unknown[]=[viewer?.id||'']
      if(q){sql+=' AND (p.location LIKE ? OR p.city LIKE ? OR p.title LIKE ?)';const term='%'+q.replace(/[%_]/g,'')+'%';args.push(term,term,term)}
      if(purpose==='sale'||purpose==='rent'){sql+=' AND p.purpose=?';args.push(purpose)}
      if(type){sql+=' AND p.property_type=?';args.push(type)}
      if(beds!==null&&beds>0){sql+=' AND p.bedrooms>=?';args.push(beds)}
      if(baths!==null&&baths>0){sql+=' AND p.bathrooms>=?';args.push(baths)}
      if(minPrice!==null){sql+=' AND p.price>=?';args.push(minPrice)}
      if(maxPrice!==null){sql+=' AND p.price<=?';args.push(maxPrice)}
      if(minArea!==null&&minArea>0){sql+=' AND p.area>=?';args.push(minArea)}
      if(maxArea!==null&&maxArea>0){sql+=' AND p.area<=?';args.push(maxArea)}
      for(const amenity of requestedAmenities){sql+=" AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(p.amenities_json) THEN p.amenities_json ELSE '[]' END) AS item WHERE item.value=?)";args.push(amenity)}
      sql+=sort==='price-asc'?' ORDER BY p.price ASC':sort==='price-desc'?' ORDER BY p.price DESC':' ORDER BY p.created_at DESC'
      sql+=' LIMIT 100'
      const result=await db.prepare(sql).bind(...args).all<PropertyRow>()
      return ok(await Promise.all(result.results.map(p=>withProperty(db,p))))
    }
    const publicDocumentsMatch=path.match(/^\/api\/properties\/([^/]+)\/documents$/)
    if(publicDocumentsMatch&&method==='GET'){
      const slug=decodeURIComponent(publicDocumentsMatch[1])
      const property=await db.prepare("SELECT id FROM properties WHERE slug=? AND status='published'").bind(slug).first<{id:string}>()
      if(!property)return fail('Property not found or no longer available.',404)
      const result=await db.prepare("SELECT d.id,d.document_type AS documentType,d.display_label AS label,d.file_extension AS fileExtension,d.size_bytes AS sizeBytes,d.submitted_at AS submittedAt,d.published_at AS publishedAt,d.review_status AS reviewStatus,d.public_review_summary AS reviewSummary FROM property_documents d WHERE d.property_id=? AND d.document_role='public_copy' AND d.visibility='public' AND d.processing_status='stored' ORDER BY d.published_at DESC LIMIT 10").bind(property.id).all<Record<string,unknown>>()
      if(!env.R2&&result.results.length)return fail('Property document storage is temporarily unavailable.',503)
      return ok(result.results)
    }
    const documentFileMatch=path.match(/^\/api\/property-documents\/([^/]+)\/file$/)
    if(documentFileMatch&&method==='GET'){
      const documentId=decodeURIComponent(documentFileMatch[1])
      const doc=await db.prepare("SELECT d.*,p.status AS property_status FROM property_documents d JOIN properties p ON p.id=d.property_id WHERE d.id=?").bind(documentId).first<PropertyDocumentRow&{property_status:string}>()
      if(!doc)return fail('Document not found or no longer available.',404)
      const isPublic=doc.document_role==='public_copy'&&doc.visibility==='public'&&doc.processing_status==='stored'&&doc.property_status==='published'
      let viewer:UserRow|null=null
      if(!isPublic){viewer=await requireUser(request,env);if(!viewer)return fail('Sign in to access this private document.',401);if(viewer.id!==doc.owner_id&&!['admin','moderator'].includes(viewer.role))return fail('You do not have permission to access this document.',403)}
      if(!env.R2)return fail('Private property document storage is not configured for this environment.',503)
      const object=await env.R2.get(doc.object_key);if(!object||!object.body)return fail('The document file is unavailable.',404)
      if(viewer&&viewer.id!==doc.owner_id&&['admin','moderator'].includes(viewer.role)){
        try{await db.prepare("INSERT INTO property_document_events(id,document_id,property_id,actor_id,event_type,prior_state,new_state,note,created_at) VALUES(?,?,?,?, 'private_download',?,?,?,?)").bind(uuid(),doc.id,doc.property_id,viewer.id,doc.visibility,doc.review_status,'Authorized moderator download of a non-public document.',nowIso()).run()}
        catch{return fail('The access audit could not be recorded. Retry later.',503)}
      }
      const download=url.searchParams.get('download')==='1'||!isPublic
      const headers=new Headers({'content-type':download?'application/octet-stream':doc.content_type,'content-disposition':(download?'attachment':'inline')+'; filename="zameenhub-property-document'+doc.file_extension+'"','cache-control':'private, no-store, max-age=0','pragma':'no-cache','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin','content-security-policy':"default-src 'none'; sandbox"})
      return new Response(object.body,{status:200,headers})
    }
    const documentReportMatch=path.match(/^\/api\/property-documents\/([^/]+)\/reports$/)
    if(documentReportMatch&&method==='POST'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in before reporting a property document.',401)
      if(!await authLimit(request,db,'property-document-report',6)||!await limited(db,'property-document-report-user:'+user.id,5,60))return fail('Too many document reports. Please wait before trying again.',429)
      const input=await body(request);if(!input)return fail('Invalid document report.')
      const reason=clean(input.reason,40),details=clean(input.details,1200),documentId=decodeURIComponent(documentReportMatch[1])
      if(!['suspected_fraud','wrong_property','privacy_exposure','other'].includes(reason)||details.trim().length<10||details.length>1200)return fail('Choose a reason and provide at least 10 characters of specific detail.')
      const doc=await db.prepare("SELECT d.id,d.property_id,d.owner_id FROM property_documents d JOIN properties p ON p.id=d.property_id WHERE d.id=? AND d.document_role='public_copy' AND d.visibility='public' AND d.processing_status='stored' AND p.status='published'").bind(documentId).first<{id:string;property_id:string;owner_id:string}>()
      if(!doc)return fail('This published document is no longer available to report.',404)
      if(doc.owner_id===user.id)return fail('You cannot report a document on your own listing.',403)
      if(await db.prepare("SELECT id FROM property_document_reports WHERE document_id=? AND reporter_id=? AND status IN ('open','reviewing')").bind(documentId,user.id).first())return fail('You already have an open report for this document.',409)
      try{const id=uuid();await db.prepare("INSERT INTO property_document_reports(id,document_id,property_id,reporter_id,reason,details,status,created_at) VALUES(?,?,?,?,?,?,'open',?)").bind(id,doc.id,doc.property_id,user.id,reason,details,nowIso()).run();return ok({id,status:'open',message:'Document report received. A report alone is not proof of fraud.'},201)}
      catch{return fail('The report could not be saved. Refresh and try again.',409)}
    }
    const detailMatch=path.match(/^\/api\/properties\/([^/]+)$/)
    if(detailMatch&&method==='GET') {
      const slug=decodeURIComponent(detailMatch[1])
      const viewer=await getUser(request,env); const p=await db.prepare("SELECT p.*,u.name AS owner_name,u.profile_image_url AS owner_profile_image_url, CASE WHEN f.user_id IS NULL THEN 0 ELSE 1 END AS favorite FROM properties p JOIN users u ON u.id=p.owner_id LEFT JOIN favorites f ON f.property_id=p.id AND f.user_id=? WHERE p.slug=? AND p.status='published'").bind(viewer?.id||'',slug).first<PropertyRow>()
      if(!p)return fail('Property not found or no longer available.',404)
      return ok(await withProperty(db,p))
    }
    if(path==='/api/properties'&&method==='POST') {
      const user=await requireUser(request,env)
      if(!user)return fail('Sign in with a verified email before listing a property.',401)
      if(!await authLimit(request,db,'listing',6)||!await limited(db,'listing-user:'+user.id,4,60))return fail('Too many listing submissions. Please wait before submitting another property.',429)
      const input=await body(request);if(!input)return fail('Invalid listing request.')
      const title=clean(input.title,120),location=clean(input.location,240),city=clean(input.city,100),purpose=clean(input.purpose,8),propertyType=clean(input.propertyType,40),description=clean(input.description,8000),amenities=sanitizeAmenities(input.amenities)
      const price=safeInt(input.price,1,1_000_000_000),bedrooms=safeInt(input.bedrooms,0,100),bathrooms=safeInt(input.bathrooms,0,100),area=safeInt(input.area,0,100_000_000)
      const mediaImages=sanitizeImageUrls(input.images),videoUrl=sanitizeVideoUrl(input.videoUrl),evidence=sanitizeVerificationEvidence(input)
      if(!mediaImages||videoUrl===null)return fail('Media must use public HTTPS image URLs (maximum 5) and a supported HTTPS video URL (YouTube, Vimeo, MP4, WebM, Ogg, or HLS).')
      if(!evidence)return fail('Verification evidence must be a public HTTPS reference. Do not submit private identity documents or private document links.')
      if(title.length<6||!location||!city||!['sale','rent'].includes(purpose)||!['Apartment','House','Villa','Studio','Plot'].includes(propertyType)||price===null||bedrooms===null||bathrooms===null||area===null||description.length<20)return fail('Complete all required fields with valid values. Description must be at least 20 characters.')
      const id=uuid(),slug=`${slugify(title)}-${id.slice(0,8)}`
      const createdAt=nowIso()
      const statements=[
        db.prepare("INSERT INTO properties(id,owner_id,slug,title,purpose,property_type,location,city,price,bedrooms,bathrooms,area,description,amenities_json,ai_risk_level,ai_risk_score,ai_risk_reasons_json,ai_screened_at,ai_model,status,verification_status,verification_evidence_type,verification_evidence_url,verification_submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,slug,title,purpose,propertyType,location,city,price,bedrooms,bathrooms,area,description,JSON.stringify(amenities),'not-screened',0,'[]',null,'not-run','published','unverified',evidence.type,evidence.url,evidence.submittedAt),
        ...mediaInsertStatements(db,id,mediaImages,videoUrl)
      ]
      await db.batch(statements)
      const message='Your listing is now live and marked Unverified. It will remain unverified until an administrator manually verifies it.'
      return ok({id,status:'published',verified:false,message},201)
    }
    const ownerDocumentsMatch=path.match(/^\/api\/my\/properties\/([^/]+)\/documents$/)
    if(ownerDocumentsMatch&&method==='GET'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in to manage property documents.',401)
      const propertyId=decodeURIComponent(ownerDocumentsMatch[1])
      if(!await db.prepare('SELECT id FROM properties WHERE id=? AND owner_id=?').bind(propertyId,user.id).first())return fail('Listing not found in your account.',404)
      const result=await db.prepare("SELECT d.id,d.document_role AS documentRole,d.document_type AS documentType,d.display_label AS label,d.file_extension AS fileExtension,d.content_type AS contentType,d.size_bytes AS sizeBytes,d.visibility,d.processing_status AS processingStatus,d.review_status AS reviewStatus,d.possible_duplicate AS possibleDuplicate,d.submitted_at AS submittedAt,d.published_at AS publishedAt,d.withdrawn_at AS withdrawnAt,d.updated_at AS updatedAt FROM property_documents d WHERE d.property_id=? AND d.owner_id=? ORDER BY d.submitted_at DESC LIMIT 10").bind(propertyId,user.id).all<Record<string,unknown>>()
      return ok({storageReady:!!env.R2,documents:result.results.map(d=>({...d,possibleDuplicate:Number(d.possibleDuplicate)===1}))})
    }
    if(ownerDocumentsMatch&&method==='POST'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in with a verified email before uploading property documents.',401)
      if(!await authLimit(request,db,'property-document-upload',8)||!await limited(db,'property-document-upload-user:'+user.id,10,60))return fail('Too many document uploads. Please wait before trying again.',429)
      if(!env.R2)return fail('Document uploads are disabled until a private R2 bucket is provisioned and bound to this Worker.',503)
      const propertyId=decodeURIComponent(ownerDocumentsMatch[1])
      if(!await db.prepare('SELECT id FROM properties WHERE id=? AND owner_id=?').bind(propertyId,user.id).first())return fail('Listing not found in your account.',404)
      const count=await db.prepare('SELECT COUNT(*) AS total FROM property_documents WHERE property_id=?').bind(propertyId).first<{total:number}>()
      if(Number(count?.total||0)>=MAX_PROPERTY_DOCUMENTS_PER_PROPERTY)return fail('A property may have at most ten documents.',409)
      const read=await readCappedBytes(request,MAX_PROPERTY_DOCUMENT_BYTES)
      if(read.error==='too-large')return fail('Document is too large. The maximum size is 8 MiB.',413)
      if(read.error||!read.bytes)return fail('No readable document was received. Choose a supported PDF or image.')
      const fileName=decodeDocumentHeader(request.headers.get('x-document-file-name'))
      if(fileName===null||!sanitizeDocumentFileName(fileName))return fail('Use a PDF, JPEG, PNG, or WebP file with a matching extension.')
      const format=detectDocumentFormat(read.bytes,fileName);if(!format)return fail('File signature does not match its extension or the format is unsupported.')
      const kind=clean(request.headers.get('x-document-type'),40);if(!isPropertyDocumentType(kind))return fail('Choose a supported document type.')
      const role=clean(request.headers.get('x-document-role'),40);if(!isPropertyDocumentRole(role))return fail('Choose private original or redacted public copy.')
      const rawLabel=decodeDocumentHeader(request.headers.get('x-document-label'));if(rawLabel===null)return fail('Document label metadata is malformed.')
      const label=sanitizeDocumentLabel(rawLabel,DOCUMENT_TYPE_LABELS[kind]);if(!label)return fail('Use a document label between 2 and 100 characters.')
      const hash=await sha256Hex(read.bytes),id=uuid(),objectKey='property-documents/'+uuid(),submitted=nowIso()
      try{
        await env.R2.put(objectKey,read.bytes,{httpMetadata:{contentType:'application/octet-stream',cacheControl:'private, no-store',contentDisposition:'attachment'},customMetadata:{documentId:id}})
        const statements=[db.prepare("INSERT INTO property_documents(id,property_id,owner_id,document_role,document_type,display_label,file_extension,content_type,size_bytes,sha256,object_key,possible_duplicate,visibility,processing_status,review_status,submitted_at,review_note,last_actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,'private','stored','pending',?,'',?,?)").bind(id,propertyId,user.id,role,kind,label,format.extension,format.contentType,read.bytes.byteLength,hash,objectKey,submitted,user.id,submitted),db.prepare('UPDATE property_documents SET possible_duplicate=1 WHERE sha256=? AND (SELECT COUNT(*) FROM property_documents WHERE sha256=?)>1').bind(hash,hash)]
        await db.batch(statements)
      }catch{
        try{await env.R2.delete(objectKey)}catch{try{await db.prepare('INSERT OR IGNORE INTO property_document_object_cleanup(object_key,created_at) VALUES(?,?)').bind(objectKey,nowIso()).run()}catch{}}
        return fail('The document could not be securely recorded. Retry; any failed object cleanup remains private.',503)
      }
      await flushDocumentObjectCleanup(db,env.R2)
      const saved=await db.prepare('SELECT possible_duplicate FROM property_documents WHERE id=?').bind(id).first<{possible_duplicate:number}>()
      const duplicate=Number(saved?.possible_duplicate||0)===1
      return ok({id,label,documentRole:role,visibility:'private',possibleDuplicate:duplicate,message:role==='private_original'?'Private original stored; it can never be published.':'Redacted public copy stored privately; it remains private until explicitly published.'},201)
    }
    const ownerDocumentMatch=path.match(/^\/api\/my\/properties\/([^/]+)\/documents\/([^/]+)$/)
    if(ownerDocumentMatch&&method==='PATCH'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in to change document visibility.',401)
      if(!await authLimit(request,db,'property-document-visibility',10)||!await limited(db,'property-document-visibility-user:'+user.id,15,60))return fail('Too many document visibility changes. Please wait before trying again.',429)
      const propertyId=decodeURIComponent(ownerDocumentMatch[1]),documentId=decodeURIComponent(ownerDocumentMatch[2]),input=await body(request)
      if(!input)return fail('Invalid document visibility update.')
      const visibility=clean(input.visibility,20),note=clean(input.reviewNote,1200)
      const doc=await db.prepare('SELECT id,document_role,visibility,processing_status FROM property_documents WHERE id=? AND property_id=? AND owner_id=?').bind(documentId,propertyId,user.id).first<{id:string;document_role:string;visibility:string;processing_status:string}>()
      if(!doc)return fail('Document not found in your listing.',404)
      if(doc.document_role!=='public_copy')return fail('Private originals can never be published. Upload a separate redacted public copy instead.',403)
      const timestamp=nowIso()
      if(visibility==='public'){
        if(input.publicDisclosureConfirmed!==true)return fail('Confirm the public copy has been checked for sensitive personal information.')
        if(!env.R2)return fail('Document storage is unavailable. Visibility was not changed.',503)
        const property=await db.prepare("SELECT id FROM properties WHERE id=? AND owner_id=? AND status='published'").bind(propertyId,user.id).first()
        if(!property||doc.processing_status!=='stored')return fail('Only stored documents on a published listing can be made public.',409)
        const result=await db.prepare("UPDATE property_documents SET visibility='public',published_at=?,withdrawn_at=NULL,review_note='',last_actor_id=?,updated_at=? WHERE id=? AND property_id=? AND owner_id=? AND document_role='public_copy' AND visibility<>'public'").bind(timestamp,user.id,timestamp,documentId,propertyId,user.id).run()
        if(!result.meta.changes)return fail('Document visibility changed. Refresh and retry.',409)
        return ok({id:documentId,visibility:'public',message:'Public copy published. This does not establish authenticity or legal ownership.'})
      }
      if(visibility==='withdrawn'){
        if(doc.visibility!=='public')return fail('This document is not currently public.',409)
        const result=await db.prepare("UPDATE property_documents SET visibility='withdrawn',withdrawn_at=?,review_note=?,last_actor_id=?,updated_at=? WHERE id=? AND property_id=? AND owner_id=? AND document_role='public_copy' AND visibility='public'").bind(timestamp,note,user.id,timestamp,documentId,propertyId,user.id).run()
        if(!result.meta.changes)return fail('Document visibility changed. Refresh and retry.',409)
        return ok({id:documentId,visibility:'withdrawn',message:'Public access withdrawn. New public requests are denied; downloaded copies cannot be recalled.'})
      }
      return fail('Unsupported visibility change.')
    }
    if(ownerDocumentMatch&&method==='DELETE'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in to delete property documents.',401)
      if(!await authLimit(request,db,'property-document-delete',8)||!await limited(db,'property-document-delete-user:'+user.id,10,60))return fail('Too many document deletions. Please wait before trying again.',429)
      const propertyId=decodeURIComponent(ownerDocumentMatch[1]),documentId=decodeURIComponent(ownerDocumentMatch[2])
      if(await db.prepare("SELECT id FROM property_document_reports WHERE document_id=? AND status IN ('open','reviewing') LIMIT 1").bind(documentId).first())return fail('An open report prevents deletion. Withdraw public access if needed; resolve the report first.',409)
      const deletion=await db.batch([
       db.prepare("INSERT OR IGNORE INTO property_document_object_cleanup(object_key,created_at) SELECT object_key,? FROM property_documents WHERE id=? AND property_id=? AND owner_id=? AND visibility<>'public' AND NOT EXISTS(SELECT 1 FROM property_document_reports WHERE document_id=? AND status IN ('open','reviewing'))").bind(nowIso(),documentId,propertyId,user.id,documentId),
       db.prepare("DELETE FROM property_documents WHERE id=? AND property_id=? AND owner_id=? AND visibility<>'public' AND NOT EXISTS(SELECT 1 FROM property_document_reports WHERE document_id=? AND status IN ('open','reviewing'))").bind(documentId,propertyId,user.id,documentId)
      ])
      if(!deletion[1]?.meta?.changes)return fail('Document could not be deleted. It may be public, reported, or not owned by this account.',409)
      await flushDocumentObjectCleanup(db,env.R2)
      return ok({id:documentId,deleted:true,message:'Document metadata removed; external object cleanup is retried if storage is unavailable.'})
    }
    const archiveMatch=path.match(/^\/api\/my\/properties\/([^/]+)\/archive$/)
    if(archiveMatch&&method==='POST') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to manage your listings.',401)
      if(!await authLimit(request,db,'listing-manage',10)||!await limited(db,'listing-manage-user:'+user.id,12,60))return fail('Too many listing changes. Please wait before trying again.',429)
      const id=decodeURIComponent(archiveMatch[1])
      const result=await db.prepare("UPDATE properties SET status='archived',updated_at=? WHERE id=? AND owner_id=?").bind(nowIso(),id,user.id).run()
      if(!result.meta.changes)return fail('Listing could not be found in your account.',404)
      return ok({id,status:'archived',message:'Your listing is archived and no longer appears in public search.'})
    }
    const ownedPropertyMatch=path.match(/^\/api\/my\/properties\/([^/]+)$/)
    if(ownedPropertyMatch&&method==='DELETE') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to delete your listings.',401)
      if(!await authLimit(request,db,'listing-delete',6)||!await limited(db,'listing-delete-user:'+user.id,6,60))return fail('Too many listing deletions. Please wait before trying again.',429)
      const id=decodeURIComponent(ownedPropertyMatch[1])
      const owned=await db.prepare('SELECT id FROM properties WHERE id=? AND owner_id=?').bind(id,user.id).first<{id:string}>()
      if(!owned)return fail('Listing not found in your account.',404)
      // Delete dependent rows first. Each statement is scoped to a property that still belongs to this user.
      const deletion=await db.batch([
        db.prepare('INSERT OR IGNORE INTO property_document_object_cleanup(object_key,created_at) SELECT object_key,? FROM property_documents WHERE property_id=? AND owner_id=? AND EXISTS (SELECT 1 FROM properties WHERE id=? AND owner_id=?)').bind(nowIso(),id,user.id,id,user.id),
        db.prepare('DELETE FROM property_messages WHERE conversation_id IN (SELECT id FROM property_conversations WHERE property_id=? AND EXISTS (SELECT 1 FROM properties WHERE id=? AND owner_id=?))').bind(id,id,user.id),
        db.prepare('DELETE FROM property_conversations WHERE property_id=? AND EXISTS (SELECT 1 FROM properties WHERE id=? AND owner_id=?)').bind(id,id,user.id),
        db.prepare('DELETE FROM inquiries WHERE property_id=? AND EXISTS (SELECT 1 FROM properties WHERE id=? AND owner_id=?)').bind(id,id,user.id),
        db.prepare('DELETE FROM property_reports WHERE property_id=? AND EXISTS (SELECT 1 FROM properties WHERE id=? AND owner_id=?)').bind(id,id,user.id),
        db.prepare('DELETE FROM property_moderation_events WHERE property_id=? AND EXISTS (SELECT 1 FROM properties WHERE id=? AND owner_id=?)').bind(id,id,user.id),
        db.prepare('DELETE FROM favorites WHERE property_id=? AND EXISTS (SELECT 1 FROM properties WHERE id=? AND owner_id=?)').bind(id,id,user.id),
        db.prepare('DELETE FROM property_media WHERE property_id=? AND EXISTS (SELECT 1 FROM properties WHERE id=? AND owner_id=?)').bind(id,id,user.id),
        db.prepare('DELETE FROM property_images WHERE property_id=? AND EXISTS (SELECT 1 FROM properties WHERE id=? AND owner_id=?)').bind(id,id,user.id),
        db.prepare('DELETE FROM properties WHERE id=? AND owner_id=?').bind(id,user.id)
      ])
      if(!deletion[deletion.length-1]?.meta?.changes)return fail('Listing could not be deleted. Refresh and try again.',409)
      await flushDocumentObjectCleanup(db,env.R2)
      return ok({id,deleted:true,message:'Property deleted permanently. Its listing, saved entries, inquiries, reports, chats and document metadata were removed; private object cleanup remains queued if storage is unavailable.'})
    }
    if(ownedPropertyMatch&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to view your listings.',401)
      const property=await db.prepare('SELECT * FROM properties WHERE id=? AND owner_id=?').bind(decodeURIComponent(ownedPropertyMatch[1]),user.id).first<PropertyRow>()
      if(!property)return fail('Listing not found in your account.',404)
      return ok(await withProperty(db,property,true))
    }
    if(ownedPropertyMatch&&method==='PATCH') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to edit your listings.',401)
      if(!await authLimit(request,db,'listing-edit',8)||!await limited(db,'listing-edit-user:'+user.id,10,60))return fail('Too many listing edits. Please wait before trying again.',429)
      const id=decodeURIComponent(ownedPropertyMatch[1])
      const current=await db.prepare('SELECT id,owner_id,status FROM properties WHERE id=? AND owner_id=?').bind(id,user.id).first<{id:string;owner_id:string;status:string}>()
      if(!current)return fail('Listing not found in your account.',404)
      const input=await body(request);if(!input)return fail('Invalid listing update.')
      const title=clean(input.title,120),location=clean(input.location,240),city=clean(input.city,100),purpose=clean(input.purpose,8),propertyType=clean(input.propertyType,40),description=clean(input.description,8000),amenities=sanitizeAmenities(input.amenities)
      const price=safeInt(input.price,1,1_000_000_000),bedrooms=safeInt(input.bedrooms,0,100),bathrooms=safeInt(input.bathrooms,0,100),area=safeInt(input.area,0,100_000_000)
      const mediaImages=sanitizeImageUrls(input.images),videoUrl=sanitizeVideoUrl(input.videoUrl),evidence=sanitizeVerificationEvidence(input)
      if(!mediaImages||videoUrl===null)return fail('Media must use public HTTPS image URLs (maximum 5) and a supported HTTPS video URL (YouTube, Vimeo, MP4, WebM, Ogg, or HLS).')
      if(!evidence)return fail('Verification evidence must be a public HTTPS reference. Do not submit private identity documents or private document links.')
      if(title.length<6||!location||!city||!['sale','rent'].includes(purpose)||!['Apartment','House','Villa','Studio','Plot'].includes(propertyType)||price===null||bedrooms===null||bathrooms===null||area===null||description.length<20)return fail('Complete all required fields with valid values. Description must be at least 20 characters.')
      const updateTime=nowIso()
      const result=await db.prepare("UPDATE properties SET title=?,purpose=?,property_type=?,location=?,city=?,price=?,bedrooms=?,bathrooms=?,area=?,description=?,amenities_json=?,ai_risk_level='not-screened',ai_risk_score=0,ai_risk_reasons_json='[]',ai_screened_at=NULL,ai_model=NULL,verification_status='unverified',verification_evidence_type=?,verification_evidence_url=?,verification_submitted_at=?,verification_reviewed_at=NULL,verification_reviewed_by=NULL,verification_note='',status='published',updated_at=? WHERE id=? AND owner_id=?").bind(title,purpose,propertyType,location,city,price,bedrooms,bathrooms,area,description,JSON.stringify(amenities),evidence.type,evidence.url,evidence.submittedAt,updateTime,id,user.id).run()
      if(!result.meta.changes)return fail('The listing could not be updated. Refresh and try again.',409)
      await savePropertyMedia(db,id,mediaImages,videoUrl)
      return ok({id,status:'published',verified:false,message:'Changes saved and are live. Verification has reset to Unverified until an administrator checks the updated details.'})
    }
    if(path==='/api/my/properties'&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to view your listings.',401)
      const result=await db.prepare("SELECT p.*,(SELECT e.owner_message FROM property_moderation_events e WHERE e.property_id=p.id AND e.new_status='rejected' ORDER BY e.created_at DESC LIMIT 1) AS owner_review_message FROM properties p WHERE p.owner_id=? ORDER BY p.created_at DESC LIMIT 100").bind(user.id).all<PropertyRow & {owner_review_message?:string}>()
      return ok(await Promise.all(result.results.map(async p=>({...await withProperty(db,p,true),reviewMessage:p.owner_review_message||undefined}))))
    }
    if(path==='/api/my/inquiries'&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to view your inquiries.',401)
      if(!await authLimit(request,db,'inquiry-inbox',20)||!await limited(db,'inquiry-inbox-user:'+user.id,60,60))return fail('Too many inbox requests. Please try again shortly.',429)
      const result=await db.prepare("SELECT i.id,i.property_id,i.sender_id,i.email,i.message,i.status,i.created_at,p.title AS property_title,p.slug AS property_slug,p.city AS property_city FROM inquiries i JOIN properties p ON p.id=i.property_id WHERE p.owner_id=? ORDER BY CASE i.status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END, i.created_at DESC LIMIT 200").bind(user.id).all<{id:string;property_id:string;sender_id:string|null;email:string;message:string;status:string;created_at:string;property_title:string;property_slug:string;property_city:string}>()
      return ok(result.results)
    }
    const ownedInquiryMatch=path.match(/^\/api\/my\/inquiries\/([^/]+)$/)
    if(ownedInquiryMatch&&method==='PATCH') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to manage your inquiries.',401)
      if(!await authLimit(request,db,'inquiry-update',20)||!await limited(db,'inquiry-update-user:'+user.id,60,60))return fail('Too many inbox updates. Please try again shortly.',429)
      const input=await body(request);if(!input)return fail('Invalid inquiry update.')
      const status=clean(input.status,20)
      if(!['read','archived'].includes(status))return fail('Unsupported inquiry status.')
      const id=decodeURIComponent(ownedInquiryMatch[1])
      const result=await db.prepare("UPDATE inquiries SET status=? WHERE id=? AND EXISTS (SELECT 1 FROM properties p WHERE p.id=inquiries.property_id AND p.owner_id=?)").bind(status,id,user.id).run()
      if(!result.meta.changes)return fail('Inquiry could not be found in your owner inbox.',404)
      return ok({id,status})
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
    if(path==='/api/reports'&&method==='POST') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in before reporting a property.',401)
      if(!await authLimit(request,db,'property-report',6)||!await limited(db,'property-report-user:'+user.id,5,60))return fail('Too many reports. Please wait before submitting another.',429)
      const input=await body(request);if(!input)return fail('Invalid report request.')
      const propertyId=clean(input.propertyId,80),reason=clean(input.reason,40),details=clean(input.details,1200)
      const reasons=['suspected_fraud','incorrect_price','duplicate','unavailable','misleading_details','other']
      if(!propertyId||!reasons.includes(reason)||details.trim().length<10||details.length>1200)return fail('Choose a report reason and provide at least 10 characters of specific detail.')
      const property=await db.prepare("SELECT id,owner_id FROM properties WHERE id=? AND status='published'").bind(propertyId).first<{id:string;owner_id:string}>()
      if(!property)return fail('This property is not currently available to report.',404)
      if(property.owner_id===user.id)return fail('You cannot report your own listing.',403)
      const existing=await db.prepare("SELECT id FROM property_reports WHERE property_id=? AND reporter_id=? AND status IN ('open','reviewing')").bind(propertyId,user.id).first<{id:string}>()
      if(existing)return fail('You already have an open report for this listing. The moderation team can review it.',409)
      const id=uuid()
      await db.prepare("INSERT INTO property_reports(id,property_id,reporter_id,reason,details,status,created_at) VALUES(?,?,?,?,?,'open',?)").bind(id,propertyId,user.id,reason,details,nowIso()).run()
      return ok({id,status:'open',message:'Report received. It will be reviewed by the moderation team.'},201)
    }
    if(path==='/api/admin/reports'&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to view reports.',403)
      if(!await authLimit(request,db,'report-queue',20))return fail('Too many requests. Please wait before trying again.',429)
      const result=await db.prepare("SELECT r.id,r.property_id,r.reporter_id,r.reason,r.details,r.status,r.created_at,r.resolved_by,r.resolved_at,r.resolution_note,p.title AS property_title,p.slug AS property_slug,p.city AS property_city,p.status AS property_status,p.ai_risk_level,p.ai_risk_score FROM property_reports r JOIN properties p ON p.id=r.property_id WHERE r.status IN ('open','reviewing') ORDER BY r.created_at ASC LIMIT 100").all<{id:string;property_id:string;reporter_id:string|null;reason:string;details:string;status:string;created_at:string;resolved_by:string|null;resolved_at:string|null;resolution_note:string;property_title:string;property_slug:string;property_city:string;property_status:string;ai_risk_level:string|null;ai_risk_score:number}>()
      return ok(result.results)
    }
    const reportMatch=path.match(/^\/api\/admin\/reports\/([^/]+)$/)
    if(reportMatch&&method==='PATCH') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to update reports.',403)
      if(!await authLimit(request,db,'report-review',30)||!await limited(db,'report-review-user:'+user.id,60,60))return fail('Too many moderation actions. Please wait before trying again.',429)
      const input=await body(request);if(!input)return fail('Invalid report update.')
      const status=clean(input.status,20),note=clean(input.resolutionNote,1200),reportId=decodeURIComponent(reportMatch[1])
      if(!['reviewing','resolved','dismissed'].includes(status))return fail('Unsupported report status.')
      if(['resolved','dismissed'].includes(status)&&note.trim().length<8)return fail('Add a resolution note of at least 8 characters before closing a report.')
      const old=await db.prepare("SELECT id FROM property_reports WHERE id=? AND status IN ('open','reviewing')").bind(reportId).first<{id:string}>()
      if(!old)return fail('Report was already handled or could not be found.',404)
      const result=await db.prepare("UPDATE property_reports SET status=?,resolved_by=?,resolved_at=?,resolution_note=? WHERE id=? AND status IN ('open','reviewing')").bind(status,status==='reviewing'?null:user.id,status==='reviewing'?null:nowIso(),note,reportId).run()
      if(!result.meta.changes)return fail('Report was already handled or could not be found.',409)
      return ok({id:reportId,status})
    }
    const adminDocumentMatch=path.match(/^\/api\/admin\/property-documents\/([^/]+)$/)
    if(adminDocumentMatch&&method==='PATCH'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to change document visibility.',403)
      if(!await authLimit(request,db,'property-document-admin-visibility',15))return fail('Too many moderation actions. Please wait before trying again.',429)
      const input=await body(request);if(!input)return fail('Invalid document visibility update.')
      const note=clean(input.note,1200),documentId=decodeURIComponent(adminDocumentMatch[1]),timestamp=nowIso()
      if(clean(input.visibility,20)!=='withdrawn'||note.trim().length<10)return fail('Only withdrawal of a public copy is supported. Add at least 10 characters of evidence-based notes.')
      const result=await db.prepare("UPDATE property_documents SET visibility='withdrawn',withdrawn_at=?,review_note=?,last_actor_id=?,updated_at=? WHERE id=? AND document_role='public_copy' AND visibility='public'").bind(timestamp,note,user.id,timestamp,documentId).run()
      if(!result.meta.changes)return fail('Public document already withdrawn or not found.',409)
      return ok({id:documentId,visibility:'withdrawn',message:'Public access was withdrawn and the decision was audited.'})
    }
    if(path==='/api/admin/property-documents'&&method==='GET'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to review property documents.',403)
      if(!await authLimit(request,db,'property-document-review-queue',20))return fail('Too many requests. Please wait before trying again.',429)
      const result=await db.prepare("SELECT d.id,d.property_id AS propertyId,d.owner_id AS ownerId,d.document_role AS documentRole,d.document_type AS documentType,d.display_label AS label,d.file_extension AS fileExtension,d.content_type AS contentType,d.size_bytes AS sizeBytes,d.visibility,d.processing_status AS processingStatus,d.review_status AS reviewStatus,d.possible_duplicate AS possibleDuplicate,d.submitted_at AS submittedAt,d.published_at AS publishedAt,d.updated_at AS updatedAt,p.title AS propertyTitle,p.slug AS propertySlug,p.city AS propertyCity,p.status AS propertyStatus,(SELECT COUNT(*) FROM property_documents other WHERE other.sha256=d.sha256 AND other.id<>d.id) AS duplicateCount FROM property_documents d JOIN properties p ON p.id=d.property_id WHERE d.review_status='pending' OR (d.possible_duplicate=1 AND d.visibility<>'withdrawn') ORDER BY d.possible_duplicate DESC,d.submitted_at ASC LIMIT 100").all<Record<string,unknown>>()
      return ok({storageReady:!!env.R2,documents:result.results.map(d=>({...d,possibleDuplicate:Number(d.possibleDuplicate)===1,duplicateCount:Number(d.duplicateCount)||0}))})
    }
    const documentReviewMatch=path.match(/^\/api\/admin\/property-documents\/([^/]+)\/review$/)
    if(documentReviewMatch&&method==='PATCH'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to review property documents.',403)
      if(!await authLimit(request,db,'property-document-review',30)||!await limited(db,'property-document-review-user:'+user.id,60,60))return fail('Too many moderation actions. Please wait before trying again.',429)
      const input=await body(request);if(!input)return fail('Invalid document review.')
      const status=clean(input.reviewStatus,20),note=clean(input.reviewNote,1200),publicSummary=clean(input.publicSummary,280),documentId=decodeURIComponent(documentReviewMatch[1])
      if(!['reviewed','inconclusive'].includes(status)||note.trim().length<20||publicSummary.trim().length<15)return fail('Choose Reviewed or Inconclusive, provide 20+ characters of internal notes and a 15–280 character public summary of the limited checks performed.')
      const current=await db.prepare('SELECT review_status,updated_at FROM property_documents WHERE id=?').bind(documentId).first<{review_status:string;updated_at:string}>()
      if(!current)return fail('Document not found.',404)
      if(current.review_status===status)return fail('This document already has that review status. Refresh the queue.',409)
      const timestamp=nowIso(),result=await db.prepare("UPDATE property_documents SET review_status=?,reviewed_at=?,reviewer_id=?,review_note=?,public_review_summary=?,last_actor_id=?,updated_at=? WHERE id=? AND review_status=? AND updated_at=?").bind(status,timestamp,user.id,note,publicSummary,user.id,timestamp,documentId,current.review_status,current.updated_at).run()
      if(!result.meta.changes)return fail('Document changed while being reviewed. Refresh the queue and inspect it again.',409)
      return ok({id:documentId,reviewStatus:status,auditRecorded:true,message:status==='reviewed'?'Review recorded; it does not guarantee authenticity or legal title.':'Review recorded as inconclusive.'})
    }
    if(path==='/api/admin/property-document-reports'&&method==='GET'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to view document reports.',403)
      if(!await authLimit(request,db,'property-document-report-queue',20))return fail('Too many requests. Please wait before trying again.',429)
      const result=await db.prepare("SELECT r.id,r.document_id AS documentId,r.property_id AS propertyId,r.reason,r.details,r.status,r.created_at AS createdAt,r.resolution_note AS resolutionNote,d.display_label AS documentLabel,d.visibility AS documentVisibility,p.title AS propertyTitle,p.slug AS propertySlug,p.city AS propertyCity,p.status AS propertyStatus FROM property_document_reports r JOIN property_documents d ON d.id=r.document_id JOIN properties p ON p.id=r.property_id WHERE r.status IN ('open','reviewing') ORDER BY r.created_at ASC LIMIT 100").all<Record<string,unknown>>()
      return ok({reports:result.results})
    }
    const documentReportReviewMatch=path.match(/^\/api\/admin\/property-document-reports\/([^/]+)$/)
    if(documentReportReviewMatch&&method==='PATCH'){
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to update document reports.',403)
      if(!await authLimit(request,db,'property-document-report-review',30)||!await limited(db,'property-document-report-review-user:'+user.id,60,60))return fail('Too many moderation actions. Please wait before trying again.',429)
      const input=await body(request);if(!input)return fail('Invalid document report update.')
      const status=clean(input.status,20),note=clean(input.resolutionNote,1200),id=decodeURIComponent(documentReportReviewMatch[1])
      if(!['reviewing','resolved','dismissed'].includes(status)||(status!=='reviewing'&&note.trim().length<8))return fail('Unsupported status or missing resolution note (minimum 8 characters).')
      const result=await db.prepare("UPDATE property_document_reports SET status=?,resolved_by=?,resolved_at=?,resolution_note=? WHERE id=? AND status IN ('open','reviewing')").bind(status,status==='reviewing'?null:user.id,status==='reviewing'?null:nowIso(),note,id).run()
      if(!result.meta.changes)return fail('Report already handled or not found.',404)
      return ok({id,status})
    }
    if(path==='/api/admin/review-queue'&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to review listings.',403)
      const result=await db.prepare("SELECT * FROM properties WHERE status='pending' OR (status='published' AND COALESCE(verification_status,'unverified')<>'verified') ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, created_at ASC LIMIT 200").all<PropertyRow>()
      return ok(await Promise.all(result.results.map(p=>withProperty(db,p,true))))
    }
    const reviewMatch=path.match(/^\/api\/admin\/properties\/([^/]+)$/)
    if(reviewMatch&&method==='PATCH') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in required.',401)
      if(!['admin','moderator'].includes(user.role))return fail('You do not have permission to review listings.',403)
      if(!await authLimit(request,db,'moderation',30)||!await limited(db,'moderation-user:'+user.id,60,60))return fail('Too many moderation actions. Please wait before trying again.',429)
      const input=await body(request),status=clean(input?.status,20),reviewNote=clean(input?.reviewNote,1000),ownerMessage=clean(input?.ownerMessage,1000),verifyEvidence=input?.verifyEvidence===true
      if(status!=='published'&&status!=='rejected'&&status!=='archived')return fail('Unsupported review status.')
      const id=decodeURIComponent(reviewMatch[1])
      const record=await db.prepare("SELECT * FROM properties WHERE id=? AND status IN ('pending','published')").bind(id).first<PropertyRow & {updated_at:string}>()
      if(!record)return fail('Listing was not found in a reviewable state.',404)
      const priorStatus=record.status
      if(status==='published'&&priorStatus!=='pending'&&!(priorStatus==='published'&&verifyEvidence))return fail('Only pending listings can be published; live listings can only be marked verified.',409)
      if(status==='archived'&&priorStatus!=='published')return fail('Only a published listing can be archived by the moderation team.',409)
      if((status==='rejected'||status==='archived')&&reviewNote.trim().length<8)return fail('Add at least 8 characters explaining the evidence-based reason for this moderation action.')
      if(status==='rejected'&&ownerMessage.trim().length<10)return fail('Add a clear owner-facing explanation of at least 10 characters. Internal notes stay private.')
      if(verifyEvidence&&status!=='published')return fail('Evidence can only be marked reviewed while publishing the listing.')
      if(verifyEvidence&&user.role!=='admin')return fail('Only an administrator can manually verify a property.',403)
      if(verifyEvidence&&reviewNote.trim().length<20)return fail('Record at least 20 characters describing the evidence you checked before marking it reviewed.')
      const reviewTime=nowIso()
      const verificationDecision=status==='rejected'?'rejected':verifyEvidence?'verified':'unchanged'
      const nextVerificationStatus=status==='rejected'?'rejected':verifyEvidence?'verified':(record.verification_status||'unverified')
      const nextVerificationReviewedAt=verificationDecision==='unchanged'?(record.verification_reviewed_at||null):reviewTime
      const nextVerificationReviewedBy=verificationDecision==='unchanged'?(record.verification_reviewed_by||null):user.id
      const nextVerificationNote=verificationDecision==='unchanged'?(record.verification_note||''):reviewNote
      // The decision is bound to the exact submitted listing and evidence link.
      const snapshotGuard = " AND title=? AND location=? AND city=? AND price=? AND description=? AND property_type=? AND purpose=? AND bedrooms=? AND bathrooms=? AND area=? AND amenities_json=? AND COALESCE(price_period,'')=? AND COALESCE(ai_risk_level,'not-screened')=? AND COALESCE(ai_risk_score,0)=? AND COALESCE(ai_risk_reasons_json,'[]')=? AND COALESCE(ai_model,'not-screened')=? AND COALESCE(ai_screened_at,'')=? AND updated_at=? AND COALESCE(verification_status,'unverified')=? AND COALESCE(verification_evidence_type,'none')=? AND COALESCE(verification_evidence_url,'')=?"
      const auditResults=await db.batch([
        db.prepare("UPDATE properties SET status=?,updated_at=?,verification_status=?,verification_reviewed_at=?,verification_reviewed_by=?,verification_note=? WHERE id=? AND status=?"+snapshotGuard).bind(status,reviewTime,nextVerificationStatus,nextVerificationReviewedAt,nextVerificationReviewedBy,nextVerificationNote,id,priorStatus,record.title,record.location,record.city,record.price,record.description,record.property_type,record.purpose,record.bedrooms,record.bathrooms,record.area,record.amenities_json||'[]',record.price_period||'',record.ai_risk_level||'not-screened',Number(record.ai_risk_score)||0,record.ai_risk_reasons_json||'[]',record.ai_model||'not-screened',record.ai_screened_at||'',record.updated_at,record.verification_status||'unverified',record.verification_evidence_type||'none',record.verification_evidence_url||''),
        db.prepare("INSERT INTO property_moderation_events(id,property_id,reviewer_id,prior_status,new_status,review_note,owner_message,ai_risk_level,ai_risk_score,created_at,verification_decision) SELECT ?,?,?,?,?,?,?,COALESCE(ai_risk_level,'not-screened'),COALESCE(ai_risk_score,0),?,? FROM properties WHERE id=? AND status=? AND changes()=1").bind(uuid(),id,user.id,priorStatus,status,reviewNote,ownerMessage,reviewTime,verificationDecision,id,status)
      ])
      if(!auditResults[0]?.meta?.changes)return fail('The listing or evidence changed while it was being reviewed. Refresh the queue and review the latest details.',409)
      if(!auditResults[1]?.meta?.changes)return fail('The moderation audit could not be recorded. The change was rolled back; retry or contact support.',500)
      return ok({status,priorStatus,auditRecorded:true,verificationStatus:nextVerificationStatus,verificationDecision})
    }
    if(path==='/api/inquiries'&&method==='POST') {
      if(!await authLimit(request,db,'inquiry-submit',8))return fail('Too many inquiry submissions. Please wait and try again.',429)
      const input=await body(request);if(!input)return fail('Invalid inquiry request.')
      const propertyId=clean(input.propertyId,80)
      const email=normalizeEmail(clean(input.email,254))
      const message=clean(input.message,2000)
      if(!propertyId||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||message.trim().length<12||message.length>2000)return fail('Enter a valid email and a message of at least 12 characters.')
      if(!await limited(db,'inquiry-email:'+email,8,60))return fail('Too many inquiries from this email address. Please wait before trying again.',429)
      if(!await limited(db,'inquiry-email-property:'+email+':'+propertyId,2,60))return fail('You have already sent a recent inquiry about this property. Please wait before sending another.',429)
      const property=await db.prepare("SELECT p.id,p.owner_id,p.title,p.slug,p.city,u.email AS owner_email FROM properties p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND p.status='published'").bind(propertyId).first<{id:string;owner_id:string;title:string;slug:string;city:string;owner_email:string}>()
      if(!property)return fail('Property not found or no longer available.',404)
      const sender=await getUser(request,env)
      if(sender?.id===property.owner_id)return fail('You cannot send an inquiry to your own listing.',403)
      const reference=uuid()
      await db.prepare("INSERT INTO inquiries(id,property_id,sender_id,email,message,status,created_at) VALUES(?,?,?,?,?,'new',?)").bind(reference,property.id,sender?.id||null,email,message,nowIso()).run()
      const listingUrl=`${(env.APP_URL||url.origin).replace(/\/$/,'')}/properties/${encodeURIComponent(property.slug)}`
      const mailTitle='New inquiry about your property'
      const mailBody=`Property: ${property.title}\nCity: ${property.city}\nFrom: ${email}\n\nMessage:\n${message}\n\nReference: ${reference}`
      const notificationSent=await sendEmail(env,property.owner_email,'New ZameenHub property inquiry',emailHtml(mailTitle,mailBody,listingUrl,'View property'),emailText(mailTitle,mailBody,listingUrl,'View property'))
      return ok({reference,notificationSent},201)
    }

    if(path==='/api/conversations'&&method==='GET') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to view your messages.',401)
      if(!await authLimit(request,db,'conversation-list',30)||!await limited(db,'conversation-list-user:'+user.id,90,60))return fail('Too many inbox requests. Please try again shortly.',429)
      const result=await db.prepare(`SELECT c.id,c.property_id AS propertyId,p.slug AS propertySlug,p.title AS propertyTitle,p.city AS propertyCity,c.buyer_id AS buyerId,c.owner_id AS ownerId,c.last_message_at AS lastMessageAt,
        CASE WHEN c.buyer_id=? THEN 'buyer' ELSE 'owner' END AS role,
        CASE WHEN c.buyer_id=? THEN uo.name ELSE ub.name END AS otherUserName,
        COALESCE((SELECT m.body FROM property_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1),'') AS lastMessage,
        (SELECT COUNT(*) FROM property_messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.read_at IS NULL) AS unreadCount
        FROM property_conversations c JOIN properties p ON p.id=c.property_id JOIN users ub ON ub.id=c.buyer_id JOIN users uo ON uo.id=c.owner_id
        WHERE c.buyer_id=? OR c.owner_id=? ORDER BY c.last_message_at DESC LIMIT 100`).bind(user.id,user.id,user.id,user.id,user.id).all<Record<string,unknown>>()
      return ok(result.results)
    }
    if(path==='/api/conversations'&&method==='POST') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in with a verified email to chat with a property owner.',401)
      if(!await authLimit(request,db,'conversation-start',8)||!await limited(db,'conversation-start-user:'+user.id,12,60))return fail('Too many chat requests. Please wait before starting another conversation.',429)
      const input=await body(request);if(!input)return fail('Invalid chat request.')
      const propertyId=clean(input.propertyId,80),message=clean(input.message,2000)
      if(!propertyId||!message.trim()||message.length>2000)return fail('Choose a property and write a message (maximum 2,000 characters).')
      const property=await db.prepare("SELECT id,owner_id FROM properties WHERE id=? AND status='published'").bind(propertyId).first<{id:string;owner_id:string}>()
      if(!property)return fail('This property is not currently available for chat.',404)
      if(property.owner_id===user.id)return fail('You cannot start a chat with yourself about your own listing.',403)
      if(!await limited(db,'conversation-first-message:'+user.id+':'+propertyId,3,60))return fail('You recently started a chat about this property. Please wait before sending another.',429)
      let conversation=await db.prepare('SELECT id FROM property_conversations WHERE property_id=? AND buyer_id=?').bind(propertyId,user.id).first<{id:string}>()
      if(!conversation) {
        const id=uuid(),timestamp=nowIso()
        await db.prepare("INSERT OR IGNORE INTO property_conversations(id,property_id,buyer_id,owner_id,created_at,updated_at,last_message_at,status) VALUES(?,?,?,?,?,?,?,'open')").bind(id,propertyId,user.id,property.owner_id,timestamp,timestamp,timestamp).run()
        conversation=await db.prepare('SELECT id FROM property_conversations WHERE property_id=? AND buyer_id=?').bind(propertyId,user.id).first<{id:string}>()
      }
      if(!conversation)return fail('Could not start the conversation. Please retry.',500)
      const timestamp=nowIso()
      await db.batch([
        db.prepare('INSERT INTO property_messages(id,conversation_id,sender_id,body,created_at) VALUES(?,?,?,?,?)').bind(uuid(),conversation.id,user.id,message.trim(),timestamp),
        db.prepare("UPDATE property_conversations SET status='open',updated_at=?,last_message_at=? WHERE id=?").bind(timestamp,timestamp,conversation.id)
      ])
      return ok({id:conversation.id},201)
    }
    const conversationMessagesMatch=path.match(/^\/api\/conversations\/([^/]+)\/messages$/)
    if(conversationMessagesMatch&&(method==='GET'||method==='POST')) {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to access private messages.',401)
      const id=decodeURIComponent(conversationMessagesMatch[1])
      const conversation=await db.prepare('SELECT id,buyer_id,owner_id,status FROM property_conversations WHERE id=? AND (buyer_id=? OR owner_id=?)').bind(id,user.id,user.id).first<{id:string;buyer_id:string;owner_id:string;status:string}>()
      if(!conversation)return fail('Conversation not found.',404)
      if(method==='GET') {
        const result=await db.prepare(`SELECT m.id,m.sender_id AS senderId,u.name AS senderName,m.body,m.created_at AS createdAt,m.read_at AS readAt
          FROM property_messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=?
          ORDER BY m.created_at DESC LIMIT 100`).bind(id).all<{id:string;senderId:string;senderName:string;body:string;createdAt:string;readAt:string|null}>()
        return ok(result.results.reverse())
      }
      if(conversation.status!=='open')return fail('This conversation is closed.',409)
      if(!await authLimit(request,db,'conversation-message',20)||!await limited(db,'conversation-message-user:'+user.id,80,60))return fail('You are sending messages too quickly. Wait a moment and retry.',429)
      const input=await body(request);if(!input)return fail('Invalid message.')
      const message=clean(input.message,2000).trim()
      if(!message||message.length>2000)return fail('Write a message of 1–2,000 characters.')
      const timestamp=nowIso(),messageId=uuid()
      await db.batch([
        db.prepare('INSERT INTO property_messages(id,conversation_id,sender_id,body,created_at) VALUES(?,?,?,?,?)').bind(messageId,id,user.id,message,timestamp),
        db.prepare('UPDATE property_conversations SET updated_at=?,last_message_at=? WHERE id=? AND status=\'open\'').bind(timestamp,timestamp,id)
      ])
      return ok({id:messageId,senderId:user.id,body:message,createdAt:timestamp,readAt:null},201)
    }
    const conversationReadMatch=path.match(/^\/api\/conversations\/([^/]+)\/read$/)
    if(conversationReadMatch&&method==='PATCH') {
      const user=await requireUser(request,env);if(!user)return fail('Sign in to update message read status.',401)
      const id=decodeURIComponent(conversationReadMatch[1])
      const conversation=await db.prepare('SELECT id,buyer_id,owner_id FROM property_conversations WHERE id=? AND (buyer_id=? OR owner_id=?)').bind(id,user.id,user.id).first<{id:string;buyer_id:string;owner_id:string}>()
      if(!conversation)return fail('Conversation not found.',404)
      const timestamp=nowIso()
      await db.batch([
        db.prepare('UPDATE property_messages SET read_at=? WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL').bind(timestamp,id,user.id),
        db.prepare('UPDATE property_conversations SET buyer_last_read_at=? WHERE id=? AND buyer_id=?').bind(timestamp,id,user.id),
        db.prepare('UPDATE property_conversations SET owner_last_read_at=? WHERE id=? AND owner_id=?').bind(timestamp,id,user.id)
      ])
      return ok({read:true})
    }
    if(path==='/api/support'&&method==='POST') {
      if(!await authLimit(request,db,'support',8))return fail('Too many requests. Please wait and try again.',429)
      const input=await body(request),email=normalizeEmail(clean(input?.email,254)),message=clean(input?.message,4000)
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||message.length<12)return fail('Enter a valid email and a message of at least 12 characters.')
      const supportTitle='Support request',supportBody=`From: ${email.replace(/[<>]/g,'')}\n\n${message.replace(/[<>]/g,'')}`,supportUrl=env.APP_URL||url.origin
      const sent=await sendEmail(env,env.SUPPORT_EMAIL||'dewifystores@gmail.com','ZameenHub support request',emailHtml(supportTitle,supportBody,supportUrl,'Open support site'),emailText(supportTitle,supportBody,supportUrl,'Open support site'))
      if(!sent)return fail('Support email could not be delivered. Please email dewifystores@gmail.com directly.',503)
      return ok({message:'Your support request was sent. We will follow up at the email you provided.'},201)
    }
    return fail('Route not found.',404)
  } catch(error) {
    console.error('ZameenHub API error',error instanceof Error?error.message:'unknown error')
    return fail('The service could not complete this request. Please try again.',500)
  }
} }
