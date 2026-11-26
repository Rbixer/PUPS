import { useEffect, useRef, useState } from 'react'

const GROUPS: { id: string; icon: string; label: string; items: string[] }[] = [
  {
    id: 'caras',
    icon: '😊',
    label: 'Caras',
    items: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 😌 😴 🤗 🤔 😮 😢 😭 😡 🥺 😱 🙈'.split(' '),
  },
  {
    id: 'gestos',
    icon: '👍',
    label: 'Gestos y corazones',
    items: '👍 👎 👏 🙌 🙏 🤝 👌 ✌️ 🤞 💪 👋 🤙 ☝️ 👇 👉 👈 ❤️ 🧡 💛 💚 💙 💜 🖤 💕 💖 ✨ 🔥 ⭐ 🎉 💯'.split(' '),
  },
  {
    id: 'mascotas',
    icon: '🐶',
    label: 'Mascotas',
    items: '🐶 🐕 🐩 🦮 🐱 🐈 🐾 🦴 🐰 🐹 🐦 🐠 🐢 🦜 🐴 🐻 🐼 🦊 🐷 🐮 🐑 🐓 🦆 🐍 🦎 🐟 🦋 🐝 🌸 🌳'.split(' '),
  },
  {
    id: 'tienda',
    icon: '🛁',
    label: 'Tienda y citas',
    items: '🛁 🧼 🧴 ✂️ 💈 🪮 🧽 🚿 🛍️ 🛒 🎁 🏷️ 💳 💵 📅 🗓️ ⏰ 🕘 📍 🚗 🏠 📞 📸 📷 ✅ ☑️ ❌ ⚠️ ℹ️ 💬'.split(' '),
  },
]

const RECENT_KEY = 'pups-emoji-recientes'

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 16) : []
  } catch {
    return []
  }
}

/** Selector de emojis: abre sobre el cuadro de texto, se cierra con Escape o al tocar fuera. */
export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState(GROUPS[0].id)
  const [recent, setRecent] = useState<string[]>(readRecent)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function away(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    function key(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  function pick(emoji: string) {
    const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, 16)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      /* sin almacenamiento: los recientes no se guardan */
    }
    onPick(emoji)
  }

  const current = GROUPS.find((item) => item.id === group) ?? GROUPS[0]

  return (
    <div className="emoji" ref={root}>
      <button
        ref={button}
        type="button"
        className="emoji-toggle"
        aria-label="Insertar emoji"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">😊</span>
      </button>
      {open ? (
        <div className="emoji-panel" role="dialog" aria-label="Emojis">
          <div className="emoji-tabs" role="group" aria-label="Categorías">
            {GROUPS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === current.id ? 'active' : ''}
                aria-pressed={item.id === current.id}
                aria-label={item.label}
                title={item.label}
                onClick={() => setGroup(item.id)}
              >
                {item.icon}
              </button>
            ))}
          </div>
          {recent.length > 0 ? (
            <div className="emoji-recent">
              <small>Recientes</small>
              <div className="emoji-grid">
                {recent.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => pick(emoji)} aria-label={emoji}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <small>{current.label}</small>
          <div className="emoji-grid">
            {current.items.map((emoji) => (
              <button key={emoji} type="button" onClick={() => pick(emoji)} aria-label={emoji}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
