import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Forward, MoreHorizontal, Pencil, Reply, Trash2, X } from 'lucide-react'
import { EmptyState, SectionKicker } from './components'
import { apiRequest, getSession } from './lib/auth'

type Conversation = {
  id: string
  propertyId: string
  propertySlug: string
  propertyTitle: string
  propertyCity: string
  buyerId: string
  ownerId: string
  otherUserName: string
  role: 'buyer' | 'owner'
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}
type ChatMessage = {
  id: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
  readAt: string | null
  editedAt?: string | null
  deletedAt?: string | null
  replyToMessageId?: string | null
  replyToBody?: string | null
  replyToSenderName?: string | null
  forwardedFromMessageId?: string | null
}

export function MessagesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('conversation') || ''
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null)
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null)
  const [forwardTarget, setForwardTarget] = useState('')
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [actionBusyId, setActionBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selected = useMemo(() => conversations.find(item => item.id === selectedId) ?? null, [conversations, selectedId])

  const loadConversations = useCallback(async () => {
    const result = await apiRequest<Conversation[]>('/api/conversations')
    if (result.ok) { setConversations(result.data); setError('') }
    else setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    void getSession().then(session => {
      if (!active) return
      if (!session.ok || !session.data.authenticated || !session.data.user) {
        navigate('/login?next=' + encodeURIComponent('/messages' + window.location.search), { replace: true })
        return
      }
      setCurrentUserId(session.data.user.id)
      void loadConversations()
    })
    return () => { active = false }
  }, [navigate, loadConversations])

  const loadMessages = useCallback(async (quiet = false) => {
    if (!selectedId) { setMessages([]); return }
    if (!quiet) setMessagesLoading(true)
    const result = await apiRequest<ChatMessage[]>('/api/conversations/' + encodeURIComponent(selectedId) + '/messages')
    if (result.ok) {
      setMessages(result.data)
      const hasUnreadIncoming = result.data.some(message => message.senderId !== currentUserId && !message.readAt && !message.deletedAt)
      if (!quiet || hasUnreadIncoming) {
        await apiRequest<{ read: boolean }>('/api/conversations/' + encodeURIComponent(selectedId) + '/read', { method: 'PATCH', body: '{}' })
        void loadConversations()
      }
      setError('')
    } else if (!quiet) setError(result.error)
    if (!quiet) setMessagesLoading(false)
  }, [selectedId, loadConversations, currentUserId])

  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    void loadMessages()
    const timer = window.setInterval(() => { void loadMessages(true) }, 5000)
    return () => window.clearInterval(timer)
  }, [selectedId, loadMessages])

  function openConversation(id: string) {
    setParams({ conversation: id })
    setDraft('')
    setReplyTo(null)
    setEditingMessage(null)
    setNotice('')
    setError('')
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!selectedId || !body || sending) return
    setSending(true); setError(''); setNotice('')
    if (editingMessage) {
      const result = await apiRequest<{ id: string; body: string; editedAt: string }>('/api/conversations/' + encodeURIComponent(selectedId) + '/messages/' + encodeURIComponent(editingMessage.id), {
        method: 'PATCH', body: JSON.stringify({ message: body }),
      })
      setSending(false)
      if (!result.ok) { setError(result.error); return }
      setDraft('')
      setEditingMessage(null)
      await Promise.all([loadMessages(true), loadConversations()])
      setNotice('Message updated.')
      return
    }
    const result = await apiRequest<ChatMessage>('/api/conversations/' + encodeURIComponent(selectedId) + '/messages', {
      method: 'POST',
      body: JSON.stringify({ message: body, replyToMessageId: replyTo?.id || undefined }),
    })
    setSending(false)
    if (!result.ok) { setError(result.error); return }
    setDraft('')
    setReplyTo(null)
    await Promise.all([loadMessages(true), loadConversations()])
    setNotice('Message sent.')
  }

  function startReply(message: ChatMessage) {
    setEditingMessage(null)
    setReplyTo(message)
    setDraft('')
    setError('')
    document.getElementById('chat-message')?.focus()
  }

  function startEdit(message: ChatMessage) {
    setReplyTo(null)
    setEditingMessage(message)
    setDraft(message.body)
    setError('')
    document.getElementById('chat-message')?.focus()
  }

  async function deleteMessage(message: ChatMessage, scope: 'me' | 'everyone') {
    const prompt = scope === 'me'
      ? 'Delete this message from your view? Other participants will still see it.'
      : 'Delete this message for everyone? The message will be replaced with a deleted-message notice.'
    if (!window.confirm(prompt)) return
    setActionBusyId(message.id); setError(''); setNotice('')
    const result = await apiRequest<{ id: string; deletedFor: string }>(
      '/api/conversations/' + encodeURIComponent(selectedId) + '/messages/' + encodeURIComponent(message.id),
      { method: 'DELETE', body: JSON.stringify({ scope }) },
    )
    setActionBusyId('')
    if (!result.ok) { setError(result.error); return }
    await Promise.all([loadMessages(true), loadConversations()])
    setNotice(scope === 'me' ? 'Message deleted from your view.' : 'Message deleted for everyone.')
  }

  function startForward(message: ChatMessage) {
    const target = conversations.find(item => item.id !== selectedId)
    setForwardingMessage(message)
    setForwardTarget(target?.id || '')
    setError('')
    setNotice('')
  }

  async function forwardMessage() {
    if (!forwardingMessage || !forwardTarget || forwardingMessage.deletedAt) return
    setActionBusyId(forwardingMessage.id); setError('')
    const result = await apiRequest<ChatMessage>('/api/conversations/' + encodeURIComponent(forwardTarget) + '/messages', {
      method: 'POST',
      body: JSON.stringify({ message: forwardingMessage.body, forwardedFromMessageId: forwardingMessage.id }),
    })
    setActionBusyId('')
    if (!result.ok) { setError(result.error); return }
    setForwardingMessage(null)
    await loadConversations()
    setNotice('Message forwarded.')
  }

  return <main className="page-shell messages-page"><div className="container">
    <div className="page-title"><SectionKicker>Private conversations</SectionKicker><h1>Messages.</h1><p>Talk directly with a property owner or a viewer about a published listing. Keep payments and personal documents out of chat, and verify property details independently.</p></div>
    {error && <p className="status-message error" role="alert">{error}</p>}
    {notice && <p className="status-message success" role="status">{notice}</p>}
    <div className="messages-layout">
      <aside className="conversation-sidebar" aria-label="Conversations">
        <div className="conversation-sidebar-head"><h2>Your conversations</h2><span>{conversations.length}</span></div>
        {loading ? <p className="muted">Loading conversations…</p> : conversations.length === 0 ? <p className="muted">No chats yet. Open a published property and select “Chat with owner” to start one.</p> : conversations.map(item =>
          <button key={item.id} type="button" className={'conversation-row' + (item.id === selectedId ? ' active' : '')} onClick={() => openConversation(item.id)}>
            <span className="conversation-row-top"><strong>{item.otherUserName || (item.role === 'buyer' ? 'Property owner' : 'Viewer')}</strong>{item.unreadCount > 0 && <span className="conversation-unread">{item.unreadCount}</span>}</span>
            <span className="conversation-property">{item.propertyTitle}</span>
            <span className="conversation-preview">{item.lastMessage || 'Conversation started'}</span>
            <span className="conversation-time">{item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
          </button>
        )}
      </aside>
      <section className="conversation-panel" aria-label="Selected conversation">
        {!selected ? <EmptyState title="Choose a conversation." copy="Select a conversation from the inbox, or start a chat from any published property detail page." /> : <>
          <header className="chat-header"><div><SectionKicker>{selected.role === 'owner' ? 'Viewer conversation' : 'Owner conversation'}</SectionKicker><h2>{selected.otherUserName || (selected.role === 'buyer' ? 'Property owner' : 'Viewer')}</h2><p>{selected.propertyTitle} · {selected.propertyCity}</p></div><Link className="btn btn-outline" to={'/properties/' + selected.propertySlug}>View listing</Link></header>
          <div className="chat-messages" aria-live="polite">
            {messagesLoading && messages.length === 0 ? <p className="muted">Loading messages…</p> : messages.length === 0 ? <p className="muted">Start the conversation with a useful question or detail.</p> : messages.map(message => {
              const mine = message.senderId === currentUserId
              const deleted = !!message.deletedAt
              return <article key={message.id} className={'chat-message' + (mine ? ' mine' : '') + (deleted ? ' deleted' : '')}>
                <div className="chat-message-meta"><strong>{mine ? 'You' : message.senderName}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</time><details className="chat-message-options"><summary aria-label="Message options" title="Message options"><MoreHorizontal size={16} /></summary><div className="chat-message-options-menu">
                  {!deleted && <><button type="button" onClick={() => startReply(message)}><Reply size={14} /> Reply</button><button type="button" onClick={() => startForward(message)}><Forward size={14} /> Forward</button>{mine && <button type="button" onClick={() => startEdit(message)}><Pencil size={14} /> Edit message</button>}</>}
                  <button type="button" disabled={actionBusyId === message.id} onClick={() => void deleteMessage(message, 'me')}><Trash2 size={14} /> Delete for me</button>
                  {mine && !deleted && <button type="button" className="danger-action" disabled={actionBusyId === message.id} onClick={() => void deleteMessage(message, 'everyone')}><Trash2 size={14} /> Delete for everyone</button>}
                </div></details></div>
                {message.forwardedFromMessageId && !deleted && <div className="chat-message-label"><Forward size={12} /> Forwarded</div>}
                {message.replyToMessageId && !deleted && <div className="chat-reply-context"><strong>Reply to {message.replyToSenderName || 'message'}</strong><span>{message.replyToBody || 'Message unavailable'}</span></div>}
                {deleted ? <p className="chat-deleted-text">This message was deleted.</p> : <p>{message.body}{message.editedAt && <span className="chat-edited-mark"> (edited)</span>}</p>}
              </article>
            })}
          </div>
          <form className="chat-composer" onSubmit={sendMessage}>
            {replyTo && <div className="chat-composer-context"><div><strong>Replying to {replyTo.senderId === currentUserId ? 'your message' : replyTo.senderName}</strong><span>{replyTo.body}</span></div><button type="button" className="icon-btn" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={15} /></button></div>}
            {editingMessage && <div className="chat-composer-context"><div><strong>Editing message</strong><span>Change the text, then save your edit.</span></div><button type="button" className="icon-btn" aria-label="Cancel edit" onClick={() => { setEditingMessage(null); setDraft('') }}><X size={15} /></button></div>}
            <label htmlFor="chat-message">{editingMessage ? 'Edit message' : 'Message'}</label>
            <textarea id="chat-message" className="form-control chat-composer-input" required maxLength={2000} rows={5} value={draft} onChange={event => setDraft(event.target.value)} placeholder={editingMessage ? 'Edit your message…' : 'Ask about availability, location, or arrange a viewing…'} />
            <div className="chat-composer-footer"><small>{draft.trim().length}/2000 · Messages are visible only to conversation participants.</small><button className="btn btn-primary" disabled={sending || !draft.trim()}>{sending ? 'Please wait…' : editingMessage ? 'Save edit' : 'Send message'}</button></div>
          </form>
        </>}
      </section>
    </div>
    {forwardingMessage && <div className="forward-dialog-backdrop"><section className="forward-dialog" role="dialog" aria-modal="true" aria-labelledby="forward-dialog-title"><button type="button" className="icon-btn forward-close" aria-label="Close forward dialog" onClick={() => setForwardingMessage(null)}><X size={18} /></button><SectionKicker>Message action</SectionKicker><h2 id="forward-dialog-title">Forward message.</h2><p className="muted">Choose another conversation to send a copy of this message.</p><div className="forward-preview">{forwardingMessage.body}</div><div className="form-field"><label htmlFor="forward-target">Forward to</label><select id="forward-target" className="form-control" value={forwardTarget} onChange={event => setForwardTarget(event.target.value)}><option value="">Select a conversation</option>{conversations.filter(item => item.id !== selectedId).map(item => <option key={item.id} value={item.id}>{item.otherUserName} · {item.propertyTitle}</option>)}</select></div>{!conversations.some(item => item.id !== selectedId) && <p className="muted">You need another conversation before you can forward a message.</p>}<div className="forward-dialog-actions"><button type="button" className="btn btn-outline" onClick={() => setForwardingMessage(null)}>Cancel</button><button type="button" className="btn btn-primary" disabled={!forwardTarget || !!actionBusyId} onClick={() => void forwardMessage()}>{actionBusyId === forwardingMessage.id ? 'Forwarding…' : 'Forward message'}</button></div></section></div>}
  </div></main>
}
