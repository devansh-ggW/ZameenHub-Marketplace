export const MAX_PROPERTY_DOCUMENT_BYTES=8*1024*1024
export const MAX_PROPERTY_DOCUMENTS_PER_PROPERTY=10
export const DOCUMENT_TYPE_LABELS={sale_deed:'Sale deed',property_tax_receipt:'Property tax receipt',registry_extract:'Registry extract',encumbrance_certificate:'Encumbrance certificate',approved_plan:'Approved plan',rera_record:'RERA record',other:'Other supporting record'} as const
export type PropertyDocumentType=keyof typeof DOCUMENT_TYPE_LABELS
export type PropertyDocumentRole='private_original'|'public_copy'
export type PropertyDocumentFormat={extension:'.pdf'|'.jpg'|'.jpeg'|'.png'|'.webp';contentType:'application/pdf'|'image/jpeg'|'image/png'|'image/webp'}
const allowedExtensions:Record<PropertyDocumentFormat['contentType'],readonly string[]>={'application/pdf':['pdf'],'image/jpeg':['jpg','jpeg'],'image/png':['png'],'image/webp':['webp']}
export function sanitizeDocumentFileName(input:unknown):{basename:string;extension:string}|null {
 if(typeof input!=='string'||input.length>900)return null
 const basename=(input.normalize('NFKC').split(/[\\/]/).pop()||'').replace(/[\u0000-\u001f\u007f]/g,'').trim()
 if(!basename||basename.length>255)return null
 const match=/\.([a-z0-9]{1,8})$/i.exec(basename);if(!match)return null
 const extension=match[1].toLowerCase()
 if(!['pdf','jpg','jpeg','png','webp'].includes(extension))return null
 return {basename,extension}
}
export function detectDocumentFormat(bytes:Uint8Array,fileName:unknown):PropertyDocumentFormat|null {
 if(!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>MAX_PROPERTY_DOCUMENT_BYTES)return null
 const file=sanitizeDocumentFileName(fileName);if(!file)return null
 let contentType:PropertyDocumentFormat['contentType']|null=null
 const starts=(signature:number[])=>bytes.length>=signature.length&&signature.every((value,index)=>bytes[index]===value)
 const asciiAt=(offset:number,value:string)=>bytes.length>=offset+value.length&&[...value].every((character,index)=>bytes[offset+index]===character.charCodeAt(0))
 const u32=(offset:number)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(offset,true)

 // Lightweight structure checks reject common truncation, but do not fully parse or scan files.
 if(asciiAt(0,'%PDF-')&&bytes.length>=32){
  const tail=new TextDecoder().decode(bytes.subarray(Math.max(0,bytes.length-2048)))
  const eof=tail.lastIndexOf('%%EOF'),xref=tail.lastIndexOf('startxref')
  if(eof>=0&&xref>=0&&xref<eof&&tail.slice(eof+5).trim()==='')contentType='application/pdf'
 }else if(starts([0xff,0xd8,0xff])&&bytes.length>=16&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9){
  contentType='image/jpeg'
 }else if(starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])&&bytes.length>=45&&bytes[12]===0&&bytes[13]===0&&bytes[14]===0&&bytes[15]===13&&asciiAt(16,'IHDR')&&bytes[bytes.length-12]===0&&bytes[bytes.length-11]===0&&bytes[bytes.length-10]===0&&bytes[bytes.length-9]===0&&asciiAt(bytes.length-8,'IEND')){
  contentType='image/png'
 }else if(asciiAt(0,'RIFF')&&asciiAt(8,'WEBP')&&bytes.length>=21){
  try{
   const chunkSize=u32(16),chunkType=['VP8 ','VP8L','VP8X'].some(type=>asciiAt(12,type))
   const required=20+chunkSize+(chunkSize%2)
   if(u32(4)===bytes.length-8&&chunkType&&chunkSize>0&&required<=bytes.length)contentType='image/webp'
  }catch{/* truncated RIFF/WebP structures are rejected */}
 }
 if(!contentType||!allowedExtensions[contentType].includes(file.extension))return null
 return {extension:('.'+file.extension) as PropertyDocumentFormat['extension'],contentType}
}
export function sanitizeDocumentLabel(input:unknown,fallback:string):string|null {
 if(typeof input!=='string')return null
 const normalized=input.normalize('NFKC').replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/[<>]/g,'').replace(/\s+/g,' ').trim()
 if(!normalized)return fallback
 if(normalized.length<2||normalized.length>100)return null
 return normalized
}
export function isPropertyDocumentType(input:unknown):input is PropertyDocumentType{return typeof input==='string'&&Object.prototype.hasOwnProperty.call(DOCUMENT_TYPE_LABELS,input)}
export function isPropertyDocumentRole(input:unknown):input is PropertyDocumentRole{return input==='private_original'||input==='public_copy'}
