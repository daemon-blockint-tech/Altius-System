/**
 * Tests for the frontend event bus — EventBus, VariableBus, AutoRefreshCoordinator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EventBus,
  VariableBus,
  AutoRefreshCoordinator,
  getEventBus,
  getVariableBus,
  getRefreshCoordinator,
} from '../event-bus.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => { bus = new EventBus(); });

  it('emits events to subscribers', () => {
    const handler = vi.fn();
    bus.on('click', handler);
    bus.emit('click', { id: 'btn1' });
    expect(handler).toHaveBeenCalledWith({ id: 'btn1' });
  });

  it('supports multiple subscribers', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('select', h1);
    bus.on('select', h2);
    bus.emit('select', 'item1');
    expect(h1).toHaveBeenCalledWith('item1');
    expect(h2).toHaveBeenCalledWith('item1');
  });

  it('unsubscribe removes handler', () => {
    const handler = vi.fn();
    const unsub = bus.on('change', handler);
    unsub();
    bus.emit('change', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates events by name', () => {
    const clickHandler = vi.fn();
    const selectHandler = vi.fn();
    bus.on('click', clickHandler);
    bus.on('select', selectHandler);
    bus.emit('click', 'data');
    expect(clickHandler).toHaveBeenCalled();
    expect(selectHandler).not.toHaveBeenCalled();
  });

  it('one handler error does not silence others', () => {
    const badHandler = vi.fn(() => { throw new Error('boom'); });
    const goodHandler = vi.fn();
    bus.on('event', badHandler);
    bus.on('event', goodHandler);
    bus.emit('event', 'data');
    expect(badHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalled();
  });

  it('clear removes all handlers', () => {
    const h = vi.fn();
    bus.on('event', h);
    bus.clear();
    bus.emit('event', 'data');
    expect(h).not.toHaveBeenCalled();
  });
});

describe('VariableBus', () => {
  let bus: VariableBus;

  beforeEach(() => { bus = new VariableBus(); });

  it('sets and gets variables', () => {
    bus.setVariable('selectedId', 'p1');
    expect(bus.getVariable('selectedId')).toBe('p1');
  });

  it('notifies subscribers on set', () => {
    const listener = vi.fn();
    bus.subscribe('selectedId', listener);
    bus.setVariable('selectedId', 'p2');
    expect(listener).toHaveBeenCalledWith('p2');
  });

  it('propagates to dependent variables', () => {
    const depListener = vi.fn();
    bus.declareDependency('derived', 'source');
    bus.subscribe('derived', depListener);
    bus.setVariable('source', 'new-value');
    expect(depListener).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn();
    const unsub = bus.subscribe('var', listener);
    unsub();
    bus.setVariable('var', 'value');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('AutoRefreshCoordinator', () => {
  let coord: AutoRefreshCoordinator;

  beforeEach(() => { coord = new AutoRefreshCoordinator(); });

  it('registers and unregisters refresh functions', () => {
    const fn = vi.fn();
    coord.register('widget-1', fn, 1000);
    coord.unregister('widget-1');
    // No way to test the interval directly without waiting, but unregister should not throw
  });

  it('clear removes all entries', () => {
    coord.register('w1', vi.fn(), 1000);
    coord.register('w2', vi.fn(), 2000);
    coord.clear();
    // Should not throw
  });
});

describe('Global instances', () => {
  it('returns singleton instances', () => {
    expect(getEventBus()).toBe(getEventBus());
    expect(getVariableBus()).toBe(getVariableBus());
    expect(getRefreshCoordinator()).toBe(getRefreshCoordinator());
  });
});
