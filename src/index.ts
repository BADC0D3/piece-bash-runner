import { createPiece } from '@activepieces/pieces-framework';
import { bashRunnerPieceMetadata } from './piece-metadata';
import { runBashCommand } from './actions/run-bash-command';
import { runBashCommandSandboxed } from './actions/run-bash-command-sandboxed';

export const bashRunner = createPiece({
  displayName: 'Bash Command Runner',
  auth: bashRunnerPieceMetadata.auth,
  minimumSupportedRelease: bashRunnerPieceMetadata.minimumSupportedRelease,
  logoUrl: bashRunnerPieceMetadata.logoUrl,
  authors: bashRunnerPieceMetadata.authors,
  categories: bashRunnerPieceMetadata.categories,
  description: bashRunnerPieceMetadata.description,
  actions: [runBashCommand, runBashCommandSandboxed],
  triggers: [],
}); 