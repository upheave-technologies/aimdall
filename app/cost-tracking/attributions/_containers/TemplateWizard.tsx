'use client';

import { useState } from 'react';
import { TemplateWizardView } from '../_components/TemplateWizardView';
import { PillInput } from './PillInput';
import { CredentialAssigner } from './CredentialAssigner';
import { useToast } from './ToastProvider';
import type { TemplateType, CredentialWithProvider } from '@/modules/cost-tracking/domain/types';

// =============================================================================
// PROPS
// =============================================================================

type TemplateWizardProps = {
  credentials: CredentialWithProvider[];
  initialType: TemplateType | null;
  onClose: () => void;
  applyTemplateAction: (formData: FormData) => Promise<void>;
};

// =============================================================================
// CONTAINER
// =============================================================================

const TOTAL_STEPS = 5;

export function TemplateWizard({
  credentials,
  initialType,
  onClose,
  applyTemplateAction,
}: TemplateWizardProps) {
  const [step, setStep] = useState(initialType ? 2 : 1);
  const [templateType, setTemplateType] = useState<TemplateType | null>(initialType);
  const [groupNames, setGroupNames] = useState<string[]>(
    initialType === 'environment' ? ['Development', 'Staging', 'Production'] : [],
  );
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [applying, setApplying] = useState(false);
  const { addToast } = useToast();

  const handleClose = () => {
    const hasData = templateType !== null || groupNames.length > 0;
    if (hasData && !window.confirm('Discard your setup progress?')) return;
    onClose();
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const handleContinue = async () => {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
      return;
    }
    // Final step — apply
    if (!templateType || groupNames.length === 0) return;
    setApplying(true);
    const fd = new FormData();
    fd.set('templateType', templateType);
    fd.set('groupNames', groupNames.join(','));
    fd.set('credentialAssignments', JSON.stringify(assignments));
    await applyTemplateAction(fd);
    setApplying(false);
    addToast(`Created ${groupNames.length} group${groupNames.length !== 1 ? 's' : ''} with attribution rules`, 'success');
    onClose();
  };

  const handleSelectType = (type: TemplateType) => {
    setTemplateType(type);
    // Reset group names to defaults if switching to environment
    if (type === 'environment' && groupNames.length === 0) {
      setGroupNames(['Development', 'Staging', 'Production']);
    }
  };

  const pillInputSlot = (
    <PillInput
      pills={groupNames}
      onChange={setGroupNames}
      placeholder={`Type a ${templateType ?? 'group'} name and press Enter`}
    />
  );

  const credentialAssignerSlot = (
    <CredentialAssigner
      credentials={credentials}
      groups={groupNames}
      assignments={assignments}
      onChange={setAssignments}
    />
  );

  return (
    <TemplateWizardView
      step={step}
      totalSteps={TOTAL_STEPS}
      templateType={templateType}
      groupNames={groupNames}
      assignments={assignments}
      credentials={credentials}
      applying={applying}
      onClose={handleClose}
      onBack={handleBack}
      onContinue={handleContinue}
      onSelectType={handleSelectType}
      pillInputSlot={pillInputSlot}
      credentialAssignerSlot={credentialAssignerSlot}
    />
  );
}
