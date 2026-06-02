# Contributing to PrimeFlow

Thank you for your interest in contributing to PrimeFlow! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something great together.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm, yarn, or pnpm

### Setup

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/prime-flow.git
   cd prime-flow
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Building

```bash
# Build all targets (ESM, CJS, types)
npm run build

# Type checking only
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Project Structure

```
prime-flow/
├── src/
│   ├── types/          # TypeScript type definitions
│   ├── routing/        # Routing logic (filter, scorer, strategy)
│   ├── layer403/       # Layer-403 client and signing
│   ├── cache/          # Caching implementation
│   ├── utils/          # Utility functions
│   ├── middleware/     # Express middleware
│   ├── client.ts       # Main PrimeFlow client
│   └── index.ts        # Public exports
├── tests/              # Test files
├── examples/           # Example code
└── dist/               # Build output (gitignored)
```

## Making Changes

### Code Style

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Keep functions small and focused

### Commit Messages

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, etc)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(routing): add custom scoring function support
fix(cache): handle expired entries correctly
docs(readme): add Express integration example
```

### Testing

- Write tests for new features
- Update tests when changing behavior
- Aim for >80% coverage
- Test edge cases and error paths

### Documentation

- Update README if adding features
- Add JSDoc comments for public APIs
- Include examples for new functionality

## Pull Request Process

1. Ensure all tests pass: `npm test`
2. Ensure code builds: `npm run build`
3. Ensure linting passes: `npm run lint`
4. Update documentation as needed
5. Create a pull request with:
   - Clear description of changes
   - Link to related issues
   - Screenshots/examples if applicable

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Changelog entry added (if applicable)
- [ ] Types are correct
- [ ] No breaking changes (or documented if necessary)

## Reporting Issues

### Bug Reports

Include:
- PrimeFlow version
- Node.js version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Error messages/stack traces

### Feature Requests

Include:
- Use case description
- Proposed API (if applicable)
- Alternatives considered

## Questions?

Feel free to open an issue for questions or discussions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
