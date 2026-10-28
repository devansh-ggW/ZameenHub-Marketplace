import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

function progressFor(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const distance = Math.max(element.offsetHeight - window.innerHeight, 1)
  return Math.min(1, Math.max(0, -rect.top / distance))
}

function pageProgress() {
  return Math.min(1, Math.max(0, window.scrollY / Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)))
}

export function ScrollProgress() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setProgress(pageProgress()))
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update) }
  }, [])
  return <div className="scroll-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setProgress(pageProgress()))
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update) }
  }, [])
  return <div className="motion-root" style={{ '--site-progress': progress } as CSSProperties}>{children}</div>
}

export function ScrollScene({ children, className = '', variant = 'lift' }: { children: ReactNode; className?: string; variant?: 'lift' | 'depth' | 'reveal' | 'quiet' }) {
  const ref = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { if (ref.current) setProgress(progressFor(ref.current)) })
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (observer && ref.current) observer.observe(ref.current)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); observer?.disconnect() }
  }, [])
  return <section ref={ref} className={`scroll-scene scroll-scene-${variant} ${className}`} style={{ '--scene-progress': progress } as CSSProperties}>{children}</section>
}

export function DepthImage({ src, alt, depth = 0.12, className = '' }: { src: string; alt: string; depth?: number; className?: string }) {
  return <img src={src} alt={alt} loading="lazy" className={`depth-image ${className}`} style={{ '--depth': depth } as CSSProperties} />
}
