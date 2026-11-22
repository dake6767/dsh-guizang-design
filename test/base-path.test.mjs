import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createContext, runInContext, runInNewContext } from 'node:vm'

const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const gallery = readFileSync(new URL('../gallery/app.js', import.meta.url), 'utf8')
const origin = 'https://dsh.example'

for (const prefix of ['/', '/dsh/']) {
  const dsh = new URL(prefix, origin)

  test(`sidebar opens the gallery at the DSH document base (${prefix})`, () => {
    let factory
    const React = {
      createElement: (tag, props) => ({ tag, props }),
      useRef: () => ({}),
      useState: (initial) => [initial()],
      useEffect: () => {},
    }
    runInNewContext(client, {
      URL,
      document: { baseURI: dsh.href },
      navigator: { language: 'en' },
      window: { __ModuleLoader__: { load: (entry) => { factory = entry.factory } } },
    })
    let frame
    factory(() => React).apply({
      inject: () => {},
      slots: {
        inject: (_, action) => action(),
        register: (slot, component) => { if (slot.name === 'main') frame = component() },
      },
    })
    assert.equal(new URL(frame.props.src, dsh).href, new URL('guizang-design/?lang=en', dsh).href)
  })

  test(`gallery links resolve under its own address (${prefix})`, async () => {
    const base = new URL('guizang-design/?lang=en', dsh)
    const example = {
      kind: 'image',
      id: 'example',
      url: '/guizang-design/examples/cards/main.png',
      thumb: '/guizang-design/examples/cards/cover.png',
    }
    const work = {
      kind: 'image',
      id: 'work',
      url: '/guizang-design/works/work/main.png',
      thumb: '/guizang-design/thumbs/work.jpg?v=rev',
      files: ['/guizang-design/works/work/card%202.png'],
    }
    const context = createContext({
      URL,
      location: { hash: '#/examples', origin },
      document: {
        baseURI: base.href,
        addEventListener() {},
        querySelector: () => ({}),
        querySelectorAll: () => [],
        getElementById: () => ({ querySelector: () => ({}) }),
      },
      window: { GZ_I18N: { lang: 'en', t: (key) => key, apply() {} } },
      fetch: async (path) => {
        assert.equal(new URL(path, base).href, new URL('api/catalog?lang=en', base).href)
        return { json: async () => structuredClone({ skills: [], examples: [example], works: [work] }) }
      },
      addEventListener() {},
      IntersectionObserver: class {},
      matchMedia: () => ({ matches: false }),
    })
    runInContext(gallery, context)
    await new Promise((resolve) => setImmediate(resolve))
    const catalog = runInContext('data', context)
    for (const [actual, original] of [[catalog.examples[0], example], [catalog.works[0], work]]) {
      const resolve = (link) => new URL(link, base).href
      const expected = (link) => new URL(link.slice(1), dsh).href
      assert.equal(resolve(actual.url), expected(original.url))
      assert.equal(resolve(actual.thumb), expected(original.thumb))
      assert.deepEqual(Array.from(actual.files ?? [], resolve), (original.files ?? []).map(expected))
    }
  })
}
