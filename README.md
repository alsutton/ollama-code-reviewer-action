# Ollama Code Reviewer

A GitHub Action that uses an [ollama](https://ollama.com) install to review pull request changes and post feedback as a comment.

This is based on the [Claude action by Eric Hellman](https://github.com/ErikHellman/claude-code-reviewer).

## Features

- Analyzes code changes in pull requests
- Provides feedback on code quality, potential bugs, security issues, and performance
- Posts the review as a comment on the PR
- Ignores binary files and deleted files

## Setup

### Prerequisites

Access to an ollama installation which is serving requests via HTTP (i.e. running `ollama serve`),
which already has the models you wish to use (i.e. `ollama pull {model_name}` has already been executed).

You may wish to set up a [self-hosted runner](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners),
either on the same machine as ollama, or on the same LAN, to maximise performance.

### Usage

Add the following to your GitHub workflow file (e.g., `.github/workflows/code-review.yml`):

```yaml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Ollama Code Review
        uses: alsutton/ollama-code-reviewer-action
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          url: ${{ secrets.OLLAMA_URL }}
          model: ${{ secrets.OLLAMA_MODEL }}
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access | Yes | N/A |
| `url` | URL to access the ollama install | Yes | N/A |
| `model` | The AI model to use for the review | Yes | N/A |

## Development

1. Clone the repository
2. Install dependencies with `npm install`
3. Build the action with `npm run build`
4. Test with `npm test`

## License

MIT