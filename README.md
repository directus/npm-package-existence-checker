# npm Package Existence Checker

GitHub Action to check if all public npm packages in a pnpm workspace exist on npm before publishing.

Useful for [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) workflows where packages must already
exist on npm before the first publish.

## Usage

```yaml
- name: Check if packages exist on npm
  uses: directus/npm-package-existence-checker@v1
  with:
    # Optional: Root directory to check (defaults to current directory)
    directory: '.'
```

### Inputs

| Input       | Description              | Default |
| ----------- | ------------------------ | ------- |
| `directory` | Root directory to check. | `.`     |

### Outputs

| Output              | Description                                        |
| ------------------- | -------------------------------------------------- |
| `existing-packages` | Comma-separated list of packages that exist on npm |
| `missing-packages`  | Comma-separated list of packages missing on npm    |
| `private-packages`  | Comma-separated list of private packages skipped   |

## How it works

1. Checks the root `package.json` (if public)
2. Looks for `pnpm-workspace.yaml`
3. Identify all workspace packages
4. Checks if each non-private package exists on npm
5. Fails if any packages are missing

## Example

```yaml
name: Release

on:
  release:
    types: [published]

jobs:
  check-packages:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check packages exist
        uses: directus/npm-package-existence-checker@v1

  publish:
    needs: check-packages
    runs-on: ubuntu-latest
    steps:
      # ... your publish steps
```

## Development

### Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a `.env` file (required for local testing):

   ```bash
   cp .env.example .env
   ```

### Running Tests

Run unit tests:

```bash
pnpm test
```

### Testing locally

Test the action locally using the `dev` script.

Test against the current repository:

```bash
pnpm dev
```

Test against a different project directory:

```bash
INPUT_DIRECTORY=../path/to/other/project pnpm dev
```

### Building

Build for distribution:

```bash
pnpm build
```
