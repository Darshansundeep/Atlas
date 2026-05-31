/**
 * Spec 007: per-(provider, model) pricing override editor.
 *
 * Lives under Settings → Models. Lists every (provider, model) pair the
 * user has visible (current selection + known_models from configured
 * providers) plus any model that already has a saved override. Each row is
 * editable; saving writes to `settings.pricingOverrides`, which
 * CostTracker reads ahead of the canonical catalogue.
 *
 * Storage decision: local settings.json — see specs/007-provider-pricing
 * open question #1. This keeps BYOK signed-out users functional and
 * defers cloud sync to spec 021-admin-console.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { useConfig } from '../../ConfigContext';
import {
  clearOverride,
  loadPricingOverrides,
  modelKey,
  setOverride,
} from '../../../utils/pricing';
import type { PricingOverrides } from '../../../utils/settings';

interface Row {
  provider: string;          // canonical (lowercased) provider id
  providerDisplay: string;   // human-readable provider name
  model: string;
  catalogueInput?: number | null;
  catalogueOutput?: number | null;
  override?: { input: number; output: number; cacheHitDiscount?: number; updatedAt: string };
}

const FREE_PROVIDERS = new Set(['ollama', 'local', 'localhost']);

export default function PricingSection() {
  const { getProviders } = useConfig();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideFree, setHideFree] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [providers, overrides] = await Promise.all([
        getProviders(true),
        loadPricingOverrides(),
      ]);
      setRows(buildRows(providers, overrides));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load providers');
    } finally {
      setIsLoading(false);
    }
  }, [getProviders]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideFree && FREE_PROVIDERS.has(r.provider)) return false;
      if (!f) return true;
      return (
        r.model.toLowerCase().includes(f) ||
        r.provider.toLowerCase().includes(f) ||
        r.providerDisplay.toLowerCase().includes(f)
      );
    });
  }, [rows, filter, hideFree]);

  return (
    <Card className="pb-2 rounded-lg">
      <CardHeader className="pb-2">
        <CardTitle>Pricing Overrides</CardTitle>
        <CardDescription>
          Set USD per 1M tokens for any provider × model. Overrides take
          precedence over the bundled catalogue and are stored locally on
          this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2">
        <div className="flex flex-wrap items-center gap-2 mb-3 px-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by provider or model…"
            className="flex-1 min-w-[200px] px-2 py-1 text-sm rounded-md border border-border-subtle bg-background-default text-text-primary"
          />
          <label className="flex items-center gap-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={hideFree}
              onChange={(e) => setHideFree(e.target.checked)}
            />
            Hide free / local providers
          </label>
          <Button size="sm" variant="outline" onClick={load} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {error && (
          <div className="text-xs text-text-error px-2 py-1">{error}</div>
        )}

        {isLoading && rows.length === 0 ? (
          <div className="text-xs text-text-secondary px-2 py-4">Loading providers…</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-xs text-text-secondary px-2 py-4">
            No models match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto px-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-text-secondary border-b border-border-subtle">
                  <th className="text-left py-2 pr-3 font-medium">Provider</th>
                  <th className="text-left py-2 pr-3 font-medium">Model</th>
                  <th className="text-right py-2 pr-3 font-medium">Input / 1M</th>
                  <th className="text-right py-2 pr-3 font-medium">Output / 1M</th>
                  <th className="text-right py-2 pr-3 font-medium">Cache hit %</th>
                  <th className="text-left py-2 pr-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <PricingRow key={modelKey(row.provider, row.model) ?? `${row.provider}/${row.model}`}
                    row={row}
                    onSaved={load}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function buildRows(
  providers: Array<{
    name: string;
    metadata: { display_name: string; known_models: Array<{ name: string; input_token_cost?: number | null; output_token_cost?: number | null }> };
  }>,
  overrides: PricingOverrides
): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();

  for (const p of providers) {
    const provider = p.name.toLowerCase();
    const providerDisplay = p.metadata?.display_name ?? p.name;
    for (const m of p.metadata?.known_models ?? []) {
      const key = `${provider}/${m.name}`;
      seen.add(key);
      const ov = overrides[key];
      rows.push({
        provider,
        providerDisplay,
        model: m.name,
        catalogueInput: m.input_token_cost ?? null,
        catalogueOutput: m.output_token_cost ?? null,
        override: ov
          ? {
              input: ov.inputPerMillion,
              output: ov.outputPerMillion,
              cacheHitDiscount: ov.cacheHitDiscount,
              updatedAt: ov.updatedAt,
            }
          : undefined,
      });
    }
  }

  // Pull in any orphaned overrides (model not in known_models any more).
  for (const [key, ov] of Object.entries(overrides)) {
    if (seen.has(key)) continue;
    const [provider, ...rest] = key.split('/');
    const model = rest.join('/');
    rows.push({
      provider,
      providerDisplay: provider,
      model,
      override: {
        input: ov.inputPerMillion,
        output: ov.outputPerMillion,
        cacheHitDiscount: ov.cacheHitDiscount,
        updatedAt: ov.updatedAt,
      },
    });
  }

  rows.sort((a, b) =>
    a.providerDisplay.localeCompare(b.providerDisplay) || a.model.localeCompare(b.model)
  );

  return rows;
}

interface PricingRowProps {
  row: Row;
  onSaved: () => void;
}

function PricingRow({ row, onSaved }: PricingRowProps) {
  const displayInput =
    row.override?.input ?? row.catalogueInput ?? '';
  const displayOutput =
    row.override?.output ?? row.catalogueOutput ?? '';
  const displayDiscount = row.override?.cacheHitDiscount
    ? (row.override.cacheHitDiscount * 100).toFixed(0)
    : '';

  const [input, setInput] = useState<string>(String(displayInput));
  const [output, setOutput] = useState<string>(String(displayOutput));
  const [discount, setDiscount] = useState<string>(displayDiscount);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setInput(String(displayInput));
    setOutput(String(displayOutput));
    setDiscount(displayDiscount);
  }, [displayInput, displayOutput, displayDiscount]);

  const dirty =
    input !== String(displayInput) ||
    output !== String(displayOutput) ||
    discount !== displayDiscount;

  const save = useCallback(async () => {
    const iNum = parseFloat(input);
    const oNum = parseFloat(output);
    if (Number.isNaN(iNum) || Number.isNaN(oNum) || iNum < 0 || oNum < 0) return;
    const dRaw = discount.trim() === '' ? undefined : parseFloat(discount);
    const cacheHitDiscount =
      dRaw === undefined || Number.isNaN(dRaw) ? undefined : Math.max(0, Math.min(1, dRaw / 100));
    setSaving(true);
    try {
      await setOverride(row.provider, row.model, {
        inputPerMillion: iNum,
        outputPerMillion: oNum,
        cacheHitDiscount,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [input, output, discount, row.provider, row.model, onSaved]);

  const reset = useCallback(async () => {
    setSaving(true);
    try {
      await clearOverride(row.provider, row.model);
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [row.provider, row.model, onSaved]);

  return (
    <tr className="border-b border-border-subtle/40 hover:bg-background-muted/40">
      <td className="py-1.5 pr-3 text-text-secondary">{row.providerDisplay}</td>
      <td className="py-1.5 pr-3 font-mono text-text-primary">
        {row.model}
        {row.override && (
          <span className="ml-2 inline-block text-[10px] px-1 py-0.5 rounded bg-background-muted text-text-secondary">
            override
          </span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-right">
        <input
          type="number"
          min={0}
          step="0.01"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-20 px-1.5 py-0.5 text-right rounded border border-border-subtle bg-background-default font-mono"
        />
      </td>
      <td className="py-1.5 pr-3 text-right">
        <input
          type="number"
          min={0}
          step="0.01"
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          className="w-20 px-1.5 py-0.5 text-right rounded border border-border-subtle bg-background-default font-mono"
        />
      </td>
      <td className="py-1.5 pr-3 text-right">
        <input
          type="number"
          min={0}
          max={100}
          step="1"
          value={discount}
          placeholder="0"
          onChange={(e) => setDiscount(e.target.value)}
          className="w-16 px-1.5 py-0.5 text-right rounded border border-border-subtle bg-background-default font-mono"
        />
      </td>
      <td className="py-1.5 pr-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={save} disabled={!dirty || saving}>
            Save
          </Button>
          {row.override && (
            <Button size="sm" variant="ghost" onClick={reset} disabled={saving}>
              Reset
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
