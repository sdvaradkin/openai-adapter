// Simple cross-platform script to wait for Docker container and test health
const { execSync } = require('child_process');

const IMAGE = process.env.DOCKER_IMAGE || 'openai-adapter:test';
const CONTAINER = 'test-container';

console.log('Starting Docker container...');
try {
  execSync(`docker run -d -p 3000:3000 --rm --name ${CONTAINER} ${IMAGE}`, { stdio: 'inherit' });
} catch (err) {
  console.error('Failed to start container');
  process.exit(1);
}

console.log('Waiting 5 seconds for container to be ready...');
setTimeout(() => {
  try {
    console.log('Testing health endpoint...');
    execSync('curl -f http://localhost:3000/health', { stdio: 'inherit' });
    console.log('\n✅ Health check passed');
    
    console.log('Stopping container...');
    execSync(`docker stop ${CONTAINER}`, { stdio: 'inherit' });
    process.exit(0);
  } catch (err) {
    console.error('❌ Health check failed');
    execSync(`docker stop ${CONTAINER} 2>/dev/null || true`, { stdio: 'inherit' });
    process.exit(1);
  }
}, 5000);
