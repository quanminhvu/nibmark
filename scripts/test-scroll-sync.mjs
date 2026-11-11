import assert from 'node:assert/strict'
import { mapScroll, syncScroll } from '../src/renderer/src/lib/scrollSync.ts'

let resized
let disconnected = false
globalThis.ResizeObserver = class {
  constructor(callback) { resized = callback }
  observe() {}
  disconnect() { disconnected = true }
}
class Pane extends EventTarget {
  scrollTop = 0
  clientHeight = 200
  firstElementChild = null
  querySelector() { return null }
  constructor(height) { super(); this.scrollHeight = height }
  scroll(top) { this.scrollTop = top; this.dispatchEvent(new Event('scroll')) }
}
const editor = new Pane(1200)
const preview = new Pane(2200)
const stop = syncScroll(editor, preview)
editor.scroll(250)
assert.equal(preview.scrollTop, 500, 'editor drives preview with different heights')
preview.dispatchEvent(new Event('scroll'))
assert.equal(editor.scrollTop, 250, 'programmatic scroll does not feed back')
preview.scroll(1400)
assert.equal(editor.scrollTop, 700, 'preview drives editor')
editor.dispatchEvent(new Event('scroll'))
preview.scroll(2000)
assert.equal(editor.scrollTop, 1000, 'both reach the bottom')
preview.scroll(0)
assert.equal(editor.scrollTop, 0, 'both return to the top')
editor.scroll(500)
preview.scrollHeight = 4200
resized()
assert.equal(preview.scrollTop, 2000, 'layout changes preserve reading progress')
preview.dispatchEvent(new Event('scroll'))
preview.scroll(1000)
assert.equal(editor.scrollTop, 250, 'direction can reverse after resize')
stop()
assert.ok(disconnected)
editor.scroll(800)
assert.equal(preview.scrollTop, 1000, 'cleanup removes scroll handlers')
const short = new Pane(200)
const stopShort = syncScroll(short, preview)
short.scroll(0)
assert.equal(preview.scrollTop, 1000, 'short pane does not reset a scrollable pane')
stopShort()
console.log('✓ bidirectional scroll, feedback guard, endpoints, resize, short content and cleanup')

const anchors = [{left:0,right:0},{left:100,right:800},{left:1000,right:2000}]
assert.equal(mapScroll(100, anchors), 800, 'image-heavy block maps by source rather than overall ratio')
assert.equal(mapScroll(800, anchors, true), 100, 'reverse mapping reaches same source block')
assert.equal(mapScroll(550, anchors), 1400, 'interpolates between block anchors')
assert.equal(mapScroll(0, anchors), 0)
assert.equal(mapScroll(3000, anchors), 2000)
console.log('✓ block mapping, reverse mapping, interpolation and clamping')
