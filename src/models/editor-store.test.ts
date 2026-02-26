import { describe, it, expect, vi } from 'vitest';
import { EditorStore } from './editor-store.js';
import { TilemapModel } from './tilemap-model.js';

// ── Helper ───────────────────────────────────────────────────────────

function makeStore(): EditorStore {
  return new EditorStore();
}

function makeMap(): TilemapModel {
  return new TilemapModel({
    width: 10,
    height: 8,
    tileWidth: 16,
    tileHeight: 16,
  });
}

// ── Default state ───────────────────────────────────────────────────

describe('EditorStore — default state', () => {
  it('has brush as the default active tool', () => {
    const store = makeStore();
    expect(store.activeTool).toBe('brush');
  });

  it('has 0 as the default active layer index', () => {
    const store = makeStore();
    expect(store.activeLayerIndex).toBe(0);
  });

  it('has 0 as the default selected GID (no selection)', () => {
    const store = makeStore();
    expect(store.selectedGid).toBe(0);
  });

  it('has null as the default tilemap', () => {
    const store = makeStore();
    expect(store.tilemap).toBeNull();
  });

  it('has 1 as the default zoom', () => {
    const store = makeStore();
    expect(store.zoom).toBe(1);
  });

  it('has 0 as the default offsetX and offsetY', () => {
    const store = makeStore();
    expect(store.offsetX).toBe(0);
    expect(store.offsetY).toBe(0);
  });
});

// ── Active tool ─────────────────────────────────────────────────────

describe('EditorStore — activeTool', () => {
  it('dispatches editor-state-change when active tool changes', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.activeTool = 'eraser';

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.property).toBe('activeTool');
    expect(store.activeTool).toBe('eraser');
  });

  it('does not dispatch when setting the same tool', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.activeTool = 'brush'; // same as default

    expect(handler).not.toHaveBeenCalled();
  });
});

// ── Active layer ────────────────────────────────────────────────────

describe('EditorStore — activeLayerIndex', () => {
  it('dispatches editor-state-change when active layer changes', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.activeLayerIndex = 2;

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.property).toBe('activeLayerIndex');
    expect(store.activeLayerIndex).toBe(2);
  });

  it('does not dispatch when setting the same layer index', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.activeLayerIndex = 0; // same as default

    expect(handler).not.toHaveBeenCalled();
  });
});

// ── Selected GID ────────────────────────────────────────────────────

describe('EditorStore — selectedGid', () => {
  it('dispatches editor-state-change when selected GID changes', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.selectedGid = 42;

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.property).toBe('selectedGid');
    expect(store.selectedGid).toBe(42);
  });

  it('does not dispatch when setting the same GID', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.selectedGid = 0; // same as default

    expect(handler).not.toHaveBeenCalled();
  });
});

// ── Tilemap ─────────────────────────────────────────────────────────

describe('EditorStore — tilemap', () => {
  it('dispatches editor-state-change when tilemap is set', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    const map = makeMap();
    store.tilemap = map;

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.property).toBe('tilemap');
    expect(store.tilemap).toBe(map);
  });

  it('dispatches when tilemap is set back to null', () => {
    const store = makeStore();
    store.tilemap = makeMap();

    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.tilemap = null;

    expect(handler).toHaveBeenCalledOnce();
    expect(store.tilemap).toBeNull();
  });

  it('does not dispatch when setting the same tilemap reference', () => {
    const store = makeStore();
    const map = makeMap();
    store.tilemap = map;

    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.tilemap = map; // same reference

    expect(handler).not.toHaveBeenCalled();
  });
});

// ── Viewport ────────────────────────────────────────────────────────

describe('EditorStore — viewport', () => {
  it('dispatches editor-state-change when zoom changes', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.zoom = 2;

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.property).toBe('zoom');
    expect(store.zoom).toBe(2);
  });

  it('dispatches editor-state-change when offsetX changes', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.offsetX = 100;

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.property).toBe('offsetX');
  });

  it('dispatches editor-state-change when offsetY changes', () => {
    const store = makeStore();
    const handler = vi.fn();
    store.addEventListener('editor-state-change', handler);

    store.offsetY = -50;

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.property).toBe('offsetY');
  });
});
