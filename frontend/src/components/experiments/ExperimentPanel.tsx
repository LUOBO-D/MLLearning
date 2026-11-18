import type { ComponentType } from 'react';
import ClassificationLab from './ClassificationLab';
import ComplexityLab from './ComplexityLab';
import DescentLab from './DescentLab';
import EvaluationLab from './EvaluationLab';
import LeakageLab from './LeakageLab';
import RegressionLab from './RegressionLab';
import NetworkLab from './NetworkLab';
import RegularizationLab from './RegularizationLab';
import TreeLab from './TreeLab';
import type { ExperimentProps } from './LabParts';

export type ExperimentType = 'regression' | 'descent' | 'complexity' | 'regularization' | 'classification' | 'evaluation' | 'tree' | 'network' | 'leakage';

const LABS = {
  regression: RegressionLab,
  descent: DescentLab,
  complexity: ComplexityLab,
  regularization: RegularizationLab,
  classification: ClassificationLab,
  evaluation: EvaluationLab,
  tree: TreeLab,
  network: NetworkLab,
  leakage: LeakageLab,
} satisfies Record<ExperimentType, ComponentType<ExperimentProps>>;

export default function ExperimentPanel({ type, onComplete, isSaving }: ExperimentProps & { type: ExperimentType }) {
  const Lab = LABS[type];
  return <Lab onComplete={onComplete} isSaving={isSaving} />;
}
