import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react'
import { cn } from '../../lib/cn'

interface InputAreaProps {
  onSend: (text: string) => void
  isStreaming: boolean
  placeholder?: string
}

export function InputArea({ onSend, isStreaming, placeholder }: InputAreaProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setText('')
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px'
    }
  }, [text, isStreaming, onSend])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = '48px'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  const canSend = text.trim().length > 0 && !isStreaming

  return (
    <div className="bg-surface border-t border-border px-6 py-3">
      <div className="flex items-end gap-3 max-w-[720px]">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "What are you working on?"}
          disabled={isStreaming}
          rows={1}
          className="flex-1 bg-transparent text-text-primary font-body text-[15px] leading-[1.6] placeholder:text-text-muted resize-none outline-none min-h-[48px] max-h-[200px] py-3"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'bg-accent text-dominant rounded-md px-4 py-2 font-body text-sm font-medium transition-opacity duration-150 shrink-0',
            canSend ? 'opacity-100 cursor-pointer' : 'opacity-20 cursor-not-allowed'
          )}
        >
          Send
        </button>
      </div>
    </div>
  )
}
