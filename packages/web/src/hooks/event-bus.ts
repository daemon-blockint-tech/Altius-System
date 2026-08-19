/**
 * Frontend event bus — cross-widget event system for Workshop-style
 * variable propagation, widget events, and auto-refresh coordination.
 *
 * Provides:
 *   - EventBus: pub/sub for widget events (click, select, filter, navigate)
 *   - VariableBus: reactive variable store with dependency-aware propagation
 *   - AutoRefresh coordinator: manages refresh intervals across widgets
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ── EventBus ──

type EventHandler = (payload: unknown) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    let set = this.handlers.get(event);
    if (!set) { set = new Set(); this.handlers.set(event, set); }
    set.add(handler);
    return () => { set!.delete(handler); };
  }

  emit(event: string, payload?: unknown): void {
    const set = this.handlers.get(event);
    if (set) {
      for (const handler of set) {
        try { handler(payload); } catch { /* one handler must not silence the rest */ }
      }
    }
  }

  off(event: string): void {
    this.handlers.delete(event);
  }

  clear(): void {
    this.handlers.clear();
  }
}

// Global event bus instance
const globalEventBus = new EventBus();

export function getEventBus(): EventBus {
  return globalEventBus;
}

// ── VariableBus ──

type VariableListener = (value: unknown) => void;

interface VariableEntry {
  value: unknown;
  listeners: Set<VariableListener>;
  /** Variables that this variable depends on (for propagation). */
  dependsOn: Set<string>;
  /** Variables that depend on this variable (for reverse propagation). */
  dependedBy: Set<string>;
}

export class VariableBus {
  private variables = new Map<string, VariableEntry>();

  setVariable(name: string, value: unknown, propagate = true): void {
    let entry = this.variables.get(name);
    if (!entry) {
      entry = { value, listeners: new Set(), dependsOn: new Set(), dependedBy: new Set() };
      this.variables.set(name, entry);
    } else {
      entry.value = value;
    }
    // Notify direct listeners
    for (const listener of entry.listeners) {
      try { listener(value); } catch { /* ignore */ }
    }
    // Propagate to dependent variables
    if (propagate) {
      for (const depName of entry.dependedBy) {
        const dep = this.variables.get(depName);
        if (dep) {
          for (const listener of dep.listeners) {
            try { listener(dep.value); } catch { /* ignore */ }
          }
        }
      }
    }
  }

  getVariable(name: string): unknown {
    return this.variables.get(name)?.value;
  }

  subscribe(name: string, listener: VariableListener): () => void {
    let entry = this.variables.get(name);
    if (!entry) {
      entry = { value: undefined, listeners: new Set(), dependsOn: new Set(), dependedBy: new Set() };
      this.variables.set(name, entry);
    }
    entry.listeners.add(listener);
    return () => { entry!.listeners.delete(listener); };
  }

  /** Declare that `name` depends on `dependency`. */
  declareDependency(name: string, dependency: string): void {
    let entry = this.variables.get(name);
    if (!entry) {
      entry = { value: undefined, listeners: new Set(), dependsOn: new Set(), dependedBy: new Set() };
      this.variables.set(name, entry);
    }
    entry.dependsOn.add(dependency);

    let depEntry = this.variables.get(dependency);
    if (!depEntry) {
      depEntry = { value: undefined, listeners: new Set(), dependsOn: new Set(), dependedBy: new Set() };
      this.variables.set(dependency, depEntry);
    }
    depEntry.dependedBy.add(name);
  }

  clear(): void {
    this.variables.clear();
  }
}

// Global variable bus instance
const globalVariableBus = new VariableBus();

export function getVariableBus(): VariableBus {
  return globalVariableBus;
}

// ── React hooks ──

export function useEventBus(event: string, handler: EventHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return globalEventBus.on(event, (payload) => handlerRef.current(payload));
  }, [event]);
}

export function useEmit(event: string): (payload?: unknown) => void {
  return useCallback((payload?: unknown) => globalEventBus.emit(event, payload), [event]);
}

export function useBusVariable<T>(name: string, initialValue?: T): [T | undefined, (value: T) => void] {
  const [value, setValue] = useState<T | undefined>(initialValue);

  useEffect(() => {
    return globalVariableBus.subscribe(name, (v) => setValue(v as T));
  }, [name]);

  const set = useCallback((newValue: T) => {
    globalVariableBus.setVariable(name, newValue);
  }, [name]);

  return [value, set];
}

// ── AutoRefresh coordinator ──

interface RefreshEntry {
  fn: () => Promise<void>;
  intervalMs: number;
  timer: ReturnType<typeof setInterval> | undefined;
}

export class AutoRefreshCoordinator {
  private entries = new Map<string, RefreshEntry>();

  register(id: string, fn: () => Promise<void>, intervalMs: number): void {
    this.unregister(id);
    const timer = setInterval(fn, intervalMs);
    this.entries.set(id, { fn, intervalMs, timer });
  }

  unregister(id: string): void {
    const entry = this.entries.get(id);
    if (entry?.timer) clearInterval(entry.timer);
    this.entries.delete(id);
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.timer) clearInterval(entry.timer);
    }
    this.entries.clear();
  }
}

const globalRefreshCoordinator = new AutoRefreshCoordinator();

export function getRefreshCoordinator(): AutoRefreshCoordinator {
  return globalRefreshCoordinator;
}

export function useAutoRefreshCoordinator(
  id: string,
  fn: () => Promise<void>,
  intervalMs: number,
  enabled: boolean = true,
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    globalRefreshCoordinator.register(id, () => fnRef.current(), intervalMs);
    return () => globalRefreshCoordinator.unregister(id);
  }, [id, intervalMs, enabled]);
}
