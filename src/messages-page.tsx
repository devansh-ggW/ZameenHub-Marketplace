import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
  forwardedFromSenderName?: string | null
}

const conversationPath = (id: string) => '/api/conversations/' + encodeURIComponent(id)
const messagePath = (conversationId: string, messageId: string) => conversationPath(conversationId) + '/messages/' + encodeURIComponent(messageId)
const formatTime = (value: string) => new Date(value).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })

export function MessagesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('conversation') || ''
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  const [editingMessageId, setEditingMessageId] = useState('')
  const [editDraft, setEditDraft] = useState('')
  const [forwardingMessageId, setForwardingMessageId] = useState('')
  const [forwardTargetId, setForwardTargetId] = useState('')
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selected = useMemo(() => conversations.find(item => item.id === selectedId) ?? null, [conversations, selectedId])
  const forwardTargets = useMemo(() => conversations.filter(item => item.id !== selectedId), [conversations, selectedId])

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
      if (!session.ok) {
        setError('We could not check your sign-in right now. Your session has not been cleared. Check your connection and retry.')
        setLoading(false)
        return
      }
      if (!session.data.authenticated || !session.data.user) {
        navigate('/login?next=' + encodeURIComponent('/messages' + window.location.search), { replace: true })
        return
      }
      setCurrentUserId(session.data.user.id)
      void loadConversations()
    })
    return () => { active = false }
  }, [navigate, loadConversations])

  const messagesRequestInFlight = useRef(false)

  const loadMessages = useCallback(async (quiet = false) => {
    if (!selectedId || messagesRequestInFlight.current) return
    messagesRequestInFlight.current = true
    if (!quiet) setMessagesLoading(true)
    try {
      const result = await apiRequest<ChatMessage[]>(conversationPath(selectedId) + '/messages')
      if (result.ok) {
        setMessages(result.data)
        const hasUnreadIncoming = result.data.some(message => message.senderId !== currentUserId && !message.readAt)
        if (hasUnreadIncoming) {
          const readResult = await apiRequest<{ read: boolean }>(conversationPath(selectedId) + '/read', { method: 'PATCH', body: '{}' })
          if (readResult.ok) void loadConversations()
        }
        setError('')
      } else setError(result.error)
    } finally {
      messagesRequestInFlight.current = false
      if (!quiet) setMessagesLoading(false)
    }
  }, [selectedId, currentUserId, loadConversations])

  // Conversation summaries change less often than message contents.
  useEffect(() => {
    const timer = window.setInterval(() => { void loadConversations() }, 60_000)
    return () => window.clearInterval(timer)
  }, [loadConversations])

  useEffect(() => {
    setReplyingTo(null)
    setEditingMessageId('')
    setForwardingMessageId('')
    setForwardTargetId('')
    if (!selectedId) { setMessages([]); return }
    void loadMessages()
    const timer = window.setInterval(() => { void loadMessages(true) }, 5000)
    return () => window.clearInterval(timer)
  }, [selectedId, loadMessages])

  function openConversation(id: string) {
    setParams({ conversation: id })
    setDraft('')
    setNotice('')
    setError('')
    setReplyingTo(null)
    setEditingMessageId('')
    setForwardingMessageId('')
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!selectedId || !body || sending) return
    setSending(true); setError(''); setNotice('')
    const result = await apiRequest<ChatMessage>(conversationPath(selectedId) + '/messages', {
      method: 'POST',
      body: JSON.stringify({ message: body, replyToMessageId: replyingTo?.id || undefined }),
    })
    setSending(false)
    if (!result.ok) { setError(result.error); return }
    setDraft('')
    setReplyingTo(null)
    await Promise.all([loadMessages(true), loadConversations()])
    setNotice('Message sent.')
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!selectedId || !editingMessageId || !editDraft.trim() || actionBusy) return
    setActionBusy(true); setError('')
    const result = await apiRequest<{ id: string; body: string; editedAt: string }>(messagePath(selectedId, editingMessageId), {
      method: 'PATCH', body: JSON.stringify({ message: editDraft.trim() }),
    })
    setActionBusy(false)
    if (!result.ok) { setError(result.error); return }
    setEditingMessageId('')
    setEditDraft('')
    await loadMessages(true)
    setNotice('Message updated.')
  }

  async function deleteForEveryone(message: ChatMessage) {
    if (!selectedId || actionBusy) return
    if (!window.confirm('Delete this message for everyone in the conversation?')) return
    setActionBusy(true); setError('')
    const result = await apiRequest<{ id: string; deleted: boolean }>(messagePath(selectedId, message.id), { method: 'DELETE' })
    setActionBusy(false)
    if (!result.ok) { setError(result.error); return }
    await loadMessages(true)
    setNotice('Message deleted for everyone.')
  }

  async function deleteForMe(message: ChatMessage) {
    if (!selectedId || actionBusy) return
    setActionBusy(true); setError('')
    const result = await apiRequest<{ id: string; hidden: boolean }>(messagePath(selectedId, message.id) + '/me', { method: 'DELETE' })
    setActionBusy(false)
    if (!result.ok) { setError(result.error); return }
    setMessages(current => current.filter(item => item.id !== message.id))
    setNotice('Message removed from your inbox. Other participants can still see it.')
  }

  async function forwardMessage(message: ChatMessage) {
    if (!selectedId || !forwardTargetId || actionBusy) return
    setActionBusy(true); setError('')
    const result = await apiRequest<{ id: string; forwarded: boolean; conversationId: string }>(messagePath(selectedId, message.id) + '/forward', {
      method: 'POST', body: JSON.stringify({ targetConversationId: forwardTargetId }),
    })
    setActionBusy(false)
    if (!result.ok) { setError(result.error); return }
    setForwardingMessageId('')
    setForwardTargetId('')
    await loadConversations()
    setNotice('Message forwarded to the selected conversation.')
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
            <span className="conversation-time">{item.lastMessageAt ? formatTime(item.lastMessageAt) : ''}</span>
          </button>
        )}
      </aside>
      <section className="conversation-panel" aria-label="Selected conversation">
        {!selected ? <EmptyState title="Choose a conversation." copy="Select a conversation from the inbox, or start a chat from any published property detail page." /> : <>
          <header className="chat-header"><div><SectionKicker>{selected.role === 'owner' ? 'Viewer conversation' : 'Owner conversation'}</SectionKicker><h2>{selected.otherUserName || (selected.role === 'buyer' ? 'Property owner' : 'Viewer')}</h2><p>{selected.propertyTitle} · {selected.propertyCity}</p></div><Link className="btn btn-outline" to={'/properties/' + selected.propertySlug}>View listing</Link></header>
          <div className="chat-messages" aria-live="polite">
            {messagesLoading && messages.length === 0 ? <p className="muted">Loading messages…</p> : messages.length === 0 ? <p className="muted">Start the conversation with a useful question or detail.</p> : messages.map(message => {
              const mine = message.senderId === currentUserId
              return <article key={message.id} className={'chat-message' + (mine ? ' mine' : '')}>
                <div className="chat-message-meta"><strong>{mine ? 'You' : message.senderName}</strong><time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time></div>
                {message.forwardedFromMessageId && <div className="chat-message-forwarded">Forwarded from {message.forwardedFromSenderName || 'another participant'}</div>}
                {message.replyToMessageId && <div className="chat-message-reply-preview"><strong>Reply to {message.replyToSenderName || 'participant'}</strong><span>{message.replyToBody || 'Original message unavailable.'}</span></div>}
                {editingMessageId === message.id ? <form className="chat-message-edit" onSubmit={saveEdit}>
                  <textarea className="form-control" rows={3} maxLength={2000} value={editDraft} onChange={event => setEditDraft(event.target.value)} />
                  <div><button className="btn btn-outline" type="button" disabled={actionBusy} onClick={() => { setEditingMessageId(''); setEditDraft('') }}>Cancel</button><button className="btn btn-primary" disabled={actionBusy || !editDraft.trim()}>{actionBusy ? 'Saving…' : 'Save edit'}</button></div>
                </form> : <p>{message.body}</p>}
                {message.editedAt && !message.deletedAt && <small className="chat-message-edited">Edited</small>}
                <div className="chat-message-actions">
                  {!message.deletedAt && <button type="button" disabled={actionBusy} onClick={() => setReplyingTo(message)}>Reply</button>}
                  {!message.deletedAt && <button type="button" disabled={actionBusy || mine && !forwardTargets.length} onClick={() => { setForwardingMessageId(forwardingMessageId === message.id ? '' : message.id); setForwardTargetId('') }}>Forward</button>}
                  {mine && !message.deletedAt && <button type="button" disabled={actionBusy} onClick={() => { setEditingMessageId(message.id); setEditDraft(message.body); setForwardingMessageId('') }}>Edit</button>}
                  {mine && !message.deletedAt && <button type="button" disabled={actionBusy} onClick={() => void deleteForEveryone(message)}>Delete for everyone</button>}
                  <button type="button" disabled={actionBusy} onClick={() => void deleteForMe(message)}>Delete for me</button>
                </div>
                {forwardingMessageId === message.id && <div className="chat-forward-controls">
                  <label htmlFor={'forward-target-' + message.id}>Forward to conversation</label>
                  <select id={'forward-target-' + message.id} className="form-control" value={forwardTargetId} onChange={event => setForwardTargetId(event.target.value)}>
                    <option value="">Choose a conversation</option>
                    {forwardTargets.map(target => <option value={target.id} key={target.id}>{target.propertyTitle} · {target.otherUserName}</option>)}
                  </select>
                  <button className="btn btn-outline" type="button" disabled={actionBusy || !forwardTargetId} onClick={() => void forwardMessage(message)}>{actionBusy ? 'Forwarding…' : 'Forward message'}</button>
                </div>}
              </article>
            })}
          </div>
          <form className="chat-composer" onSubmit={sendMessage}>
            {replyingTo && <div className="chat-reply-composer">
              <div><strong>Replying to {replyingTo.senderId === currentUserId ? 'your message' : replyingTo.senderName}</strong><span>{replyingTo.body}</span></div>
              <button type="button" className="btn btn-outline" onClick={() => setReplyingTo(null)}>Cancel reply</button>
            </div>}
            <label htmlFor="chat-message">Message</label>
            <textarea id="chat-message" className="form-control" required maxLength={2000} rows={4} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask about availability, location, or arrange a viewing…" />
            <div className="chat-composer-footer"><small>{draft.trim().length}/2000 · Messages are visible only to conversation participants.</small><button className="btn btn-primary" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send message'}</button></div>
          </form>
        </>}
      </section>
    </div>
  </div></main>
}
