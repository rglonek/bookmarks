# Testing Guide

This project uses **Vitest** for testing, a fast and modern testing framework designed for Vite projects.

## Test Structure

```
src/test/
├── setup.ts          # Global test setup (localStorage mock, jest-dom matchers)
├── storage.test.ts   # Tests for localStorage operations and entity creation
├── merge.test.ts     # Tests for the intelligent merge algorithm
└── api.test.ts       # Tests for authentication and server data APIs
```

## Running Tests

### Run All Tests (once)
```bash
npm test
```

This runs all tests once and exits. Perfect for CI/CD pipelines.

### Watch Mode (development)
```bash
npm run test:watch
```

Watches files and re-runs tests when you make changes. Great for development.

### UI Mode (interactive)
```bash
npm run test:ui
```

Opens an interactive browser-based UI to view and run tests. Provides detailed output and coverage.

### Coverage Report
```bash
npm run test:coverage
```

Generates a test coverage report showing which parts of your code are tested.

## Test Coverage

### Current Test Stats
- **Total Tests**: 33 passing
- **Test Files**: 3

### What's Tested

#### 1. Storage Module (`storage.test.ts`)
- ✅ Loading data from localStorage
- ✅ Saving data to localStorage  
- ✅ Handling invalid JSON gracefully
- ✅ Creating buckets with unique IDs
- ✅ Creating categories with unique IDs
- ✅ Creating bookmarks with timestamps
- ✅ Generating unique IDs for entities

#### 2. Merge Logic (`merge.test.ts`)
- ✅ Preserving local-only bookmarks
- ✅ Preserving server-only bookmarks
- ✅ Merging bookmarks from both sources
- ✅ Conflict resolution by timestamp (server newer)
- ✅ Conflict resolution by timestamp (local newer)
- ✅ Preserving server-only categories
- ✅ Preserving server-only buckets
- ✅ Using server names for buckets/categories

#### 3. API Functions (`api.test.ts`)

**Authentication:**
- ✅ User registration (success & errors)
- ✅ User login (success & errors)
- ✅ Logout
- ✅ Session validation

**Server Data:**
- ✅ Loading data from server
- ✅ Saving data to server
- ✅ Checking for updates (timestamp)
- ✅ Error handling

## Test Features

### Mocked Dependencies

#### LocalStorage
Tests use a custom localStorage mock that:
- Persists data between operations within a test
- Clears automatically between tests
- Implements full Storage interface

#### Fetch API
API tests mock the global `fetch` function to:
- Simulate successful API calls
- Simulate error responses
- Verify correct request parameters

### Test Utilities

Tests use **@testing-library/react** for component testing utilities and **@testing-library/jest-dom** for enhanced matchers.

## Writing New Tests

### Example: Testing a New Feature

```typescript
import { describe, it, expect } from 'vitest';

describe('MyNewFeature', () => {
  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe('expected value');
  });
});
```

### Best Practices

1. **Descriptive Names**: Use clear, descriptive test names
   ```typescript
   it('should merge bookmarks when same ID exists on both sides')
   ```

2. **Arrange-Act-Assert**: Structure tests clearly
   ```typescript
   // Arrange
   const input = createTestData();
   
   // Act
   const result = processData(input);
   
   // Assert
   expect(result).toEqual(expected);
   ```

3. **Test Edge Cases**: Don't just test the happy path
   ```typescript
   it('should handle empty data')
   it('should handle invalid JSON')
   it('should handle network errors')
   ```

4. **Isolated Tests**: Each test should be independent
   - Use `beforeEach` to reset state
   - Don't rely on test execution order
   - Clean up after tests

## CI/CD Integration

Add to your CI pipeline:

```yaml
# GitHub Actions example
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage
```

## Debugging Tests

### Run a Single Test File
```bash
npx vitest run src/test/storage.test.ts
```

### Run Tests Matching a Pattern
```bash
npx vitest run -t "merge"
```

### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test:watch"],
  "console": "integratedTerminal"
}
```

## Future Test Enhancements

### Potential Areas to Add Tests For

- [ ] Component rendering tests (App, BookmarkCard, Modal)
- [ ] Drag and drop functionality
- [ ] Chrome bookmark import parsing
- [ ] Search and filter functionality
- [ ] URL metadata extraction
- [ ] Auto-scroll during drag
- [ ] Window focus/blur sync behavior
- [ ] E2E tests with Playwright

### Integration Tests

Consider adding integration tests that:
- Test the full auth flow (register → login → save data → logout)
- Test multi-device sync scenario
- Test Chrome import end-to-end

### Performance Tests

Consider adding tests for:
- Large dataset handling (1000+ bookmarks)
- Merge performance with large datasets
- Search performance

## Troubleshooting

### Tests Fail Due to Timing Issues
If you see intermittent failures, consider using:
```typescript
import { waitFor } from '@testing-library/react';

await waitFor(() => {
  expect(element).toBeInTheDocument();
});
```

### Mock Not Working
Ensure mocks are set up in `setup.ts` and run before tests.

### Coverage Not Generated
Install coverage package:
```bash
npm install --save-dev @vitest/coverage-v8
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Docs](https://testing-library.com/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)

