import { useEffect,useState,type FormEvent } from 'react'
import { FileText,Upload,Download,EyeOff,Trash2,AlertTriangle,ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiRequest } from './lib/auth'
import { SectionKicker } from './components'
export const DOCUMENT_TYPE_LABELS={sale_deed:'Sale deed',property_tax_receipt:'Property tax receipt',registry_extract:'Registry extract',encumbrance_certificate:'Encumbrance certificate',approved_plan:'Approved plan',rera_record:'RERA record',other:'Other supporting record'} as const
type DocType=keyof typeof DOCUMENT_TYPE_LABELS
type Role='private_original'|'public_copy'
type PublicDoc={id:string;documentType:DocType;label:string;fileExtension:string;sizeBytes:number;submittedAt:string;publishedAt:string;reviewStatus:'pending'|'reviewed'|'inconclusive'}
type OwnerDoc=PublicDoc&{documentRole:Role;visibility:'private'|'public'|'withdrawn';possibleDuplicate:boolean}
const MAX=8*1024*1024
const size=(b:number)=>b<1048576?Math.max(1,Math.round(b/1024))+' KB':(b/1048576).toFixed(1)+' MB'
const date=(s:string)=>s?new Date(s).toLocaleDateString('en-IN',{year:'numeric',month:'short',day:'numeric'}):'Date unavailable'
function reviewLabel(s:string){return s==='reviewed'?'Evidence reviewed · authenticity not guaranteed':s==='inconclusive'?'Review inconclusive':'Evidence review pending'}
export function PublicPropertyDocuments({propertySlug}:{propertySlug:string}){
 const [docs,setDocs]=useState<PublicDoc[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[report,setReport]=useState(''),[reason,setReason]=useState('suspected_fraud'),[details,setDetails]=useState(''),[notice,setNotice]=useState('')
 useEffect(()=>{let active=true;void apiRequest<PublicDoc[]>('/api/properties/'+encodeURIComponent(propertySlug)+'/documents').then(r=>{if(!active)return;if(r.ok)setDocs(r.data);else setError(r.error);setBusy(false)});return()=>{active=false}},[propertySlug])
 async function send(e:FormEvent){e.preventDefault();if(!report)return;const r=await apiRequest<{message:string}>('/api/property-documents/'+encodeURIComponent(report)+'/reports',{method:'POST',body:JSON.stringify({reason,details:details.trim()})});if(!r.ok){setError(r.error);return}setNotice(r.data.message);setReport('');setDetails('')}
 return <section className="detail-section document-section" aria-labelledby="public-docs-title">
  <div className="document-heading"><div><SectionKicker>Property evidence</SectionKicker><h2 id="public-docs-title">Property documents</h2><p className="muted">Inspect seller-published copies yourself. Publication or a review status does not prove authenticity, ownership or clear title.</p></div><ShieldCheck size={22}/></div>
  <div className="document-disclosure"><strong>Check before relying on a document.</strong> Compare names, property identifiers and dates. Obtain independent legal advice before paying or signing. ZameenHub does not claim automatic authenticity detection or perfect redaction.</div>
  {busy?<p className="muted">Loading published documents…</p>:error?<p className="status-message error" role="alert">{error}</p>:docs.length===0?<div className="document-empty">No public documents have been published for this property. Private uploads are not shown here.</div>:<div className="document-list">{docs.map(d=><article className="document-card" key={d.id}>
   <div className="document-title"><FileText size={20}/><div><h3>{d.label}</h3><p>{DOCUMENT_TYPE_LABELS[d.documentType]||'Supporting record'} · {d.fileExtension.toUpperCase()} · {size(d.sizeBytes)} · Published {date(d.publishedAt)}</p><span className={'document-state '+(d.reviewStatus==='reviewed'?'reviewed':'')}>{reviewLabel(d.reviewStatus)}</span></div></div>
   <div className="document-actions"><a className="btn btn-outline" href={'/api/property-documents/'+encodeURIComponent(d.id)+'/file?download=1'}><Download size={14}/> Download</a><button className="btn btn-outline" type="button" onClick={()=>setReport(report===d.id?'':d.id)}><AlertTriangle size={14}/> Report</button></div>
   {report===d.id&&<form className="document-report" onSubmit={send}><label>Reason<select className="form-control" value={reason} onChange={e=>setReason(e.target.value)}><option value="suspected_fraud">Suspected fraud or alteration</option><option value="wrong_property">Wrong property</option><option value="privacy_exposure">Sensitive information exposed</option><option value="other">Other</option></select></label><label>Details<textarea className="form-control" minLength={10} maxLength={1200} required value={details} onChange={e=>setDetails(e.target.value)}/></label><button className="btn btn-primary" disabled={details.trim().length<10}>Submit report</button></form>}
  </article>)}</div>}
  {notice&&<p className="status-message success" role="status">{notice}</p>}
  {error&&!busy&&<p className="status-message error" role="alert">{error} {error.includes('Sign in')&&<Link to="/login">Sign in</Link>}</p>}
 </section>
}
export function PropertyDocumentsManager({propertyId,propertyStatus}:{propertyId:string;propertyStatus:string}){
 const [docs,setDocs]=useState<OwnerDoc[]>([]),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[file,setFile]=useState<File|null>(null),[kind,setKind]=useState<DocType>('sale_deed'),[role,setRole]=useState<Role>('public_copy'),[label,setLabel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 async function reload(){setLoading(true);const r=await apiRequest<{storageReady:boolean;documents:OwnerDoc[]}>('/api/my/properties/'+encodeURIComponent(propertyId)+'/documents');if(r.ok){setReady(r.data.storageReady);setDocs(r.data.documents)}else{setReady(false);setError(r.error)}setLoading(false)}
 useEffect(()=>{void reload()},[propertyId])
 async function upload(e:FormEvent){e.preventDefault();if(!file||busy||!ready)return;if(file.size<1||file.size>MAX){setError('File must be non-empty and no larger than 8 MiB.');return}
  if(role==='public_copy'&&!window.confirm('This is a separate public copy. You must redact identity numbers, signatures, bank details, unrelated addresses and other sensitive information yourself. No automated redaction is performed. Upload privately first?'))return
  setBusy(true);setError('');const headers=new Headers({'Content-Type':'application/octet-stream','X-Document-File-Name':encodeURIComponent(file.name),'X-Document-Type':kind,'X-Document-Role':role,'X-Document-Label':encodeURIComponent(label.trim())})
  const r=await apiRequest<{message:string;possibleDuplicate:boolean}>('/api/my/properties/'+encodeURIComponent(propertyId)+'/documents',{method:'POST',headers,body:file});setBusy(false);if(!r.ok){setError(r.error);return}setNotice(r.data.message+(r.data.possibleDuplicate?' Identical file hash found; this is a review signal, not proof of fraud.':''));setFile(null);setLabel('');const input=document.getElementById('property-doc-file') as HTMLInputElement|null;if(input)input.value='';await reload()
 }
 async function change(d:OwnerDoc,visibility:'public'|'withdrawn'){if(busy)return;if(visibility==='public'&&(!ready||propertyStatus!=='published'))return;if(!window.confirm(visibility==='public'?'Publish this redacted copy? You confirm it has been checked for private information. This does not prove authenticity.':'Withdraw public access? Existing downloaded copies cannot be recalled.'))return
  setBusy(true);setError('');const r=await apiRequest<{message:string}>('/api/my/properties/'+encodeURIComponent(propertyId)+'/documents/'+encodeURIComponent(d.id),{method:'PATCH',body:JSON.stringify({visibility,publicDisclosureConfirmed:visibility==='public'})});setBusy(false);if(!r.ok){setError(r.error);return}setNotice(r.data.message);await reload()
 }
 async function remove(d:OwnerDoc){if(busy||d.visibility==='public')return;if(!window.confirm('Delete this document? An open report prevents deletion.'))return;setBusy(true);const r=await apiRequest<{message:string}>('/api/my/properties/'+encodeURIComponent(propertyId)+'/documents/'+encodeURIComponent(d.id),{method:'DELETE',body:JSON.stringify({})});setBusy(false);if(!r.ok){setError(r.error);return}setNotice(r.data.message);await reload()}
 return <section className="document-manager"><SectionKicker>Evidence management</SectionKicker><h2>Property documents</h2><p className="muted">Private originals can never be published. Upload a separate redacted copy when you want buyers to inspect evidence.</p>
  <div className="document-disclosure"><strong>Important:</strong> File signature checks validate formats only. They do not prove legal authenticity, scan for every malicious file, or redact private information. Review every public copy yourself.</div>
  {!ready&&!loading&&<div className="document-empty">Secure uploads are currently disabled because a private object-storage bucket is not configured. No document upload is accepted until storage is provisioned.</div>}
  {error&&<p className="status-message error" role="alert">{error}</p>}{notice&&<p className="status-message success" role="status">{notice}</p>}
  <form className="document-form" onSubmit={upload}><label>Document file (PDF/JPEG/PNG/WebP, max 8 MiB)<input id="property-doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required disabled={!ready||busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
   <label>Document type<select className="form-control" value={kind} onChange={e=>setKind(e.target.value as DocType)} disabled={!ready||busy}>{Object.entries(DOCUMENT_TYPE_LABELS).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
   <label>Upload type<select className="form-control" value={role} onChange={e=>setRole(e.target.value as Role)} disabled={!ready||busy}><option value="private_original">Private original · never publish</option><option value="public_copy">Separate redacted public copy</option></select></label>
   <label>Display label (optional)<input className="form-control" maxLength={100} value={label} onChange={e=>setLabel(e.target.value)} disabled={!ready||busy}/></label>
   <button className="btn btn-primary" disabled={!ready||busy||!file}><Upload size={14}/> {busy?'Uploading…':'Upload privately'}</button>
  </form>
  <p className="muted">{loading?'Loading documents…':docs.length+' / 10 documents'}</p>
  <div className="document-list">{docs.map(d=><article className="document-card" key={d.id}><div className="document-title"><FileText size={20}/><div><h3>{d.label}</h3><p>{DOCUMENT_TYPE_LABELS[d.documentType]||'Supporting record'} · {d.documentRole==='private_original'?'Private original':'Public copy'} · {d.fileExtension.toUpperCase()} · {size(d.sizeBytes)}</p><span className="document-state">{d.visibility==='public'?'Publicly available':d.visibility==='withdrawn'?'Withdrawn':'Private'} · {reviewLabel(d.reviewStatus)}</span>{d.possibleDuplicate&&<p className="document-duplicate">Identical file hash match · not a fraud finding</p>}</div></div>
   <div className="document-actions"><a className="btn btn-outline" href={'/api/property-documents/'+encodeURIComponent(d.id)+'/file?download=1'}>Private download</a>{d.documentRole==='public_copy'&&d.visibility!=='public'&&<button className="btn btn-primary" disabled={busy||!ready||propertyStatus!=='published'} onClick={()=>void change(d,'public')}>Publish</button>}{d.visibility==='public'&&<button className="btn btn-outline" disabled={busy} onClick={()=>void change(d,'withdrawn')}><EyeOff size={14}/> Withdraw</button>}{d.visibility!=='public'&&<button className="btn btn-outline" disabled={busy} onClick={()=>void remove(d)}><Trash2 size={14}/> Delete</button>}</div>
  </article>)}</div>
 </section>
}
