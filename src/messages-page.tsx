import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
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
type ChatMessage = { id: string; senderId: string; senderName: string; body: string; createdAt: string; readAt: string | null }

export function MessagesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('conversation') || ''
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
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
      if (!session.ok) {
        setError(session.error)
        setLoading(false)
        return
      }
      if (!session.data.authenticated || !session.data.user) {
        navigate('/login?next=' + encodeURIComponent('/messages' + window.location.search), { replace: true })
        setLoading(false)
        return
      }
      setCurrentUserId(session.data.user.id)
      void loadConversations()
    })
    return () => { active = false }
  }, [navigate, loadConversations])

  const loadMessages = useCallback(async (quiet = false) => {
    if (!selectedId || !currentUserId) { setMessages([]); return }
    if (!quiet) setMessagesLoading(true)
    const result = await apiRequest<ChatMessage[]>('/api/conversations/' + encodeURIComponent(selectedId) + '/messages')
    if (result.ok) {
      setMessages(result.data)
      const latest = result.data[result.data.length - 1]
      if (latest) {
        setConversations(current => current.map(item => item.id === selectedId
          ? { ...item, lastMessage: latest.body, lastMessageAt: latest.createdAt }
          : item))
      }
      const hasUnreadIncoming = result.data.some(message => message.senderId !== currentUserId && !message.readAt)
      if (hasUnreadIncoming) {
        const readResult = await apiRequest<{ read: boolean }>('/api/conversations/' + encodeURIComponent(selectedId) + '/read', { method: 'PATCH', body: '{}' })
        if (readResult.ok) {
          const readAt = new Date().toISOString()
          setMessages(current => current.map(message => message.senderId !== currentUserId && !message.readAt ? { ...message, readAt } : message))
          setConversations(current => current.map(item => item.id === selectedId ? { ...item, unreadCount: 0 } : item))
        }
      }
      setError('')
    } else setError(result.error)
    if (!quiet) setMessagesLoading(false)
  }, [selectedId, currentUserId])

  useEffect(() => {
    if (!selectedId || !currentUserId) { setMessages([]); return }
    void loadMessages()
    const timer = window.setInterval(() => { void loadMessages(true) }, 5000)
    return () => window.clearInterval(timer)
  }, [selectedId, currentUserId, loadMessages])

  function openConversation(id: string) {
    setParams({ conversation: id })
    setDraft('')
    setNotice('')
    setError('')
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!selectedId || !body || sending) return
    setSending(true); setError(''); setNotice('')
    const result = await apiRequest<ChatMessage>('/api/conversations/' + encodeURIComponent(selectedId) + '/messages', {
      method: 'POST', body: JSON.stringify({ message: body }),
    })
    setSending(false)
    if (!result.ok) { setError(result.error); return }
    setDraft('')
    await Promise.all([loadMessages(true), loadConversations()])
    setNotice('Message sent.')
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
              return <article key={message.id} className={'chat-message' + (mine ? ' mine' : '')}>
                <div className="chat-message-meta"><strong>{mine ? 'You' : message.senderName}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</time></div>
                <p>{message.body}</p>
              </article>
            })}
          </div>
          <form className="chat-composer" onSubmit={sendMessage}>
            <label htmlFor="chat-message">Message</label>
            <textarea id="chat-message" className="form-control" required maxLength={2000} rows={5} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask about availability, location, or arrange a viewing…" />
            <div className="chat-composer-footer"><small>{draft.trim().length}/2000 · Messages are visible only to conversation participants.</small><button className="btn btn-primary" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send message'}</button></div>
          </form>
        </>}
      </section>
    </div>
  </div></main>
}
