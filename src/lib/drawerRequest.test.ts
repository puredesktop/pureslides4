// @vitest-environment happy-dom
import { it, expect } from 'vitest'
import { assertScope, type DrawerRequest } from './drawerRequest'
const html =
  '<html><head><style>h1{color:red}</style></head><body><div id="deck"><div data-slide><h1>Title</h1><p>Keep</p></div><div data-slide>Other</div></div></body></html>'
const request = {
  kind: 'edit',
  html,
  indexes: [0],
  elementPaths: ['0'],
} as DrawerRequest
it('permits only the saved selected element and protects siblings, styles and other slides', () => {
  expect(() =>
    assertScope(request, html.replace('Title', 'Changed')),
  ).not.toThrow()
  for (const next of [
    html.replace('Keep', 'Lost'),
    html.replace('Other', 'Lost'),
    html.replace('red', 'blue'),
  ])
    expect(() => assertScope(request, next)).toThrow('outside')
})
it('whole-slide scope still preserves every other slide and document styles', () => {
  const slide = { ...request, elementPaths: [] }
  expect(() =>
    assertScope(slide, html.replace('Keep', 'Changed')),
  ).not.toThrow()
  expect(() => assertScope(slide, html.replace('Other', 'Lost'))).toThrow(
    'outside',
  )
})

it('keeps indexes stable when several selected slides/scenes are replaced', () => {
  const multi = { ...request, indexes: [0, 1], elementPaths: [] }
  expect(() =>
    assertScope(
      multi,
      html.replace('Title', 'New title').replace('Other', 'Other changed'),
    ),
  ).not.toThrow()
})

import { requestSession } from './drawerRequest'
it('binds follow-ups to the saved document session, including a verified rename', () => {
  const saved = {
    path: '/old',
    sessionId: 'document-session',
    outputHash: 'saved',
  } as DrawerRequest
  expect(requestSession(saved, '/old', 'changed')).toBe('document-session')
  expect(requestSession(saved, '/renamed', 'saved')).toBe('document-session')
  expect(requestSession(saved, '/other', 'different')).toBeNull()
  expect(requestSession(null, '/old', 'saved')).toBeNull()
})

import { descriptionState, assertDescriptionScope } from './drawerRequest'
it('preserves manual descriptions and roles while allowing a retry of the same applied description', () => {
  const before = [{ name: 'image.png', description: '', role: 'content' }]
  const next = [{ ...before[0], description: 'Actual pixel description' }]
  const request = { descriptionBase: descriptionState(before) } as DrawerRequest
  expect(() => assertDescriptionScope(request, before, next)).not.toThrow()
  expect(() => assertDescriptionScope(request, next, next)).not.toThrow()
  expect(() =>
    assertDescriptionScope(
      request,
      [{ ...before[0], description: 'Manually corrected' }],
      next,
    ),
  ).toThrow('changed')
  expect(() =>
    assertDescriptionScope(
      request,
      [{ ...before[0], role: 'reference' }],
      next,
    ),
  ).toThrow('changed')
})
