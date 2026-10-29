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
 if(asciiAt(0,'%PDF-'))contentType='application/pdf'
 else if(starts([0xff,0xd8,0xff]))contentType='image/jpeg'
 else if(starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))contentType='image/png'
 else if(asciiAt(0,'RIFF')&&asciiAt(8,'WEBP'))contentType='image/webp'
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
