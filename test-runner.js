/**
 * Unified test runner for both frontend and backend
 * Runs tests for the entire application
 */

const { spawn } = require('child_process');
const path = require('path');

class TestRunner {
  constructor() {
    this.results = {
      frontend: null,
      backend: null
    };
  }

  /**
   * Run command in specified directory
   */
  async runCommand(command, args, cwd, name) {
    return new Promise((resolve, reject) => {
      console.log(`\n🏃 Running ${name} tests...`);
      console.log(`📂 Working directory: ${cwd}`);
      console.log(`🔧 Command: ${command} ${args.join(' ')}\n`);

      const process = spawn(command, args, {
        cwd,
        stdio: 'inherit',
        shell: true
      });

      process.on('close', (code) => {
        if (code === 0) {
          console.log(`\n✅ ${name} tests passed!`);
          resolve({ success: true, code });
        } else {
          console.log(`\n❌ ${name} tests failed with code ${code}`);
          resolve({ success: false, code });
        }
      });

      process.on('error', (error) => {
        console.error(`\n💥 Error running ${name} tests:`, error.message);
        reject(error);
      });
    });
  }

  /**
   * Run frontend tests
   */
  async runFrontendTests(coverage = false) {
    const frontendDir = path.join(__dirname, 'frontend');
    const command = 'npm';
    const args = coverage ? ['run', 'test:coverage'] : ['test'];

    try {
      this.results.frontend = await this.runCommand(command, args, frontendDir, 'Frontend');
    } catch (error) {
      this.results.frontend = { success: false, error: error.message };
    }
  }

  /**
   * Run backend tests
   */
  async runBackendTests(coverage = false) {
    const backendDir = path.join(__dirname, 'backend');
    const command = 'npm';
    const args = coverage ? ['run', 'test:coverage'] : ['test'];

    try {
      this.results.backend = await this.runCommand(command, args, backendDir, 'Backend');
    } catch (error) {
      this.results.backend = { success: false, error: error.message };
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(options = {}) {
    const { coverage = false, frontend = true, backend = true } = options;

    console.log('🚀 Starting Pathfinder Loot Tracker Test Suite');
    console.log('================================================\n');

    const startTime = Date.now();

    // Run tests in parallel
    const promises = [];
    
    if (frontend) {
      promises.push(this.runFrontendTests(coverage));
    }
    
    if (backend) {
      promises.push(this.runBackendTests(coverage));
    }

    await Promise.all(promises);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    this.printSummary(duration);
    
    // Exit with error code if any tests failed
    const allPassed = Object.values(this.results).every(result => result?.success);
    process.exit(allPassed ? 0 : 1);
  }

  /**
   * Print test results summary
   */
  printSummary(duration) {
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(50));

    if (this.results.frontend) {
      const status = this.results.frontend.success ? '✅ PASSED' : '❌ FAILED';
      console.log(`Frontend Tests: ${status}`);
    }

    if (this.results.backend) {
      const status = this.results.backend.success ? '✅ PASSED' : '❌ FAILED';
      console.log(`Backend Tests:  ${status}`);
    }

    console.log(`\n⏱️  Total Duration: ${duration}s`);

    const allPassed = Object.values(this.results).every(result => result?.success);
    const overallStatus = allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED';
    
    console.log(`🎯 Overall Status: ${overallStatus}`);
    console.log('='.repeat(50) + '\n');
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    coverage: args.includes('--coverage') || args.includes('-c'),
    frontend: !args.includes('--backend-only'),
    backend: !args.includes('--frontend-only')
  };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Pathfinder Loot Tracker Test Runner

Usage: node test-runner.js [options]

Options:
  --coverage, -c        Run tests with coverage reporting
  --frontend-only       Run only frontend tests
  --backend-only        Run only backend tests
  --help, -h           Show this help message

Examples:
  node test-runner.js                    # Run all tests
  node test-runner.js --coverage         # Run all tests with coverage
  node test-runner.js --frontend-only    # Run only frontend tests
  node test-runner.js --backend-only -c  # Run only backend tests with coverage
`);
    process.exit(0);
  }

  const testRunner = new TestRunner();
  testRunner.runAllTests(options);
}

module.exports = TestRunner;