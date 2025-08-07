import { createAction, Property, ActionContext } from '@activepieces/pieces-framework';
import Docker from 'dockerode';

export const runBashCommandSandboxed = createAction({
  name: 'run-bash-command-sandboxed',
  displayName: 'Run Bash Command (Sandboxed)',
  description: 'Execute bash commands in a Docker container with NFS/SMB mounting support. Requires Docker socket access (mount with -v /var/run/docker.sock:/var/run/docker.sock)',
  props: {
    command: Property.LongText({
      displayName: 'Bash Command',
      description: 'The bash command or script to execute',
      required: true,
      defaultValue: `#!/bin/bash
# Example: Show system information in container
echo "Container Information:"
echo "===================="
echo "Hostname: $(hostname)"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo ""
echo "Current directory: $(pwd)"
echo "Files:"
ls -la
echo ""
echo "Disk usage:"
df -h`,
    }),
    mountConfig: Property.Object({
      displayName: 'Mount Configuration (Optional)',
      description: 'Configure NFS or SMB mount inside container',
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
      description: 'Mount point inside container',
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
    dockerImage: Property.ShortText({
      displayName: 'Docker Image',
      description: 'Docker image to use (must have bash and mount utilities)',
      required: false,
      defaultValue: 'ubuntu:latest',
    }),
    timeout: Property.Number({
      displayName: 'Timeout (seconds)',
      description: 'Maximum execution time in seconds',
      required: false,
      defaultValue: 30,
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
      dockerImage, 
      timeout 
    } = context.propsValue;
    const docker = new Docker();
    
    const imageName = dockerImage || 'ubuntu:latest';
    
    try {
      // Check if image exists locally
      console.log(`Checking for Docker image ${imageName}...`);
      try {
        await docker.getImage(imageName).inspect();
        console.log(`Image ${imageName} found locally`);
      } catch (error) {
        // Image doesn't exist locally, pull it
        console.log(`Image ${imageName} not found locally, pulling...`);
        
        const stream = await docker.pull(imageName);
        
        // Wait for pull to complete
        await new Promise((resolve, reject) => {
          docker.modem.followProgress(stream, (err: any, res: any) => {
            if (err) {
              reject(err);
            } else {
              console.log(`Successfully pulled ${imageName}`);
              resolve(res);
            }
          }, (event: any) => {
            if (event.status) {
              console.log(`${event.status}${event.progress ? ': ' + event.progress : ''}`);
            }
          });
        });
      }
      
      // Build the command with mount if needed
      let fullScript = '';
      
      if (mountType && mountSource) {
        // Build mount command
        let mountCommand = '';
        if (mountType === 'nfs') {
          // Install nfs utilities if needed - redirect output to stderr
          fullScript += `#!/bin/bash
# Don't exit on error - we want to continue even if mount fails
set +e

echo "Installing NFS utilities..." >&2
apt-get update >&2 && apt-get install -y nfs-common >&2 || echo "Package installation had issues but continuing..." >&2
echo "NFS utilities installation complete" >&2
`;
          const nfsOptions = mountOptions || 'rw,sync';
          mountCommand = `mount -t nfs -o ${nfsOptions} ${mountSource} ${mountPoint}`;
        } else if (mountType === 'smb') {
          // Install cifs utilities if needed - redirect output to stderr
          fullScript += `#!/bin/bash
# Don't exit on error - we want to continue even if mount fails
set +e

echo "Installing SMB/CIFS utilities..." >&2
apt-get update >&2 && apt-get install -y cifs-utils >&2 || echo "Package installation had issues but continuing..." >&2
echo "SMB/CIFS utilities installation complete" >&2
`;
          let smbOptions = mountOptions || 'rw';
          if (mountUsername) {
            smbOptions += `,username=${mountUsername}`;
            if (mountPassword) {
              smbOptions += `,password=${mountPassword}`;
            }
          }
          mountCommand = `mount -t cifs -o ${smbOptions} ${mountSource} ${mountPoint}`;
        }
        
        fullScript += `
# Create mount point
mkdir -p ${mountPoint} || true

# Try to mount network drive (continue on failure)
echo "Attempting to mount ${mountSource} to ${mountPoint}..." >&2
if ${mountCommand} 2>&1; then
  echo "Mount successful" >&2
else
  echo "Mount failed (exit code: $?), but continuing with command execution" >&2
fi

echo "Executing user command..." >&2

# Execute user command regardless of mount status
${command}

# Save the exit code
COMMAND_EXIT_CODE=$?

# Try to unmount (ignore errors)
echo "Cleaning up mount..." >&2
umount ${mountPoint} 2>/dev/null || true

# Exit with the command's exit code
exit $COMMAND_EXIT_CODE
`;
      } else {
        fullScript = `#!/bin/bash
# No mount configuration - just run the command
set +e

echo "No mount configuration detected, executing command directly..." >&2

${command}
`;
        }
      
      // Encode the script to avoid shell escaping issues
      const encodedScript = Buffer.from(fullScript).toString('base64');
      
      // Create container
      const container = await docker.createContainer({
        Image: imageName,
        Cmd: ['bash', '-c', `echo '${encodedScript}' | base64 -d | bash`],
        WorkingDir: '/workspace',
        HostConfig: {
          AutoRemove: true,
          Memory: 512 * 1024 * 1024, // 512MB
          CpuQuota: 50000, // 50% CPU
          CapAdd: ['SYS_ADMIN'], // Required for mounting
          SecurityOpt: ['apparmor:unconfined'], // Required for some mount operations
        },
        AttachStdout: true,
        AttachStderr: true,
      });
      
      // Start container
      const stream = await container.attach({ stream: true, stdout: true, stderr: true });
      await container.start();
      
      // Collect output
      let stdout = '';
      let stderr = '';
      
      stream.on('data', (chunk: Buffer) => {
        const data = chunk.toString();
        // Docker multiplexes stdout/stderr, need to parse
        if (chunk[0] === 1) {
          stdout += data.slice(8);
        } else if (chunk[0] === 2) {
          stderr += data.slice(8);
        } else {
          stdout += data;
        }
      });
      
      // Set timeout
      const executionTimeout = (timeout || 30) * 1000;
      const timeoutHandle = setTimeout(async () => {
        try {
          await container.kill();
        } catch (e) {
          // Container might have already stopped
        }
      }, executionTimeout);
      
      // Wait for container to finish
      try {
        await container.wait();
      } finally {
        clearTimeout(timeoutHandle);
      }
      
      return {
        success: true,
        output: stdout,
        stdout: stdout,
        stderr: stderr,
        executionTime: new Date().toISOString(),
      };
      
    } catch (error: any) {
      console.error('Docker execution error:', error);
      
      // Provide more specific error messages
      if (error.message?.includes('connect ENOENT')) {
        throw new Error(
          'Docker socket not found. Please ensure Docker is running and the socket is mounted with -v /var/run/docker.sock:/var/run/docker.sock'
        );
      } else if (error.statusCode === 404) {
        throw new Error(
          `Docker image ${imageName} not found and could not be pulled. Please check your internet connection.`
        );
      } else {
        throw error;
      }
    }
  },
}); 