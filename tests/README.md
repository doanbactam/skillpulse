# SkillPulse Test Suite

Documentation for running, writing, and extending the SkillPulse test suite.

## Table of Contents

- [Overview](#overview)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Test Utilities](#test-utilities)
- [Coverage](#coverage)
- [CI/CD](#cicd)

## Overview

SkillPulse has a comprehensive test suite covering:

- **Unit Tests** - Tests for individual modules and functions
- **Integration Tests** - Tests for module interactions
- **E2E Tests** - Tests for the full CLI workflow
- **Edge Case Tests** - Tests for boundary conditions and unusual inputs
- **Performance Benchmarks** - Tests for performance characteristics

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Types

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Everything
npm run test:all
```

### Run with Coverage

```bash
npm run coverage
```

### Run a Specific Test File

```bash
node --test tests/unit/storage.test.js
```

### Run Tests in Watch Mode (for development)

```bash
# Install nodemon first
npm install -g nodemon

# Run tests in watch mode
nodemon --exec "npm test"
```

## Test Structure

```
tests/
├── unit/
│   ├── storage.test.js       # Storage layer tests
│   ├── periods.test.js       # Period variant tests
│   ├── handlers.test.js      # MCP tool handler tests
│   └── edge-cases.test.js    # Edge case and boundary tests
├── integration/
│   └── server.test.js        # MCP server integration tests
├── benchmarks/
│   └── performance.test.js   # Performance benchmarks
├── e2e/
│   └── pulse-cli.test.sh     # CLI E2E tests (bash)
├── util/
│   └── test-helpers.js       # Reusable test utilities
└── README.md                 # This file
```

## Writing Tests

### Unit Test Example

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as Storage from '../../src/storage.js';

describe('Storage Module', () => {
  beforeEach(() => {
    // Setup test environment
  });

  afterEach(() => {
    // Cleanup
  });

  it('should append entry to analytics file', () => {
    Storage.appendEntry({ skill: 'test', ts: 123456, outcome: 'success' });

    const content = fs.readFileSync(analyticsFile, 'utf-8');
    assert.ok(content.includes('test'));
  });
});
```

### Using Test Utilities

```javascript
import { TestEnvironment, Fixtures, Assert, Time } from '../util/test-helpers.js';

describe('My Test Suite', () => {
  let env;

  beforeEach(() => {
    env = new TestEnvironment('my-test');
    env.setup();
  });

  afterEach(() => {
    env.cleanup();
  });

  it('should work with test utilities', () => {
    // Create mock skills
    env.createSkill('test-skill', {
      description: 'A test skill',
      version: '1.0.0',
    });

    // Add analytics entries
    env.addTimeSeries('test-skill', 10);

    // Use custom assertions
    Assert.fileExists(env.analyticsFile);
  });
});
```

## Test Utilities

### TestEnvironment Class

Creates an isolated test environment with mock directories and files.

```javascript
import { TestEnvironment } from '../util/test-helpers.js';

const env = new TestEnvironment('my-test-name');
env.setup();

// Create mock skill
env.createSkill('my-skill', {
  version: '2.0.0',
  description: 'My skill',
  skillMdContent: '---\ndescription:\nCustom description\n---\n',
});

// Add analytics
env.addEntries([
  { skill: 'my-skill', ts: Time.now(), outcome: 'success' },
]);

env.cleanup();
```

### Fixtures

Pre-defined test data fixtures.

```javascript
import { Fixtures } from '../util/test-helpers.js';

// Single entry
const entry = Fixtures.entry({ skill: 'custom' });

// Multiple entries
const entries = Fixtures.entriesFor('skill-name', 10, 'success');

// Time series entries
const series = Fixtures.timeSeries();
```

### Assert

Custom assertion helpers.

```javascript
import { Assert } from '../util/test-helpers.js';

// File existence
Assert.fileExists('/path/to/file');
Assert.fileNotExists('/path/to/file');

// JSON validation
Assert.validJson('/path/to/file.json');
Assert.validJsonl('/path/to/file.jsonl');

// Array equality (order-independent)
Assert.arrayEqual(['a', 'b'], ['b', 'a']);

// Range checks
Assert.inRange(value, 0, 100);
```

### Time

Time-related utilities.

```javascript
import { Time } from '../util/test-helpers.js';

const now = Time.now();
const hourAgo = Time.hoursAgo(1);
const dayAgo = Time.daysAgo(1);
```

## Coverage

Current coverage (as of latest run):

| File | Line % | Branch % | Funcs % |
|------|--------|----------|---------|
| handlers.js | 100.00 | 100.00 | 100.00 |
| periods.js | 100.00 | 100.00 | 100.00 |
| storage.js | 100.00 | 100.00 | 57.14 |
| **All** | **99.58** | **100.00** | **96.35** |

### Generating Coverage Report

```bash
npm run coverage
```

Coverage reports are generated in the `coverage/` directory.

## CI/CD

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### Test Matrix

CI runs tests on:
- **OS**: Ubuntu, Windows, macOS
- **Node**: 18.x, 20.x, 22.x

### Local CI Simulation

To run tests similar to CI:

```bash
# Run all tests
npm run test:all

# With coverage
npm run coverage
```

## Best Practices

### 1. Test Isolation

Each test should be independent and not rely on other tests.

```javascript
describe('My Feature', () => {
  beforeEach(() => {
    // Fresh state for each test
  });

  afterEach(() => {
    // Clean up after each test
  });
});
```

### 2. Descriptive Test Names

Test names should clearly describe what is being tested.

```javascript
// Good
it('should filter entries by cutoff timestamp', () => {});

// Bad
it('works', () => {});
```

### 3. Arrange-Act-Assert Pattern

```javascript
it('should calculate stats correctly', () => {
  // Arrange: Setup test data
  const entries = [
    { skill: 'a', ts: 1000, outcome: 'success' },
    { skill: 'a', ts: 2000, outcome: 'error' },
  ];

  // Act: Execute the code being tested
  const stats = Storage.aggregateStats(entries);

  // Assert: Verify the result
  assert.strictEqual(stats.a.calls, 2);
  assert.strictEqual(stats.a.success, 1);
  assert.strictEqual(stats.a.error, 1);
});
```

### 4. Test Edge Cases

Don't forget to test:
- Empty inputs
- Null/undefined values
- Boundary conditions
- Malformed data
- Large datasets

### 5. Use Test Utilities

Reuse existing utilities instead of duplicating setup code.

```javascript
// Good
import { TestEnvironment } from '../util/test-helpers.js';

// Bad
const TEST_DIR = path.join(os.tmpdir(), 'test');
// ... duplicate setup code
```

## Debugging Tests

### Run Single Test Suite

```bash
node --test tests/unit/storage.test.js
```

### Add Debug Output

```javascript
it('debug example', () => {
  console.log('Debug info:', someVariable);
  // ... test code
});
```

### Use Node.js Debugger

```bash
node --inspect-brk --test tests/unit/storage.test.js
```

Then open Chrome DevTools or use your IDE's debugger.

## Performance Benchmarks

Performance tests ensure the code remains efficient under load.

To run performance tests:

```bash
node --test tests/benchmarks/performance.test.js
```

Performance thresholds are defined in the test file. Adjust them based on your environment.

## Troubleshooting

### Tests Failing on Windows

Windows has different path handling and spawn overhead. Tests account for this with adjusted thresholds.

### E2E Tests Failing

E2E tests use bash. Ensure you have a bash-compatible shell:
- Windows: Git Bash
- macOS: Default bash
- Linux: Default bash

### Port Conflicts

None currently - tests don't bind to network ports.

## Contributing Tests

When adding new features:

1. **Write tests first** (TDD approach recommended)
2. **Cover edge cases**
3. **Update this README** if adding new test patterns
4. **Ensure coverage stays above 95%**

## Resources

- [Node.js Test Runner Documentation](https://nodejs.org/api/test.html)
- [Assertion Library](https://nodejs.org/api/assert.html)
- [Project README](../../README.md)
