import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SectionKicker } from './components'
import { apiRequest, getSession } from './lib/auth'
import { PROPERTY_AMENITIES } from './lib/property-options'
import { uploadPropertyEvidence, uploadPropertyImage } from './lib/imagekit'

export function ListingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [step, setStep] = useState(1)
  const [purpose, setPurpose] = useState<'sale' | 'rent'>('sale')
  const [propertyType, setPropertyType] = useState('Apartment')
  const [title, setTitle] = useState('')
  const [locationText, setLocationText] = useState('')
  const [city, setCity] = useState('')
  const [price, setPrice] = useState('')
  const [bedrooms, setBedrooms] = useState('0')
  const [bathrooms, setBathrooms] = useState('0')
  const [area, setArea] = useState('')
  const [description, setDescription] = useState('')
  const [amenities, setAmenities] = useState<string[]>([])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [ownershipType, setOwnershipType] = useState<'self_owned'|'inherited'|'jointly_owned'|'other'|'authorized_representative'>('self_owned')
  const [ownershipDeclaration, setOwnershipDeclaration] = useState('')
  const [knownDisputes, setKnownDisputes] = useState(false)
  const [disputeDisclosure, setDisputeDisclosure] = useState('')
  const [authorityToListConfirmed, setAuthorityToListConfirmed] = useState(false)
  const [documents, setDocuments] = useState<Array<{documentType:'pdf'|'image';description:string;url:string;category:'ownership'|'inheritance'|'legal_status'|'supporting'|'other';sourceDate:string;issuingAuthority:string;jurisdiction:string}>>([])
  const [evidenceFiles, setEvidenceFiles] = useState<Array<{file:File;description:string;category:'ownership'|'inheritance'|'legal_status'|'supporting'|'other';sourceDate:string;issuingAuthority:string;jurisdiction:string}>>([])
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false)
  const steps = ['Purpose', 'Details & ownership', 'Photos & evidence']

  useEffect(() => {
    let current = true
    void getSession().then(result => {
      if (!current) return
      setChecking(false)
      if (!result.ok) {
        setError('We could not check your sign-in right now. Your session has not been cleared. Check your connection and retry.')
        return
      }
      if (result.data.authenticated) setAuthorized(true)
      else navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true })
    })
    return () => { current = false }
  }, [navigate, location.pathname, location.search])

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')
    if (step < 3) {
      if(step===2&&!authorityToListConfirmed){setError('Confirm that you own the property or are legally authorized to list it, and disclose known co-owners or heirs.');return}
      if(step===2&&ownershipDeclaration.trim().length<10){setError('Add an ownership declaration of at least 10 characters.');return}
      if(step===2&&knownDisputes&&disputeDisclosure.trim().length<10){setError('Describe the known dispute or encumbrance in at least 10 characters.');return}
      setStep(step+1);return
    }
    const numericPrice = Number(price)
    if (!title.trim() || title.trim().length < 6 || !locationText.trim() || !city.trim() || description.trim().length < 20 || !Number.isSafeInteger(numericPrice) || numericPrice < 1) {
      setError('Enter a clear title, location, city, a valid positive price, and a description of at least 20 characters.')
      setStep(2); return
    }
    const publicDocuments=documents.filter(item=>item.url.trim()&&item.description.trim()).map(item=>({...item,url:item.url.trim(),description:item.description.trim(),sellerAuthorized:privacyAcknowledged}))
    if (imageFiles.length === 0) { setError('Upload at least one property photo before submitting.'); return }
    if (publicDocuments.length === 0 && evidenceFiles.length === 0) { setError('Upload at least one PDF/image evidence file or add an existing public HTTPS document link.'); return }
    if ([...publicDocuments].some(item => item.description.length < 3) || evidenceFiles.some(item => item.description.trim().length < 3)) { setError('Give every evidence file or link a clear description of at least 3 characters.'); return }
    if (!privacyAcknowledged) { setError('Confirm that your evidence does not expose personal IDs or private information.'); return }

    setBusy(true)
    setUploadStatus('')
    const result = await apiRequest<{ id: string; status: 'draft'; verified: false; message?: string }>('/api/properties', {
      method: 'POST',
      body: JSON.stringify({
        title: title.trim(), location: locationText.trim(), city: city.trim(), purpose, propertyType,
        price: numericPrice, bedrooms: Number(bedrooms), bathrooms: Number(bathrooms), area: Number(area || 0),
        description:description.trim(),amenities,documents:publicDocuments,ownershipType,ownershipDeclaration:ownershipDeclaration.trim(),knownDisputes,disputeDisclosure:knownDisputes?disputeDisclosure.trim():'',authorityToListConfirmed,
      }),
    })
    if (!result.ok) {
      setBusy(false)
      if (result.status === 401) navigate('/login?next=' + encodeURIComponent('/list-property'), { replace: true })
      else setError(result.error)
      return
    }

    const knownMediaIds = new Set<string>()
    for (let index = 0; index < imageFiles.length; index++) {
      setUploadStatus('Uploading image ' + (index + 1) + ' of ' + imageFiles.length)
      const uploaded = await uploadPropertyImage(result.data.id, imageFiles[index], setUploadProgress, [...knownMediaIds])
      if (!uploaded.ok) {
        setBusy(false)
        setError('Your listing was created, but image ' + (index + 1) + ' could not be confirmed: ' + uploaded.error + ' You can retry from Edit listing.')
        setNotice('Listing created successfully. Check the photo gallery before retrying this image.')
        return
      }
      knownMediaIds.add(uploaded.data.id)
      setUploadProgress(0)
    }
    const knownEvidenceIds = new Set<string>()
    for (let index = 0; index < evidenceFiles.length; index++) {
      const evidence = evidenceFiles[index]
      setUploadStatus('Uploading evidence ' + (index + 1) + ' of ' + evidenceFiles.length)
      const uploaded=await uploadPropertyEvidence(result.data.id,evidence.file,evidence.description.trim(),setUploadProgress,[...knownEvidenceIds],{category:evidence.category,sourceDate:evidence.sourceDate,issuingAuthority:evidence.issuingAuthority,jurisdiction:evidence.jurisdiction})
      if (!uploaded.ok) {
        setBusy(false)
        setError('Your listing draft is saved, but evidence file ' + (index + 1) + ' could not be confirmed: ' + uploaded.error + ' You can retry from Edit listing.')
        setNotice('Listing draft saved. Add or retry the missing property evidence before publishing.')
        return
      }
      knownEvidenceIds.add(uploaded.data.id)
      setUploadProgress(0)
    }
    const publication = await apiRequest<{ id: string; status: 'published'; message: string }>('/api/my/properties/' + encodeURIComponent(result.data.id) + '/publish', { method: 'POST' })
    setBusy(false)
    if (!publication.ok) {
      setError('Your draft is saved, but it could not be published: ' + publication.error)
      setNotice('Your listing remains private. Check that it has at least one photo and one seller-provided document.')
      return
    }
    setNotice(publication.data.message)
    setUploadStatus('All photos uploaded' + (evidenceFiles.length ? ' and evidence files stored in ImageKit' : '') + '; listing published.')
  }

  if (checking) return <main className="page-shell"><div className="container"><p className="status-message">Checking your account…</p></div></main>
  if (!authorized) return <main className="page-shell"><div className="container"><p className={error ? 'status-message error' : 'status-message'} role={error ? 'alert' : undefined}>{error || 'Redirecting to sign in…'}</p>{error && <button className="btn btn-outline" type="button" onClick={() => window.location.reload()}>Retry session check</button>}</div></main>

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Property owners</SectionKicker><h1>List a property.<br /><span className="serif">With clarity.</span></h1><p>Sign-in is required. A listing is published after at least one property photo and one seller-provided PDF/image document are saved. It remains Unverified until an administrator manually checks the details.</p></div>
    <div className="stepper">{steps.map((label, index) => <div className={'step ' + (step === index + 1 ? 'active' : '')} key={label}><span className="mono">0{index + 1}</span> {label}</div>)}</div>
    <form className="form-card" style={{ maxWidth: 820 }} onSubmit={submit}>
      {step === 1 && <><h2>What are you listing?</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-purpose">Purpose</label><select className="form-control" id="listing-purpose" value={purpose} onChange={e => setPurpose(e.target.value as 'sale' | 'rent')}><option value="sale">For sale</option><option value="rent">For rent</option></select></div><div className="form-field"><label htmlFor="listing-type">Property type</label><select className="form-control" id="listing-type" value={propertyType} onChange={e => setPropertyType(e.target.value)}>{['Apartment', 'House', 'Villa', 'Studio', 'Plot'].map(type => <option key={type}>{type}</option>)}</select></div></div></>}
      {step === 2 && <><h2>Start with the essentials.</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-title">Listing title</label><input className="form-control" id="listing-title" required minLength={6} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="A clear description of the property" /></div><div className="form-field"><label htmlFor="listing-location">Address / neighbourhood</label><input className="form-control" id="listing-location" required maxLength={240} value={locationText} onChange={e => setLocationText(e.target.value)} placeholder="Neighbourhood, city" /></div><div className="form-field"><label htmlFor="listing-city">City</label><input className="form-control" id="listing-city" required maxLength={100} value={city} onChange={e => setCity(e.target.value)} placeholder="City" /></div><div className="form-field"><label htmlFor="listing-price">Price (₹)</label><input className="form-control" id="listing-price" required type="number" min="1" step="1" value={price} onChange={e => setPrice(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-beds">Bedrooms</label><input className="form-control" id="listing-beds" type="number" min="0" max="100" value={bedrooms} onChange={e => setBedrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-baths">Bathrooms</label><input className="form-control" id="listing-baths" type="number" min="0" max="100" value={bathrooms} onChange={e => setBathrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-area">Area (sq ft)</label><input className="form-control" id="listing-area" type="number" min="0" max="100000000" value={area} onChange={e => setArea(e.target.value)} /></div></div>
      <section className="ownership-declaration-panel" aria-labelledby="ownership-declaration-title">
        <h3 id="ownership-declaration-title">Ownership and legal status</h3>
        <p className="muted">Tell buyers how this property is owned. ZameenHub does not decide legal ownership or sale authority.</p>
        <div className="form-field"><label htmlFor="ownership-type">Ownership arrangement</label><select className="form-control" id="ownership-type" value={ownershipType} onChange={e=>setOwnershipType(e.target.value as typeof ownershipType)}><option value="self_owned">Self-owned</option><option value="inherited">Inherited</option><option value="jointly_owned">Jointly owned</option><option value="authorized_representative">Authorized representative</option><option value="other">Other legally recognized arrangement</option></select></div>
        {ownershipType==='inherited'&&<div className="evidence-privacy-warning"><strong>Inherited property — no universal checklist.</strong><p>Depending on personal law, title history and jurisdiction, relevant material may include a legal heir certificate, probate, succession certificate, letters of administration, previous owner's death certificate, release/relinquishment deed, family settlement or court order. Not every item applies. Disclose relevant co-heirs, competing claims and consent requirements. Uploading a document does not establish sole ownership or sale authority.</p></div>}
        {ownershipType==='jointly_owned'&&<p className="muted">Disclose known co-owners and whether their participation or consent is required.</p>}
        <div className="form-field"><label htmlFor="ownership-declaration">Ownership / authority declaration</label><textarea className="form-control" id="ownership-declaration" minLength={10} maxLength={1800} required value={ownershipDeclaration} onChange={e=>setOwnershipDeclaration(e.target.value)} placeholder="Describe the ownership arrangement, who is authorized to list, and any known co-owners or heirs." /></div>
        <label className="evidence-privacy-ack"><input type="checkbox" checked={knownDisputes} onChange={e=>setKnownDisputes(e.target.checked)} /><span>There are known disputes, litigation, competing claims or encumbrances to disclose.</span></label>
        {knownDisputes&&<div className="form-field"><label htmlFor="known-disputes">Known dispute / encumbrance disclosure</label><textarea className="form-control" id="known-disputes" minLength={10} maxLength={1800} required value={disputeDisclosure} onChange={e=>setDisputeDisclosure(e.target.value)} placeholder="Describe the known matter and current status, without exposing private family or identity details." /></div>}
        <label className="evidence-privacy-ack"><input type="checkbox" checked={authorityToListConfirmed} onChange={e=>setAuthorityToListConfirmed(e.target.checked)} /><span>I confirm that I own this property or am legally authorized to list it, and that the information above is accurate to the best of my knowledge. I will disclose relevant co-owners/heirs and update material changes.</span></label>
      </section></>}
      {step === 3 && <><h2>Add the details that help someone decide.</h2><div className="form-field"><label htmlFor="listing-description">Description</label><textarea className="form-control" id="listing-description" maxLength={8000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the layout, condition, nearby conveniences and important details." /><small>Do not include personal documents or sensitive information.</small></div><fieldset className="amenity-picker"><legend>Property amenities</legend><p className="muted">Select only features that are genuinely available at this property.</p><div className="amenity-options">{PROPERTY_AMENITIES.map(amenity => <label className="amenity-option" key={amenity}><input type="checkbox" checked={amenities.includes(amenity)} onChange={event => setAmenities(current => event.target.checked ? [...current, amenity] : current.filter(item => item !== amenity))} /> <span>{amenity}</span></label>)}</div></fieldset>
      <section className="media-editor" aria-labelledby="property-media-heading">
        <h3 id="property-media-heading">Property photos</h3>
        <p className="muted">At least one photo is required for public publishing. Upload up to five JPEG, PNG or WebP photos. ZameenHub stores the media in ImageKit and keeps only the file reference in D1. Maximum 10 MB per image.</p>
        <div className="form-field">
          <label htmlFor="property-images">Choose property photos</label>
          <input className="form-control" id="property-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => {
            const files = Array.from(event.target.files || []).slice(0, 5)
            if (files.some(file => file.size > 10 * 1024 * 1024)) { setError('Each photo must be 10 MB or smaller.'); event.target.value = ''; return }
            setImageFiles(files); setError('')
          }} />
          <small>{imageFiles.length} of 5 photos selected.</small>
        </div>
        {uploadStatus && <p className="status-message" role="status">{uploadStatus}{busy && imageFiles.length > 0 ? ' · ' + uploadProgress + '%' : ''}</p>}
      </section>
      <section className="verification-editor evidence-editor" aria-labelledby="property-documents-heading">
        <div className="evidence-editor-banner">
          <SectionKicker>THE ZAMEENHUB DIFFERENCE</SectionKicker>
          <h3 id="property-documents-heading">Property Evidence Room.</h3>
          <p>DON'T TRUST US. CHECK THE DAMN THING YOURSELF.</p>
          <span>Give buyers the evidence. Let them inspect it independently.</span>
        </div>
        <p className="muted">Upload supporting property records as PDF or image files. Files are stored and delivered through ImageKit and can be opened by anyone viewing your published listing. ZameenHub does not legally authenticate documents or confirm ownership.</p>
        <div className="evidence-privacy-warning" role="note">
          <strong>Privacy warning — redact personal information first.</strong>
          <p>Never upload an Aadhaar card, PAN card, passport, bank statement, full ID number, QR code, personal phone number, bank details, or an unredacted signature. Share only the property-related parts buyers need to inspect. Upload a redacted copy; do not upload the document if you cannot safely hide private details.</p>
        </div>
        <div className="form-field evidence-upload-field">
          <label htmlFor="property-evidence-files">Upload property evidence to ImageKit</label>
          <input className="form-control" id="property-evidence-files" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" multiple onChange={event => {
            const remaining = Math.max(0, 10 - documents.length - evidenceFiles.length)
            const selected = Array.from(event.target.files || [])
            if (selected.some(file => file.size > 10 * 1024 * 1024)) { setError('Each evidence file must be 10 MB or smaller.'); event.target.value = ''; return }
            if (selected.some(file => !['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type.toLowerCase()))) { setError('Evidence files must be PDF, JPEG, PNG or WebP.'); event.target.value = ''; return }
            setEvidenceFiles(current=>[...current,...selected.slice(0,remaining).map(file=>({file,description:file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ').slice(0,180),category:ownershipType==='inherited'?'inheritance':'ownership' as 'ownership'|'inheritance',sourceDate:'',issuingAuthority:'',jurisdiction:''}))])
            setError('')
            event.target.value = ''
          }} />
          <small>PDF, JPEG, PNG or WebP · up to 10 files total · max 10 MB each · uploaded to ImageKit.</small>
        </div>
        {evidenceFiles.map((item, index) => <div className="evidence-selected-file" key={index}>
          <div className="evidence-selected-file-name"><strong>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(2)} MB</small></div>
          <div className="form-field"><label htmlFor={'new-evidence-description-' + index}>What does this document prove?</label><input className="form-control" id={'new-evidence-description-' + index} value={item.description} maxLength={180} onChange={event => setEvidenceFiles(current => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} placeholder="e.g. Property tax receipt" /></div>
          <div className="form-grid">
            <div className="form-field"><label htmlFor={'new-evidence-category-'+index}>Evidence category</label><select className="form-control" id={'new-evidence-category-'+index} value={item.category} onChange={event=>setEvidenceFiles(current=>current.map((entry,itemIndex)=>itemIndex===index?{...entry,category:event.target.value as typeof entry.category}:entry))}><option value="ownership">Ownership</option><option value="inheritance">Inheritance</option><option value="legal_status">Legal status / dispute</option><option value="supporting">Supporting record</option><option value="other">Other</option></select></div>
            <div className="form-field"><label htmlFor={'new-evidence-date-'+index}>Document date</label><input className="form-control" id={'new-evidence-date-'+index} type="date" value={item.sourceDate} onChange={event=>setEvidenceFiles(current=>current.map((entry,itemIndex)=>itemIndex===index?{...entry,sourceDate:event.target.value}:entry))}/></div>
            <div className="form-field"><label htmlFor={'new-evidence-authority-'+index}>Issuing authority</label><input className="form-control" id={'new-evidence-authority-'+index} maxLength={160} value={item.issuingAuthority} onChange={event=>setEvidenceFiles(current=>current.map((entry,itemIndex)=>itemIndex===index?{...entry,issuingAuthority:event.target.value}:entry))} placeholder="e.g. Sub-Registrar / Revenue Office"/></div>
            <div className="form-field"><label htmlFor={'new-evidence-jurisdiction-'+index}>Jurisdiction / location</label><input className="form-control" id={'new-evidence-jurisdiction-'+index} maxLength={120} value={item.jurisdiction} onChange={event=>setEvidenceFiles(current=>current.map((entry,itemIndex)=>itemIndex===index?{...entry,jurisdiction:event.target.value}:entry))} placeholder="District / State"/></div>
          </div>
          <button className="btn btn-outline media-remove" type="button" onClick={() => setEvidenceFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remove file</button>
        </div>)}
        <label className="evidence-privacy-ack"><input type="checkbox" checked={privacyAcknowledged} onChange={event => setPrivacyAcknowledged(event.target.checked)} /> <span>I confirm that I own or am authorized to share these files and links publicly, and that the material is accurate and redacted to remove unnecessary personal or confidential information.</span></label>
        <details className="evidence-link-fallback">
          <summary>Already have a public HTTPS evidence link?</summary>
          <p className="muted">You can keep using an existing public PDF/image URL. New file uploads above are stored on ImageKit.</p>
          {documents.map((document, index) => <div className="media-url-row" key={index}>
            <div className="form-field"><label htmlFor={'property-document-type-' + index}>Format</label><select className="form-control" id={'property-document-type-' + index} value={document.documentType} onChange={event => setDocuments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, documentType: event.target.value as 'pdf' | 'image' } : item))}><option value="pdf">PDF</option><option value="image">Image</option></select></div>
            <div className="form-field"><label htmlFor={'property-document-description-' + index}>Description</label><input className="form-control" id={'property-document-description-' + index} value={document.description} maxLength={180} onChange={event => setDocuments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} placeholder="e.g. Property tax receipt" /></div>
            <div className="form-field"><label htmlFor={'property-document-url-' + index}>Original HTTPS link</label><input className="form-control" id={'property-document-url-' + index} type="url" maxLength={2000} value={document.url} onChange={event => setDocuments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} placeholder="https://example.com/record.pdf" /></div>
            <div className="form-field"><label>Evidence category</label><select className="form-control" value={document.category} onChange={event=>setDocuments(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,category:event.target.value as typeof item.category}:item))}><option value="ownership">Ownership</option><option value="inheritance">Inheritance</option><option value="legal_status">Legal status / dispute</option><option value="supporting">Supporting record</option><option value="other">Other</option></select></div>
            <div className="form-grid"><div className="form-field"><label>Document date</label><input className="form-control" type="date" value={document.sourceDate} onChange={event=>setDocuments(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,sourceDate:event.target.value}:item))}/></div><div className="form-field"><label>Issuing authority</label><input className="form-control" maxLength={160} value={document.issuingAuthority} onChange={event=>setDocuments(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,issuingAuthority:event.target.value}:item))}/></div><div className="form-field"><label>Jurisdiction</label><input className="form-control" maxLength={120} value={document.jurisdiction} onChange={event=>setDocuments(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,jurisdiction:event.target.value}:item))}/></div></div>
            <button className="btn btn-outline media-remove" type="button" onClick={() => setDocuments(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remove link</button>
          </div>)}
          {documents.length + evidenceFiles.length < 10 && <button className="btn btn-outline" type="button" onClick={() => setDocuments(current => current.length + evidenceFiles.length < 10 ? [...current, {documentType:'pdf',description:'',url:'',category:ownershipType==='inherited'?'inheritance':'ownership',sourceDate:'',issuingAuthority:'',jurisdiction:''}] : current)}>Add existing link</button>}
        </details>
        {uploadStatus && <p className="status-message" role="status">{uploadStatus}{busy ? ' · ' + uploadProgress + '%' : ''}</p>}
      </section>

    </>}
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <div className="status-message success" role="status">{notice} <a href="/my-listings">View my listings</a></div>}
      <div className="listing-actions"><button className="btn btn-outline" type="button" disabled={step === 1 || busy} onClick={() => setStep(Math.max(1, step - 1))}>Back</button>{!notice && <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : step === 3 ? 'Publish listing' : 'Continue'}</button>}</div>
    </form>
  </div></main>
}
