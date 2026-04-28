'use client';

import { useState, useEffect } from 'react';
import { RuleBuilderForm } from '../_components/RuleBuilderForm';
import { previewRuleAction } from '../actions';
import { useToast } from '../../_containers/ToastProvider';
import type { CredentialWithProvider } from '@/modules/cost-tracking/domain/types';
import type { RulePreview } from '../_components/_types';

// =============================================================================
// PROPS
// =============================================================================

type RuleBuilderProps = {
  groupId: string;
  credentials: CredentialWithProvider[];
  createRuleAction: (formData: FormData) => Promise<void>;
  onClose: () => void;
};

// =============================================================================
// CONTAINER
// =============================================================================

export function RuleBuilder({ groupId, credentials, createRuleAction, onClose }: RuleBuilderProps) {
  const [dimension, setDimension] = useState('credential');
  const [matchType, setMatchType] = useState('exact');
  const [matchValue, setMatchValue] = useState('');
  const [priority, setPriority] = useState(0);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { addToast } = useToast();

  // Debounced live preview — calls previewRuleAction directly to get ActionResult back
  useEffect(() => {
    if (!matchValue.trim()) {
      setPreview(null);
      return;
    }

    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      const fd = new FormData();
      fd.set('dimension', dimension);
      fd.set('matchType', matchType);
      fd.set('matchValue', matchValue);

      const result = await previewRuleAction(fd);
      setPreviewLoading(false);

      if (result.success && result.data) {
        setPreview({
          matchedRecords: result.data.matchedRecords,
          matchedCost: result.data.matchedCost,
          sampleValues: result.data.sampleValues,
        });
      } else {
        setPreview(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [dimension, matchType, matchValue]);

  const handleSubmit = async () => {
    if (!matchValue.trim()) return;
    const fd = new FormData();
    fd.set('groupId', groupId);
    fd.set('dimension', dimension);
    fd.set('matchType', matchType);
    fd.set('matchValue', matchValue);
    fd.set('priority', String(priority));
    await createRuleAction(fd);
    addToast('Rule created', 'success');
    onClose();
  };

  return (
    <RuleBuilderForm
      credentials={credentials}
      dimension={dimension}
      matchType={matchType}
      matchValue={matchValue}
      priority={priority}
      preview={preview}
      previewLoading={previewLoading}
      onDimensionChange={setDimension}
      onMatchTypeChange={setMatchType}
      onMatchValueChange={setMatchValue}
      onPriorityChange={setPriority}
      onSubmit={handleSubmit}
      onCancel={onClose}
    />
  );
}
