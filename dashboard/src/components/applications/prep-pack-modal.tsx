'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { assembleSource } from '@/lib/prep-pack/assemble-source';
import type {
  IntelligenceSnapshot,
  WizardConfig,
  PrepPackJobResponse,
} from '@/lib/prep-pack/types';

interface PrepPackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intelligence: IntelligenceSnapshot;
  intelligenceLoading: boolean;
}

const DEFAULT_CONFIG: WizardConfig = {
  voice: 'Steffan',
  depth: 'Standard',
  mode: 'Single',
  produceKindle: true,
  kindleFormat: 'KFX',
  customFocus: '',
};

export function PrepPackModal({
  open,
  onOpenChange,
  intelligence,
  intelligenceLoading,
}: PrepPackModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [config, setConfig] = useState<WizardConfig>(DEFAULT_CONFIG);
  const [sourceText, setSourceText] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Re-assembled fresh whenever Step 1 inputs change; user can override in Step 2.
  const assembledPreview = useMemo(
    () => assembleSource(intelligence, config.customFocus),
    [intelligence, config.customFocus],
  );

  const goToPreview = () => {
    setSourceText(assembledPreview);
    setStep(2);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/prep-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intelligence, config, sourceText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Failed to start render: ${(err as { reason?: string }).reason ?? res.statusText}`);
        return;
      }
      const data = (await res.json()) as PrepPackJobResponse;
      toast.success(`Prep Pack rendering started: ${data.jobStem}`, {
        description: `MP3 will be at ${data.expectedOutputs.mp3}. You'll get a Discord ping when it's ready.`,
        duration: 10000,
      });
      onOpenChange(false);
      // Reset for next open
      setStep(1);
      setConfig(DEFAULT_CONFIG);
      setSourceText('');
    } catch (err) {
      toast.error(`Network error: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Prep Pack — {intelligence.company} — {intelligence.jobTitle}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Configure how the audiobook + ebook should be produced.'
              : 'Review and edit the source text before rendering.'}
          </DialogDescription>
        </DialogHeader>

        {intelligenceLoading && (
          <p className="text-sm text-muted-foreground">Loading Intelligence data…</p>
        )}

        {step === 1 && !intelligenceLoading && (
          <div className="space-y-6 flex-1 min-h-0 overflow-y-auto pr-1">
            <div>
              <Label>Voice</Label>
              <RadioGroup
                value={config.voice}
                onValueChange={(v) =>
                  setConfig({ ...config, voice: v as WizardConfig['voice'] })
                }
                className="grid grid-cols-2 gap-2 mt-2"
              >
                {(['Steffan', 'Aria', 'Jenny', 'Guy'] as const).map((v) => (
                  <div key={v} className="flex items-center space-x-2">
                    <RadioGroupItem value={v} id={`voice-${v}`} />
                    <Label htmlFor={`voice-${v}`}>{v}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label>Depth</Label>
              <RadioGroup
                value={config.depth}
                onValueChange={(v) =>
                  setConfig({ ...config, depth: v as WizardConfig['depth'] })
                }
                className="flex gap-4 mt-2"
              >
                {(['Quick', 'Standard', 'Deep'] as const).map((d) => (
                  <div key={d} className="flex items-center space-x-2">
                    <RadioGroupItem value={d} id={`depth-${d}`} />
                    <Label htmlFor={`depth-${d}`}>{d}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label>Mode</Label>
              <RadioGroup
                value={config.mode}
                onValueChange={(v) =>
                  setConfig({ ...config, mode: v as WizardConfig['mode'] })
                }
                className="flex gap-4 mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Single" id="mode-single" />
                  <Label htmlFor="mode-single">Single book</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Series" id="mode-series" />
                  <Label htmlFor="mode-series">3-book series</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="kindle-toggle">Also produce a Kindle ebook</Label>
                <Switch
                  id="kindle-toggle"
                  checked={config.produceKindle}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, produceKindle: checked })
                  }
                />
              </div>
              {config.produceKindle && (
                <RadioGroup
                  value={config.kindleFormat}
                  onValueChange={(v) =>
                    setConfig({ ...config, kindleFormat: v as WizardConfig['kindleFormat'] })
                  }
                  className="flex gap-4 ml-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="KFX" id="fmt-kfx" />
                    <Label htmlFor="fmt-kfx">KFX (Kindle Scribe)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="AZW3" id="fmt-azw3" />
                    <Label htmlFor="fmt-azw3">AZW3 (universal Kindle)</Label>
                  </div>
                </RadioGroup>
              )}
            </div>

            <div>
              <Label htmlFor="custom-focus">Custom Focus (optional)</Label>
              <Textarea
                id="custom-focus"
                placeholder="Lean heavy on SCCM. Skip the personal background section."
                value={config.customFocus}
                onChange={(e) => setConfig({ ...config, customFocus: e.target.value })}
                className="mt-2 min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Plain text — the wizard adds the markdown heading automatically. SB-Autobook treats this as authoritative emphasis/exclusion guidance.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={goToPreview}>Next: Preview ▶</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <Label htmlFor="source-text">Source text — edit freely before rendering</Label>
            <Textarea
              id="source-text"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              className="font-mono text-sm h-[60vh] resize-none overflow-y-auto"
            />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                ◀ Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || sourceText.trim().length === 0}
              >
                {submitting ? 'Starting…' : 'Render ▶'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
