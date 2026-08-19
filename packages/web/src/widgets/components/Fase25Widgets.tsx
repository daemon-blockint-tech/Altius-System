/**
 * Fase 25 widget implementations — AIP/LLM Platform.
 */

import { useState, useCallback } from 'react';
import type { WidgetProps } from '../types.js';

// ── 25A LLM gateway widget ─────────────────────────────────────────────────

export function LlmGatewayWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { title?: string };
  const [count, setCount] = useState<number>(0);
  const load = useCallback(async () => {
    const res = await fetch('/api/v1/llm/models', { method: 'GET' });
    if (res.ok) {
      const body = (await res.json()) as { data?: unknown[] };
      setCount(Array.isArray(body.data) ? body.data.length : 0);
    }
  }, []);
  return (
    <div className="ed-widget ed-llm-gateway" data-widget-id={instance.id}>
      <div className="ed-llm-gateway__title">{config.title ?? 'LLM Gateway'}</div>
      <button onClick={load} type="button" className="ed-button">List models</button>
      {count > 0 && <div data-testid="llm-model-count">{count} models</div>}
    </div>
  );
}

// ── 25B Agent builder widget ───────────────────────────────────────────────

export function AgentBuilderWidget({ instance }: WidgetProps): React.ReactNode {
  const [name, setName] = useState<string>('');
  const [agentId, setAgentId] = useState<string>('');
  const create = useCallback(async () => {
    if (!name) return;
    const res = await fetch('/api/v1/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, systemPrompt: 'You are an agent.' }),
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { id?: string } };
      setAgentId(body.data?.id ?? 'ok');
    }
  }, [name]);
  return (
    <div className="ed-widget ed-agent-builder" data-widget-id={instance.id}>
      <div className="ed-agent-builder__title">Agent Builder</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" aria-label="Agent name" />
      <button onClick={create} type="button" className="ed-button">Create</button>
      {agentId && <div data-testid="agent-created-id">{agentId}</div>}
    </div>
  );
}

// ── 25C AIP chat widget ────────────────────────────────────────────────────

export function AipChatWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { title?: string; placeholder?: string; model?: string; agentId?: string };
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
      if (config.agentId) {
        const res = await fetch(`/api/v1/agents/${config.agentId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        if (res.ok) {
          const body = (await res.json()) as { data?: { messages?: Array<{ role: string; content: string }> } };
          const assistant = body.data?.messages?.slice(-1)[0];
          if (assistant) setMessages(prev => [...prev, { role: 'assistant', content: assistant.content }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Agent chat failed' }]);
        }
      } else {
        const client = ctx.client as { llm?: { generate: (req: { prompt: string }) => Promise<{ text: string }> } };
        if (client?.llm?.generate) {
          const result = await client.llm.generate({ prompt: text });
          setMessages(prev => [...prev, { role: 'assistant', content: result.text }]);
        } else {
          const res = await fetch('/api/v1/llm/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, model: config.model }),
          });
          if (res.ok) {
            const body = (await res.json()) as { data?: { text?: string } };
            setMessages(prev => [...prev, { role: 'assistant', content: body.data?.text ?? 'No response' }]);
          } else {
            setMessages(prev => [...prev, { role: 'assistant', content: 'LLM not configured' }]);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading, config.agentId, config.model, ctx.client]);

  return (
    <div className="ed-widget ed-aip-chat" data-widget-id={instance.id} aria-label="AIP chat">
      <div className="ed-aip-chat__title">{config.title ?? 'AI Assistant'}</div>
      <div className="ed-aip-chat__messages">
        {messages.map((m, i) => <div key={i} className={`ed-aip-chat__message ed-aip-chat__message--${m.role}`}>{m.content}</div>)}
      </div>
      <div className="ed-aip-chat__input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={config.placeholder ?? 'Ask a question...'}
          disabled={loading}
          aria-label="Chat input"
        />
        <button onClick={send} type="button" disabled={loading}>Send</button>
      </div>
    </div>
  );
}

// ── 25D Model catalog widget ───────────────────────────────────────────────

export function ModelCatalogWidget({ instance }: WidgetProps): React.ReactNode {
  const [count, setCount] = useState<number>(0);
  const load = useCallback(async () => {
    const res = await fetch('/api/v1/llm/models', { method: 'GET' });
    if (res.ok) {
      const body = (await res.json()) as { data?: unknown[] };
      setCount(Array.isArray(body.data) ? body.data.length : 0);
    }
  }, []);
  return (
    <div className="ed-widget ed-model-catalog" data-widget-id={instance.id}>
      <div className="ed-model-catalog__title">Model Catalog</div>
      <button onClick={load} type="button" className="ed-button">List models</button>
      {count > 0 && <div data-testid="catalog-model-count">{count} models</div>}
    </div>
  );
}

// ── 25E Prompt playground widget ───────────────────────────────────────────

export function PromptPlaygroundWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { modelRid?: string };
  const [prompt, setPrompt] = useState<string>('');
  const [response, setResponse] = useState<string>('');
  const run = useCallback(async () => {
    const res = await fetch('/api/v1/llm/playground', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelRid: config.modelRid ?? 'ri.ai-models..models.default', userPrompt: prompt }),
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { response?: string } };
      setResponse(body.data?.response ?? '');
    }
  }, [prompt, config.modelRid]);
  return (
    <div className="ed-widget ed-prompt-playground" data-widget-id={instance.id}>
      <div className="ed-prompt-playground__title">Prompt Playground</div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Enter prompt" />
      <button onClick={run} type="button" className="ed-button">Run</button>
      {response && <div data-testid="playground-response">{response}</div>}
    </div>
  );
}

// ── 25F Eval framework widget ──────────────────────────────────────────────

export function EvalFrameworkWidget({ instance }: WidgetProps): React.ReactNode {
  const [count, setCount] = useState<number>(0);
  const load = useCallback(async () => {
    const res = await fetch('/api/v1/evals', { method: 'GET' });
    if (res.ok) {
      const body = (await res.json()) as { data?: unknown[] };
      setCount(Array.isArray(body.data) ? body.data.length : 0);
    }
  }, []);
  return (
    <div className="ed-widget ed-eval-framework" data-widget-id={instance.id}>
      <div className="ed-eval-framework__title">Eval Framework</div>
      <button onClick={load} type="button" className="ed-button">List suites</button>
      {count > 0 && <div data-testid="eval-suite-count">{count} suites</div>}
    </div>
  );
}

// ── 25G AI proposal review widget ──────────────────────────────────────────

export function AiProposalReviewWidget({ instance }: WidgetProps): React.ReactNode {
  const [count, setCount] = useState<number>(0);
  const load = useCallback(async () => {
    const res = await fetch('/api/v1/ai-proposals', { method: 'GET' });
    if (res.ok) {
      const body = (await res.json()) as { proposals?: unknown[] };
      setCount(Array.isArray(body.proposals) ? body.proposals.length : 0);
    }
  }, []);
  return (
    <div className="ed-widget ed-ai-proposal-review" data-widget-id={instance.id}>
      <div className="ed-ai-proposal-review__title">AI Proposals</div>
      <button onClick={load} type="button" className="ed-button">Load proposals</button>
      {count > 0 && <div data-testid="ai-proposal-count">{count} proposals</div>}
    </div>
  );
}

// ── 25H Vector search widget ───────────────────────────────────────────────

export function VectorSearchWidget({ instance }: WidgetProps): React.ReactNode {
  const [text, setText] = useState<string>('');
  const [count, setCount] = useState<number>(0);
  const search = useCallback(async () => {
    const res = await fetch('/api/v1/embeddings/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, objectType: 'Document', field: 'embedding' }),
    });
    if (res.ok) {
      const body = (await res.json()) as { hits?: unknown[] };
      setCount(Array.isArray(body.hits) ? body.hits.length : 0);
    }
  }, [text]);
  return (
    <div className="ed-widget ed-vector-search" data-widget-id={instance.id}>
      <div className="ed-vector-search__title">Vector Search</div>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search text" />
      <button onClick={search} type="button" className="ed-button">Search</button>
      {count > 0 && <div data-testid="vector-search-count">{count} hits</div>}
    </div>
  );
}

// ── 25I LLM usage widget ───────────────────────────────────────────────────

export function LlmUsageWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { userId?: string };
  const [tokens, setTokens] = useState<number>(0);
  const load = useCallback(async () => {
    const user = config.userId ?? 'me';
    const res = await fetch(`/api/v1/llm/usage/${user}`, { method: 'GET' });
    if (res.ok) {
      const body = (await res.json()) as { records?: Array<{ totalTokens?: number }> };
      const records = Array.isArray(body.records) ? body.records : [];
      const total = records.reduce((s, r) => s + (typeof r.totalTokens === 'number' ? r.totalTokens : 0), 0);
      setTokens(total);
    }
  }, [config.userId]);
  return (
    <div className="ed-widget ed-llm-usage" data-widget-id={instance.id}>
      <div className="ed-llm-usage__title">LLM Usage</div>
      <button onClick={load} type="button" className="ed-button">Load usage</button>
      {tokens > 0 && <div data-testid="llm-usage-tokens">{tokens} tokens</div>}
    </div>
  );
}

// ── 25J Embedded copilot widget ────────────────────────────────────────────

export function EmbeddedCopilotWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { copilotId?: string };
  const [count, setCount] = useState<number>(0);
  const suggest = useCallback(async () => {
    const res = await fetch('/api/v1/copilots/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copilotId: config.copilotId ?? 'default' }),
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { prompts?: unknown[] } };
      setCount(Array.isArray(body.data?.prompts) ? body.data.prompts.length : 0);
    }
  }, [config.copilotId]);
  return (
    <div className="ed-widget ed-embedded-copilot" data-widget-id={instance.id}>
      <div className="ed-embedded-copilot__title">Embedded Copilot</div>
      <button onClick={suggest} type="button" className="ed-button">Suggest</button>
      {count > 0 && <div data-testid="copilot-suggestion-count">{count} prompts</div>}
    </div>
  );
}
