import type { Children, Vnode } from "mithril"

export type ComponentId = `c:${number}`
export type DeclarationId = string

export interface InstanceRecord {
  readonly id: ComponentId
  readonly declarationId: DeclarationId
  readonly parentId: ComponentId | null
  readonly childIds: readonly ComponentId[]
}

export interface InstanceRegistry {
  /**
   * Wraps a component view function, simulating what the build-time
   * transform's injected `__miView(declId, view)` call would emit at the
   * definition site — an object literal's `view:` value, the object a closure
   * component returns, or a class's prototype method. Because the wrapping
   * happens where the view is *defined*, no application object (component,
   * state, attrs) is ever mutated at runtime.
   */
  instrumentView<Attrs, State, Result extends Children | null | void>(
    declarationId: DeclarationId,
    view: (this: State, vnode: Vnode<Attrs, State>) => Result,
  ): (this: State, vnode: Vnode<Attrs, State>) => Result
  /** Resolves the stable instance id carried by a component's state object. */
  idOf(state: object): ComponentId | undefined
  recordOf(id: ComponentId): InstanceRecord | undefined
}

interface MutableInstanceRecord {
  readonly id: ComponentId
  readonly declarationId: DeclarationId
  readonly parentId: ComponentId | null
  readonly childIds: ComponentId[]
}

/**
 * Structural view of a raw (pre-`Vnode.normalize`) view result. Children of
 * element vnodes are already normalized by hyperscript; children handed to a
 * component vnode are not, so both raw arrays and vnode objects appear here.
 */
interface CreatedVnode {
  tag: unknown
  children?: unknown
}

function isComponentTag(tag: unknown): boolean {
  if (typeof tag === "function") return true
  return (
    tag !== null &&
    typeof tag === "object" &&
    typeof (tag as { view?: unknown }).view === "function"
  )
}

export function createInstanceRegistry(): InstanceRegistry {
  let nextInstance = 0
  // vnode.state is the one object Mithril preserves across redraws
  // (`vnode.state = old.state` in updateNode) while the vnode itself is
  // recreated every pass — so state, not the vnode, carries the identity.
  const byState = new WeakMap<object, MutableInstanceRecord>()
  const byId = new Map<ComponentId, MutableInstanceRecord>()
  // Component vnodes tagged with the instance whose view created them; read
  // back when that child instance first renders to resolve its parent.
  const ownerByVnode = new WeakMap<object, MutableInstanceRecord>()
  const scopeStack: MutableInstanceRecord[] = []

  const enterComponent = (record: MutableInstanceRecord): void => {
    scopeStack.push(record)
  }
  const leaveComponent = (): void => {
    scopeStack.pop()
  }
  const currentScope = (): MutableInstanceRecord | undefined =>
    scopeStack[scopeStack.length - 1]

  const allocateInstance = (
    state: object,
    vnode: object,
    declarationId: DeclarationId,
  ): MutableInstanceRecord => {
    const owner = ownerByVnode.get(vnode)
    nextInstance += 1
    const record: MutableInstanceRecord = {
      id: `c:${nextInstance}`,
      declarationId,
      parentId: owner === undefined ? null : owner.id,
      childIds: [],
    }
    byState.set(state, record)
    byId.set(record.id, record)
    if (owner !== undefined) owner.childIds.push(record.id)
    return record
  }

  const recordOwnedVnodes = (owner: MutableInstanceRecord, value: unknown): void => {
    if (value === null || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const child of value) recordOwnedVnodes(owner, child)
      return
    }
    const vnode = value as CreatedVnode
    if (isComponentTag(vnode.tag)) {
      // §7.5: a vnode belongs to the view that created it. First tagger wins,
      // so a component re-emitting `vnode.children` inside its own result
      // does not steal ownership from the lexical creator.
      if (!ownerByVnode.has(vnode)) ownerByVnode.set(vnode, owner)
      recordOwnedVnodes(owner, vnode.children)
      return
    }
    // Elements and "[" fragments carry vnode children; "#" text and "<"
    // trusted-HTML vnodes carry a string instead.
    if (typeof vnode.tag === "string" && vnode.tag !== "#" && vnode.tag !== "<") {
      recordOwnedVnodes(owner, vnode.children)
    }
  }

  return {
    instrumentView<Attrs, State, Result extends Children | null | void>(
      declarationId: DeclarationId,
      view: (this: State, vnode: Vnode<Attrs, State>) => Result,
    ): (this: State, vnode: Vnode<Attrs, State>) => Result {
      return function (this: State, vnode: Vnode<Attrs, State>): Result {
        const state: unknown = vnode.state
        let record: MutableInstanceRecord | undefined
        if (typeof state === "object" && state !== null) {
          record = byState.get(state) ?? allocateInstance(state, vnode, declarationId)
        }
        // No object state to key on: degrade gracefully to a plain call.
        if (record === undefined) return view.call(this, vnode)
        enterComponent(record)
        try {
          const result = view.call(this, vnode)
          const scope = currentScope()
          if (scope !== undefined) recordOwnedVnodes(scope, result)
          return result
        } finally {
          leaveComponent()
        }
      }
    },
    idOf(state) {
      return byState.get(state)?.id
    },
    recordOf(id) {
      return byId.get(id)
    },
  }
}
