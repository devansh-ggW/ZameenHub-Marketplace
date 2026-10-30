#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const errors = []
const required = [
  'src/App.tsx','src/lib/auth.ts','src/lib/data.ts','src/lib/media.ts',
  'src/listing-page.tsx','src/edit-listing-page.tsx','src/messages-page.tsx',
  'src/pages.tsx','src/components.tsx','src/account-pages.tsx',
  'worker/index.ts','worker/imagekit.ts','worker/totp.ts','wrangler.toml',
  'migrations/0001_initial.sql','migrations/0004_media_verification.sql',
  'migrations/0005_property_chat.sql','migrations/0006_imagekit_documents_message_actions.sql',
  'scripts/check-migrations.py','scripts/test-totp.mjs','public/_headers',
]
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push('Missing required file: ' + file)
const read = file => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : ''
const worker = read('worker/index.ts')
const imagekit = read('worker/imagekit.ts')
const migration = read('migrations/0006_imagekit_documents_message_actions.sql')
const mediaMigration = read('migrations/0004_media_verification.sql')
const app = read('src/App.tsx')
const pages = read('src/pages.tsx')
const components = read('src/components.tsx')
const listing = read('src/listing-page.tsx')
const editing = read('src/edit-listing-page.tsx')
const messages = read('src/messages-page.tsx')
const auth = read('src/lib/auth.ts')
const media = read('src/lib/media.ts')
const wrangler = read('wrangler.toml')
const docs = read('README.md') + read('PRODUCTION-CHECKLIST.md')

for (const route of ['/signup','/login','/list-property','/edit-listing/:id','/messages','/review-queue','/profile']) {
  if (!app.includes(route)) errors.push('Missing application route: ' + route)
}
for (const endpoint of ['/api/account/profile-image','/api/my/properties/','/api/properties','/api/conversations','/api/messages/','/api/auth/mfa/setup','/api/auth/mfa/verify']) {
  if (!worker.includes(endpoint)) errors.push('Worker route marker missing: ' + endpoint)
}
if (worker.includes('R2Bucket') || wrangler.includes('[[r2_buckets]]') || docs.includes('Cloudflare R2')) {
  errors.push('R2 remains in the active Worker/configuration or deployment documentation')
}
if (worker.includes('sanitizeVideoUrl') || pages.includes('PropertyVideo') || components.includes('PropertyVideo')
  || listing.toLowerCase().includes('video') || editing.toLowerCase().includes('video')) {
  errors.push('Phase 1 video controls or active video handling remain')
}
if (!imagekit.includes('request.body?.getReader()') || !imagekit.includes('MAX_IMAGE_BYTES')
  || !imagekit.includes('IMAGEKIT_PRIVATE_KEY') || !imagekit.includes('api.imagekit.io')) {
  errors.push('ImageKit upload module is missing bounded upload, restricted private-key, or file deletion handling')
}
if (!worker.includes('readValidatedImage(request)') || !worker.includes('uploadImageKitImage(env,image')
  || !worker.includes('imagekit_file_id') || !worker.includes('queueImageKitCleanup')) {
  errors.push('Worker ImageKit upload, metadata persistence, or cleanup queue is not wired')
}
if (!auth.includes('init.body instanceof FormData') || !media.includes('FormData()')
  || !media.includes('uploadPropertyImage') || !media.includes('uploadProfileImage')) {
  errors.push('Frontend multipart ImageKit upload helpers are not configured correctly')
}
if (!migration.includes('CREATE TABLE IF NOT EXISTS property_documents')
  || !migration.includes('imagekit_cleanup_queue') || !migration.includes('property_message_hidden')
  || !migration.includes('imagekit_file_id') || !migration.includes('property_media_phase1_no_video_insert')) {
  errors.push('Migration 0006 is missing ImageKit, seller evidence, cleanup, message action, or Phase 1 video constraints')
}
if (!worker.includes('sanitizePropertyDocuments') || !worker.includes('documentInsertStatements')
  || !pages.includes('property.documents?.length') || !pages.includes('rel="noopener noreferrer"')) {
  errors.push('Seller-hosted evidence links are not validated, persisted, and rendered as safe external links')
}
if (worker.includes('fetch(') && worker.includes('source_url') && /fetch\([^\n]*source_url/.test(worker)) {
  errors.push('Worker must not fetch seller-provided document URLs')
}
if (worker.includes("status:'published',verified:false") || !worker.includes("'not-run','pending','unverified'")) {
  errors.push('New property submissions must remain pending until moderation')
}
if (!worker.includes("verified:verificationStatus==='verified'") || !pages.includes("property.verified ? 'Verified · manually reviewed'")) {
  errors.push('Public verification badges must map to the separate manual-review status')
}
if (pages.includes('Cloudflare') || pages.includes('Workers AI') || pages.includes('AI screened')) {
  errors.push('Buyer-facing property detail still exposes implementation/content-screening wording')
}
if (!messages.includes("method: 'PATCH'") || !messages.includes('/for-me') || !messages.includes('/forward')
  || !messages.includes('Delete for everyone') || !messages.includes('Reply')) {
  errors.push('Messaging UI is missing reply, forward, edit, or deletion actions')
}
for (const marker of ['replyToMessageId','edited_at','deleted_at','property_message_hidden','forwarded_from_sender_id']) {
  if (!worker.includes(marker)) errors.push('Messaging Worker is missing action marker: ' + marker)
}
if (messages.includes('void loadConversations()') && messages.includes('setInterval(() => {\n      if (!document.hidden) void loadMessages(true)')) {
  errors.push('Message polling must not refresh the full conversation list on each five-second message poll')
}
if (!messages.includes('60_000') || !messages.includes('document.hidden')) {
  errors.push('Inbox summaries should refresh on a separate, visibility-aware interval')
}
if (!listing.includes('uploadPropertyImage') || !listing.includes('seller-hosted property evidence')
  || listing.includes('Add another photo URL')) errors.push('Create-listing form must upload photos and accept seller-hosted evidence')
if (!editing.includes('uploadPropertyImage') || !editing.includes('seller-hosted property evidence')
  || !editing.includes('/images/')) errors.push('Edit-listing form must manage ImageKit photos and seller evidence')
if (!read('src/account-pages.tsx').includes('uploadProfileImage')) errors.push('Profile photo UI is not wired to ImageKit')
if (!read('src/checklist-does-not-exist')) { /* no-op: static check remains intentionally side-effect-free */ }
for (const marker of ['mfa_enabled','mfa_secret_ciphertext','mfa_recovery_codes']) {
  if (!read('migrations/0003_security_mfa_ai.sql').includes(marker)) errors.push('Existing MFA migration marker missing: ' + marker)
}
if (!wrangler.includes('run_worker_first = ["/api/*"]')) errors.push('Worker API routing must precede SPA asset fallback')
if (wrangler.includes('RESEND_API_KEY')) errors.push('RESEND_API_KEY must be stored as a Worker Secret, not in wrangler.toml')
if (!read('public/_headers').includes('Strict-Transport-Security:')) errors.push('Static deployment headers are missing HSTS')
if (!read('src/account-security.tsx').includes('/api/account/delete')
  || !read('src/account-security.tsx').includes('confirmText: deleteConfirmation')) errors.push('Account deletion must require reauthentication and typed DELETE')
if (!read('src/account-security.tsx').includes('/api/auth/mfa/setup')
  || !read('src/auth-pages.tsx').includes('/api/auth/mfa/verify')) errors.push('TOTP enrollment/sign-in UI is not connected')
if (!read('src/pages.tsx').includes('getProperties(new URLSearchParams())')) errors.push('Homepage must use real marketplace data')
if (errors.length) {
  console.error('Production smoke checks failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}
console.log('Static production smoke checks passed. This checks repository wiring only; it is not a live ImageKit, D1, authentication, security, or browser test.')
