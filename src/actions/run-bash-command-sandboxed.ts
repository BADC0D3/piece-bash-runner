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
    runAsRoot: Property.Checkbox({
      displayName: 'Run as Root',
      description: 'Run commands as root user instead of non-root user (less secure)',
      required: false,
      defaultValue: false,
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
      timeout,
      runAsRoot 
    } = context.propsValue;
    const docker = new Docker();
    
    const imageName = dockerImage || 'ubuntu:latest';
    
    // Clean the user's command - remove any leading shebang
    const cleanedCommand = command.replace(/^#!.*\n/, '').trim();
    
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
        let installPackages = '';
        
        if (mountType === 'nfs') {
          installPackages = `
# Install NFS utilities as root
export DEBIAN_FRONTEND=noninteractive
if command -v apt-get &>/dev/null; then
  timeout 30 apt-get update -qq >/dev/null 2>&1 || echo "[Warning] apt-get update failed" >&2
  timeout 30 apt-get install -y --no-install-recommends nfs-common >/dev/null 2>&1 || echo "[Warning] nfs-common installation failed" >&2
elif command -v apk &>/dev/null; then
  apk add --no-cache nfs-utils >/dev/null 2>&1 || echo "[Warning] nfs-utils installation failed" >&2
elif command -v yum &>/dev/null; then
  yum install -y nfs-utils >/dev/null 2>&1 || echo "[Warning] nfs-utils installation failed" >&2
fi`;
          const nfsOptions = mountOptions || 'rw,sync';
          mountCommand = `mount -t nfs -o ${nfsOptions} ${mountSource} ${mountPoint}`;
        } else if (mountType === 'smb') {
          installPackages = `
# Install CIFS utilities as root
export DEBIAN_FRONTEND=noninteractive
if command -v apt-get &>/dev/null; then
  timeout 30 apt-get update -qq >/dev/null 2>&1 || echo "[Warning] apt-get update failed" >&2
  timeout 30 apt-get install -y --no-install-recommends cifs-utils >/dev/null 2>&1 || echo "[Warning] cifs-utils installation failed" >&2
elif command -v apk &>/dev/null; then
  apk add --no-cache cifs-utils >/dev/null 2>&1 || echo "[Warning] cifs-utils installation failed" >&2
elif command -v yum &>/dev/null; then
  yum install -y cifs-utils >/dev/null 2>&1 || echo "[Warning] cifs-utils installation failed" >&2
fi`;
          let smbOptions = mountOptions || 'rw';
          if (mountUsername) {
            smbOptions += `,username=${mountUsername}`;
            if (mountPassword) {
              smbOptions += `,password=${mountPassword}`;
            }
          }
          mountCommand = `mount -t cifs -o ${smbOptions} ${mountSource} ${mountPoint}`;
        }
        
        fullScript = `#!/bin/bash
# Script runs as root initially
set +e

${installPackages}

# Create mount point as root
mkdir -p ${mountPoint} 2>/dev/null || echo "[Warning] Could not create mount point ${mountPoint}" >&2

# Mount network drive as root
if ${mountCommand}; then
  :  # Mount successful, no output
else
  MOUNT_EXIT=$?
  echo "[Error] Mount failed with exit code: $MOUNT_EXIT" >&2
fi

${runAsRoot ? `
# Execute command as root
cd /workspace
${cleanedCommand}
` : `
# Switch to non-root user for command execution
su - activepieces << 'EOF'
cd /workspace
${cleanedCommand}
EOF
`}

# Unmount as root (after user command completes)
umount ${mountPoint} 2>/dev/null || true
`;
      } else {
        // No mount needed
        fullScript = `#!/bin/bash
# No mount configuration
set +e

${runAsRoot ? `
# Execute command as root
cd /workspace
${cleanedCommand}
` : `
# Run command as non-root user
su - activepieces << 'EOF'
cd /workspace
${cleanedCommand}
EOF
`}
`;
      }
      
      // Encode the script to avoid shell escaping issues
      const encodedScript = Buffer.from(fullScript).toString('base64');
      
      // Create container
      const container = await docker.createContainer({
        Image: imageName,
        Cmd: ['bash', '-c', `
          # Running as root initially
          export DEBIAN_FRONTEND=noninteractive
          
          # Install necessary packages if needed
          if command -v apt-get &>/dev/null; then
            apt-get update -qq >/dev/null 2>&1 || echo "Warning: apt-get update failed" >&2
            # Only install coreutils if timeout command is missing
            if ! command -v timeout &>/dev/null; then
              apt-get install -y --no-install-recommends coreutils >/dev/null 2>&1 || echo "Warning: coreutils installation failed" >&2
            fi
          fi
          
          # Create non-root user (without sudo privileges)
          if ! id activepieces &>/dev/null; then
            groupadd -g 1001 activepieces 2>/dev/null || true
            useradd -u 1001 -g 1001 -m -s /bin/bash activepieces 2>/dev/null || {
              # If UID 1001 is taken, find next available UID
              for uid in {1002..1010}; do
                if useradd -u $uid -g activepieces -m -s /bin/bash activepieces 2>/dev/null; then
                  break
                fi
              done
            }
          fi
          
          # Create workspace directory with proper permissions
          mkdir -p /workspace
          chown activepieces:activepieces /workspace
          
          # Decode the user script
          echo '${encodedScript}' | base64 -d > /tmp/user_script.sh
          chmod +x /tmp/user_script.sh
          chown activepieces:activepieces /tmp/user_script.sh
          
          # Execute the script (mount operations will be handled inside)
          bash /tmp/user_script.sh
        `],
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