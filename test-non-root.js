const { runBashCommandSandboxed } = require('./dist/actions/run-bash-command-sandboxed');

async function testNonRootExecution() {
  console.log('Testing non-root execution in sandboxed environment...\n');
  
  // Test 1: Check current user
  console.log('Test 1: Checking current user');
  const userTest = await runBashCommandSandboxed.run({
    propsValue: {
      command: `
#!/bin/bash
echo "Current user: $(whoami)"
echo "User ID: $(id -u)"
echo "Group ID: $(id -g)"
echo "User details:"
id
`,
      timeout: 30
    }
  });
  
  console.log('Output:', userTest.stdout);
  console.log('Success:', userTest.success);
  console.log('---\n');
  
  // Test 2: Test sudo access for privileged operations
  console.log('Test 2: Testing sudo access for package installation');
  const sudoTest = await runBashCommandSandboxed.run({
    propsValue: {
      command: `
#!/bin/bash
echo "Testing sudo access..."
sudo apt-get update -qq && echo "✓ sudo apt-get update works"
echo "Current user can use sudo for allowed commands"
`,
      timeout: 30
    }
  });
  
  console.log('Output:', sudoTest.stdout);
  console.log('Success:', sudoTest.success);
  console.log('---\n');
  
  // Test 3: Test file permissions
  console.log('Test 3: Testing file permissions in workspace');
  const permTest = await runBashCommandSandboxed.run({
    propsValue: {
      command: `
#!/bin/bash
echo "Creating test file..."
echo "Hello from non-root user" > test.txt
ls -la test.txt
echo "File owner: $(stat -c '%U:%G' test.txt)"
`,
      timeout: 30
    }
  });
  
  console.log('Output:', permTest.stdout);
  console.log('Success:', permTest.success);
}

testNonRootExecution().catch(console.error); 