import { useEffect } from 'react'

export interface HotkeyConfig {
  key: string
  handler: (event: KeyboardEvent) => void
  alt?: boolean
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  preventDefault?: boolean
  allowInInputs?: boolean
}

const INPUT_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'

const isEventFromInput = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.matches(INPUT_SELECTOR)) {
    return true
  }
  return target.closest(INPUT_SELECTOR) !== null
}

const normalizeKey = (key: string) => key.length === 1 ? key.toLowerCase() : key.toLowerCase()

export const useHotkeys = (hotkeys: HotkeyConfig[]) => {
  useEffect(() => {
    if (!hotkeys || hotkeys.length === 0) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const eventKey = normalizeKey(event.key)

      for (const hotkey of hotkeys) {
        if (normalizeKey(hotkey.key) !== eventKey) {
          continue
        }

        const altRequired = hotkey.alt ?? false
        const ctrlRequired = hotkey.ctrl ?? false
        const metaRequired = hotkey.meta ?? false
        const shiftRequired = hotkey.shift ?? false

        if (
          event.altKey !== altRequired ||
          event.ctrlKey !== ctrlRequired ||
          event.metaKey !== metaRequired ||
          event.shiftKey !== shiftRequired
        ) {
          continue
        }

        if (!hotkey.allowInInputs && isEventFromInput(event.target)) {
          continue
        }

        if (hotkey.preventDefault) {
          event.preventDefault()
        }

        hotkey.handler(event)
        break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [hotkeys])
}

export default useHotkeys
