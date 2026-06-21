type DeferredAttrWrite = [Element, string, string];
type DeferredStyleWrite = [HTMLElement, string, string];

export interface BatchedDomWriterConfig {
  /** Group name -> attribute names that belong to it (CONTEXT.md vocabulary
   * is up to the caller — this class has no domain knowledge of its own). */
  groups: Record<string, string[]>;
}

export class BatchedDomWriter {
  private attrCache = new WeakMap<Element, Record<string, string>>();
  private styleCache = new WeakMap<HTMLElement, Record<string, string>>();
  private deferredWrites: DeferredAttrWrite[] = [];
  private deferredStyles: DeferredStyleWrite[] = [];
  private groupsByAttr = new Map<string, Set<string>>();
  private dirtyGroups = new Set<string>();

  constructor(config: BatchedDomWriterConfig) {
    for (const [groupName, attrs] of Object.entries(config.groups)) {
      for (const attr of attrs) {
        let groups = this.groupsByAttr.get(attr);
        if (!groups) {
          groups = new Set();
          this.groupsByAttr.set(attr, groups);
        }
        groups.add(groupName);
      }
    }
  }

  setAttr(element: Element, attr: string, value: string): boolean {
    const cache = this.cacheFor(
      this.attrCache,
      element,
      attr,
      () => element.getAttribute(attr) ?? "",
    );
    if (cache[attr] === value) {
      return false;
    }
    cache[attr] = value;
    this.deferredWrites.push([element, attr, value]);
    for (const groupName of this.groupsByAttr.get(attr) ?? []) {
      this.dirtyGroups.add(groupName);
    }
    return true;
  }

  setStyle(element: HTMLElement, prop: string, value: string): void {
    const cache = this.cacheFor(this.styleCache, element, prop, () =>
      element.style.getPropertyValue(prop),
    );
    if (cache[prop] === value) {
      return;
    }
    cache[prop] = value;
    this.deferredStyles.push([element, prop, value]);
  }

  // Lazily seeds the per-(element, key) cache entry from the live DOM the
  // first time it's touched, so later calls compare against what we last
  // wrote/observed instead of reading the DOM again.
  private cacheFor<T extends object>(
    cacheMap: WeakMap<T, Record<string, string>>,
    element: T,
    key: string,
    readLiveValue: () => string,
  ): Record<string, string> {
    let cache = cacheMap.get(element);
    if (!cache) {
      cache = {};
      cacheMap.set(element, cache);
    }
    if (cache[key] === undefined) {
      cache[key] = readLiveValue();
    }
    return cache;
  }

  flush(): ReadonlySet<string> {
    for (const [element, attr, value] of this.deferredWrites) {
      element.setAttribute(attr, value);
    }
    this.deferredWrites = [];

    for (const [element, prop, value] of this.deferredStyles) {
      element.style.setProperty(prop, value);
    }
    this.deferredStyles = [];

    const dirtyGroups = this.dirtyGroups;
    this.dirtyGroups = new Set();
    return dirtyGroups;
  }
}
