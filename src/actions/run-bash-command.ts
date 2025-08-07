import { createAction, Property, ActionContext } from '@activepieces/pieces-framework';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync } from 'fs';

const execAsync = promisify(exec);

export const runBashCommand = createAction({
  name: 'run-bash-command',
  displayName: 'Run Bash Command',
  description: 'Execute bash commands with optional NFS/SMB mounting',
  props: {
    command: Property.LongText({
      displayName: 'Bash Command',
      description: 'The bash command or script to execute',
      required: true,
      defaultValue: `#!/bin/bash
# Example: List files and show system info
echo "Current directory: $(pwd)"
echo "Files:"
ls -la
echo ""
echo "System info:"
uname -a`,
    }),
    mountConfig: Property.Object({
      displayName: 'Mount Configuration (Optional)',
      description: 'Configure NFS or SMB mount before running command',
      required: false,
    }),
    mountType: Property.StaticDropdown({
      displayName: 'Mount Type',
      description: 'Type of network mount (leave empty for no mount)',
      required: false,
      options: {
        options: [
          { label: 'None', value: '' },
          { label: 'NFS', value: 'nfs' },
          { label: 'SMB/CIFS', value: 'smb' },
        ],
      },
      defaultValue: '',
    }),
    mountSource: Property.ShortText({
      displayName: 'Mount Source',
      description: 'Network path (e.g., server:/path or //server/share)',
      required: false,
    }),
    mountPoint: Property.ShortText({
      displayName: 'Mount Point',
      description: 'Local mount point (e.g., /mnt/network)',
      required: false,
      defaultValue: '/mnt/network',
    }),
    mountOptions: Property.ShortText({
      displayName: 'Mount Options',
      description: 'Additional mount options',
      required: false,
      defaultValue: '',
    }),
    mountUsername: Property.ShortText({
      displayName: 'Username (SMB only)',
      description: 'Username for SMB authentication',
      required: false,
    }),
    mountPassword: Property.ShortText({
      displayName: 'Password (SMB only)',
      description: 'Password for SMB authentication (use secure storage in production)',
      required: false,
    }),
    workingDirectory: Property.ShortText({
      displayName: 'Working Directory',
      description: 'Directory to execute the command in',
      required: false,
      defaultValue: '/tmp',
    }),
    timeout: Property.Number({
      displayName: 'Timeout (seconds)',
      description: 'Maximum execution time in seconds',
      required: false,
      defaultValue: 30,
    }),
    captureOutput: Property.Checkbox({
      displayName: 'Capture Output',
      description: 'Capture stdout and stderr separately',
      required: false,
      defaultValue: true,
    }),
  },
  async run(context: ActionContext) {
    const { 
      command, 
      mountType,
      mountSource,
      mountPoint,
      mountOptions,
      mountUsername,
      mountPassword,
      workingDirectory, 
      timeout, 
      captureOutput 
    } = context.propsValue;
    
    let mountCleanup = '';
    let fullCommand = '';
    
    try {
      // Create working directory if it doesn't exist
      if (!existsSync(workingDirectory)) {
        mkdirSync(workingDirectory, { recursive: true });
      }
      
      // Handle mount configuration if provided
      if (mountType && mountSource) {
        // Create mount point if it doesn't exist
        if (!existsSync(mountPoint)) {
          mkdirSync(mountPoint, { recursive: true });
        }
        
        // Build mount command based on type
        let mountCommand = '';
        if (mountType === 'nfs') {
          const nfsOptions = mountOptions || 'rw,sync';
          mountCommand = `mount -t nfs -o ${nfsOptions} ${mountSource} ${mountPoint}`;
        } else if (mountType === 'smb') {
          let smbOptions = mountOptions || 'rw';
          if (mountUsername) {
            smbOptions += `,username=${mountUsername}`;
            if (mountPassword) {
              smbOptions += `,password=${mountPassword}`;
            }
          }
          mountCommand = `mount -t cifs -o ${smbOptions} ${mountSource} ${mountPoint}`;
        }
        
        // Set up cleanup command
        mountCleanup = `umount ${mountPoint} 2>/dev/null || true`;
        
        // Combine mount, command, and cleanup
        fullCommand = `
          # Mount network drive
          ${mountCommand}
          
          # Execute user command
          cd ${workingDirectory}
          ${command}
          
          # Cleanup will happen in finally block
        `;
      } else {
        // No mount needed, just run the command
        fullCommand = `cd ${workingDirectory} && ${command}`;
      }
      
      // Execute the command
      const { stdout, stderr } = await execAsync(fullCommand, {
        timeout: (timeout || 30) * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        shell: '/bin/bash',
      });
      
      // Clean up mount if needed
      if (mountCleanup) {
        try {
          await execAsync(mountCleanup);
        } catch (e) {
          // Ignore unmount errors
        }
      }
      
      if (captureOutput) {
        return {
          success: true,
          output: stdout || '',
          stdout: stdout || '',
          stderr: stderr || '',
          executionTime: new Date().toISOString(),
        };
      }
      
      return {
        success: true,
        output: stdout || '',
        executionTime: new Date().toISOString(),
      };
      
    } catch (error: any) {
      // Try to clean up mount on error
      if (mountCleanup) {
        try {
          await execAsync(mountCleanup);
        } catch (e) {
          // Ignore unmount errors
        }
      }
      
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        code: error.code || 1,
        executionTime: new Date().toISOString(),
      };
    }
  },
}); 