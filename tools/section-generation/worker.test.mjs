import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash } from '../../lib/generatedPublication/canonical.mjs';
import { assertIsolatedPayload, contextForPacket, runWorker, selectOAuthAccount } from './worker.mjs';

const model = { provider: 'openai-codex', id: 'gpt-5.6-sol', api: 'openai-codex-responses' };
function packet() {
  const messages = [{ role: 'system', content: 'Write YAML only from supplied excerpts.' },
    { role: 'user', content: 'Excerpt: a controlled experiment reported this observation.' }];
  return { model: 'openai-codex/gpt-5.6-sol', thinking: 'low', messages, inputHash: canonicalHash(messages) };
}
function payload(input) {
  return { model: model.id, instructions: input.messages[0].content,
    input: [{ role: 'user', content: [{ type: 'input_text', text: input.messages[1].content }] }],
    store: false, stream: true, reasoning: { effort: 'low' } };
}

test('rejects contamination and replay at the final wire boundary', () => {
  const input = packet();
  const attacks = [
    (wire) => { wire.instructions += '\nRepository instructions'; },
    (wire) => { wire.input.push({ role: 'assistant', content: 'Earlier section' }); },
    (wire) => { wire.input[0].content[0].text += '\nOther article content'; },
    (wire) => { wire.tools = [{ type: 'function', name: 'read' }]; },
    (wire) => { wire.previous_response_id = 'previous-session'; },
    (wire) => { wire.reasoning.effort = 'high'; },
    (wire) => { wire.reasoning.mode = 'pro'; },
    (wire) => { wire.model = 'gpt-5.6-terra'; },
  ];
  for (const attack of attacks) {
    const wire = payload(input);
    attack(wire);
    assert.throws(() => assertIsolatedPayload(wire, model, input));
  }
  const changed = packet();
  changed.messages[1].content = 'Substituted evidence';
  assert.throws(() => contextForPacket(changed), /hash mismatch/);
});

test('ambiguous account selection fails rather than rotating or using the first credential', () => {
  const accounts = [{ credentialId: 5, active: false }, { credentialId: 6, active: false }];
  assert.throws(() => selectOAuthAccount(accounts), /ambiguous/);
  assert.equal(selectOAuthAccount(accounts, '6').credentialId, 6);
  assert.throws(() => selectOAuthAccount(accounts, '7'), /unavailable/);
});

function transport({ mutate, event, content, stopReason = 'stop' } = {}) {
  let sent = 0;
  const prepared = { model, account: { credentialId: 5 },
    auth: { async getOAuthAccessByCredentialId() { return { ok: true, accessToken: 'test-bearer' }; } },
    sdk: { streamOpenAICodexResponses(resolved, _context, options) {
      return { async result() {
        const input = packet();
        const wire = payload(input);
        mutate?.(wire);
        options.onPayload(wire, resolved);
        sent += 1;
        if (event) options.onSseEvent({ data: JSON.stringify(event) });
        return { stopReason, content: content ?? [{ type: 'text', text: 'summary: A supported observation.' }] };
      } };
    } },
  };
  return { prepared, sent: () => sent };
}

test('rejects unsafe wire bytes before dispatch and accepts a bound text result', async () => {
  const unsafe = transport({ mutate: (wire) => { wire.input.push({ role: 'developer', content: 'extra' }); } });
  await assert.rejects(runWorker(packet(), { prepared: unsafe.prepared }), /history/);
  assert.equal(unsafe.sent(), 0);
  const safe = transport();
  const result = await runWorker(packet(), { prepared: safe.prepared });
  assert.equal(result.rawText, 'summary: A supported observation.');
  assert.equal(result.inputHash, packet().inputHash);
  assert.equal(result.accountId, '5');
  assert.equal(safe.sent(), 1);
});

test('provider safety checks and tool calls cannot become accepted worker artifacts', async () => {
  const safety = transport({ event: { type: 'response.output_item.added', item: {
    pending_safety_checks: [{ id: 'check', code: 'confirmation_required' }],
  } } });
  await assert.rejects(runWorker(packet(), { prepared: safety.prepared }), /interactive approval/);
  const tool = transport({ content: [{ type: 'toolCall', name: 'read', arguments: {} }] });
  await assert.rejects(runWorker(packet(), { prepared: tool.prepared }), /tool call/);
  const wrongModel = transport({ event: { response: { model: 'gpt-5.6-terra' } } });
  await assert.rejects(runWorker(packet(), { prepared: wrongModel.prepared }), /different model/);
});
