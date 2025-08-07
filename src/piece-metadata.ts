import { PieceAuth, Property } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';

export const bashRunnerAuth = PieceAuth.None();

export const bashRunnerPieceMetadata = {
  displayName: 'Bash Command Runner',
  description: 'Execute bash commands with support for mounting NFS/SMB drives',
  minimumSupportedRelease: '0.20.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/bash-runner.png',
  categories: [PieceCategory.DEVELOPER_TOOLS],
  authors: ['Your Name'],
  auth: bashRunnerAuth,
}; 