/**
 * The layout is the part that can be wrong in a way nobody notices on screen:
 * a cycle that never terminates, an edge to a node the traversal did not
 * return, a graph with no root at all.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { layoutGraph, GraphCanvas, NODE_WIDTH } from '../components/GraphCanvas.js';
import type { GraphCanvasNode, GraphCanvasEdge } from '../components/GraphCanvas.js';

const n = (id: string): GraphCanvasNode => ({ id, label: id });

describe('layoutGraph', () => {
  it('layers a chain left to right', () => {
    const nodes = [n('a'), n('b'), n('c')];
    const edges: GraphCanvasEdge[] = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    const { placements, width } = layoutGraph(nodes, edges);

    const x = Object.fromEntries(placements.map(p => [p.id, p.x]));
    expect(x['a']!).toBeLessThan(x['b']!);
    expect(x['b']!).toBeLessThan(x['c']!);
    // Same column ⇒ same x; three columns ⇒ room for three nodes.
    expect(width).toBeGreaterThanOrEqual(3 * NODE_WIDTH);
  });

  it('stacks siblings in the same column', () => {
    const nodes = [n('root'), n('x'), n('y')];
    const edges: GraphCanvasEdge[] = [{ from: 'root', to: 'x' }, { from: 'root', to: 'y' }];
    const { placements } = layoutGraph(nodes, edges);

    const x = placements.find(p => p.id === 'x')!;
    const y = placements.find(p => p.id === 'y')!;
    expect(x.x).toBe(y.x);
    expect(x.y).not.toBe(y.y);
  });

  it('terminates on a cycle and still places every node', () => {
    const nodes = [n('a'), n('b'), n('c')];
    const edges: GraphCanvasEdge[] = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ];
    const { placements } = layoutGraph(nodes, edges);
    expect(placements.map(p => p.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores edges whose endpoints were not returned', () => {
    const nodes = [n('a'), n('b')];
    const dangling: GraphCanvasEdge[] = [{ from: 'a', to: 'ghost' }, { from: 'ghost', to: 'b' }];
    const { placements } = layoutGraph(nodes, dangling);

    // 'b' keeps depth 0 — a hidden node must not push it into a second column.
    expect(placements.find(p => p.id === 'a')!.x).toBe(placements.find(p => p.id === 'b')!.x);
  });

  it('places disconnected nodes rather than dropping them', () => {
    const { placements } = layoutGraph([n('lonely')], []);
    expect(placements).toHaveLength(1);
  });
});

describe('GraphCanvas', () => {
  it('draws a node button per node and an edge path per drawable edge', () => {
    const { container } = render(
      <GraphCanvas
        label="Test graph"
        nodes={[{ id: 'a', label: 'Patient pat-1', kind: 'Patient' }, n('b')]}
        edges={[{ from: 'a', to: 'b' }, { from: 'a', to: 'ghost' }]}
      />,
    );

    expect(screen.getByText('Patient pat-1')).toBeTruthy();
    expect(container.querySelectorAll('.al-graph__node')).toHaveLength(2);
    expect(container.querySelectorAll('.al-graph__edge')).toHaveLength(1);
  });

  it('says so when there is nothing to draw', () => {
    render(<GraphCanvas label="Empty" nodes={[]} edges={[]} />);
    expect(screen.getByText('No nodes to draw.')).toBeTruthy();
  });
});
