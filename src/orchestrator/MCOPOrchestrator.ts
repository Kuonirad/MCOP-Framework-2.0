import {
  CommitPipelineStageExecutionInput,
  PipelineStageCommitResult,
} from '../telemetry/MCOPHardeningBootstrapper';

export interface MCOPOrchestratorDependencies {
  hardeningBootstrapper?: {
    commitPipelineStageExecution(
      input: CommitPipelineStageExecutionInput,
    ): Promise<PipelineStageCommitResult>;
  };
}

export class MCOPOrchestrator {
  private readonly hardeningBootstrapper?: MCOPOrchestratorDependencies['hardeningBootstrapper'];

  constructor(dependencies: MCOPOrchestratorDependencies = {}) {
    this.hardeningBootstrapper = dependencies.hardeningBootstrapper;
  }

  public async commitPipelineStageExecution(
    input: CommitPipelineStageExecutionInput,
  ): Promise<PipelineStageCommitResult | undefined> {
    return this.hardeningBootstrapper?.commitPipelineStageExecution(input);
  }
}
