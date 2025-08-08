# Bash Command Runner for Activepieces

Execute bash commands and scripts with support for mounting NFS and SMB network drives in your Activepieces workflows.

## Features

- 🖥️ **Execute Bash Commands**: Run any bash command or script
- 📁 **Network Drive Support**: Mount NFS and SMB/CIFS drives before executing commands
- 🔒 **Two Execution Modes**:
  - Standard: Direct execution with mount privileges
  - Sandboxed: Docker-based execution with resource limits
- 🔑 **Authentication Support**: Username/password for SMB shares
- ⚡ **Flexible Configuration**: Custom mount options and working directories
- 📊 **Output Capture**: Separate stdout/stderr capture

## Installation

### NPM
```bash
npm install @badc0d3/piece-bash-runner
```

### In Activepieces
1. Copy the piece to your Activepieces pieces directory
2. Restart your Activepieces instance
3. The Bash Command Runner will be available in your flows

## Usage

### Basic Command Execution
```bash
#!/bin/bash
echo "Hello from Bash!"
ls -la
pwd
```

### Mount NFS Drive and Process Files
```bash
#!/bin/bash
# Files will be available at /mnt/network after mounting
find /mnt/network -name "*.txt" -exec wc -l {} +
```

Mount Configuration:
- Type: NFS
- Source: `server.local:/exports/data`
- Mount Point: `/mnt/network`
- Options: `rw,sync`

### Mount SMB Share with Authentication
```bash
#!/bin/bash
# Copy files from SMB share
cp -r /mnt/network/documents /tmp/backup/
```

Mount Configuration:
- Type: SMB/CIFS
- Source: `//server.local/share`
- Mount Point: `/mnt/network`
- Username: `myuser`
- Password: `[use secure text]`

## Actions

### Run Bash Command (Standard)
Executes bash commands directly on the host system.

**Properties:**
- **Bash Command**: The command or script to execute
- **Mount Configuration**: Optional NFS/SMB mount settings
- **Working Directory**: Directory to execute commands in
- **Timeout**: Maximum execution time
- **Capture Output**: Whether to capture stdout/stderr separately

**Requirements:**
- For NFS: `nfs-common` package installed
- For SMB: `cifs-utils` package installed
- Mount privileges (may require root or sudo)

### Run Bash Command (Sandboxed)
Executes bash commands in a Docker container with automatic installation of mount utilities.

**Properties:**
- **Bash Command**: The command or script to execute
- **Mount Configuration**: Optional NFS/SMB mount settings  
- **Docker Image**: Base image to use (default: ubuntu:latest)
- **Timeout**: Maximum execution time

**Security Features:**
- Privileged operations (mounting) run as root
- User commands run as non-root user (`activepieces` UID/GID 1001) without sudo access
- Proper privilege separation between system operations and user code
- Resource limits (512MB RAM, 50% CPU)
- Automatic cleanup after execution

**Required Permissions:**
- Docker socket access: `-v /var/run/docker.sock:/var/run/docker.sock`
- Container runs with `SYS_ADMIN` capability for mounting

## Mount Configuration

### NFS Options
Common NFS mount options:
- `rw`: Read-write access
- `ro`: Read-only access
- `sync`: Synchronous writes
- `async`: Asynchronous writes
- `nolock`: Disable file locking
- `vers=3` or `vers=4`: NFS version

### SMB/CIFS Options
Common SMB mount options:
- `rw`: Read-write access
- `ro`: Read-only access
- `vers=1.0`, `vers=2.0`, `vers=3.0`: SMB protocol version
- `domain=WORKGROUP`: Domain name
- `uid=1000`: User ID for file ownership
- `gid=1000`: Group ID for file ownership

## Security Considerations

### Standard Version
- Runs with the same privileges as Activepieces
- Mount operations may require elevated privileges
- Consider using restricted mount options

### Sandboxed Version
- Runs in Docker container with limited resources
- Mounting operations performed as root for security
- User commands execute as non-root user without sudo privileges
- Container has `SYS_ADMIN` capability for mounting
- Proper privilege separation ensures user code cannot perform system operations
- Isolated from host system

### Best Practices
1. Use read-only mounts when possible (`ro` option)
2. Store credentials securely using Activepieces secure text
3. Unmount drives after use (handled automatically)
4. Validate and sanitize file paths
5. Use specific mount options to limit access

## Examples

### Backup Files from NFS
```bash
#!/bin/bash
# Create backup directory
mkdir -p /tmp/backup/$(date +%Y%m%d)

# Copy files from NFS mount
rsync -av /mnt/network/important/ /tmp/backup/$(date +%Y%m%d)/

# Create archive
tar -czf /tmp/backup-$(date +%Y%m%d).tar.gz /tmp/backup/$(date +%Y%m%d)/

echo "Backup completed successfully"
```

### Process CSV Files from SMB Share
```bash
#!/bin/bash
# Find all CSV files
for file in /mnt/network/data/*.csv; do
  echo "Processing: $file"
  # Count lines
  lines=$(wc -l < "$file")
  echo "Lines: $lines"
  
  # Get first line (headers)
  head -1 "$file"
  echo "---"
done
```

### System Monitoring Script
```bash
#!/bin/bash
# No mount needed for system monitoring
echo "=== System Information ==="
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime)"
echo ""
echo "=== Disk Usage ==="
df -h
echo ""
echo "=== Memory Usage ==="
free -h
```

## Troubleshooting

### Mount Permission Denied
- Ensure the user has mount privileges
- For Docker, ensure `SYS_ADMIN` capability is granted
- Check AppArmor/SELinux policies

### NFS Mount Fails
- Verify NFS server is accessible: `showmount -e server`
- Check firewall rules (port 2049 for NFS)
- Try different NFS versions: `vers=3` or `vers=4`

### SMB Mount Fails
- Verify SMB share is accessible: `smbclient -L //server`
- Check credentials and escape special characters
- Try different SMB versions: `vers=1.0`, `vers=2.0`, `vers=3.0`

### Docker Socket Error
- Mount Docker socket: `-v /var/run/docker.sock:/var/run/docker.sock`
- Ensure Docker is running
- Check Docker permissions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT 