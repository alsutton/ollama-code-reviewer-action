# Claude Code Reviewer

A GitHub Action that uses Claude AI to review pull request changes and post feedback as a comment.

## Features

- Analyzes code changes in pull requests
- Provides feedback on code quality, potential bugs, security issues, and performance
- Posts the review as a comment on the PR
- Ignores binary files and deleted files

## Setup

### Prerequisites

- Claude API key from Anthropic

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
      - name: Claude Code Review
        uses: your-username/claude-code-reviewer@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access | Yes | N/A |
| `claude-api-key` | Claude API key | Yes | N/A |
| `anthropic-version` | Anthropic API version | No | `2023-06-01` |

## Development

1. Clone the repository
2. Install dependencies with `npm install`
3. Build the action with `npm run build`
4. Test with `npm test`

## License

MIT