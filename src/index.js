const core = require('@actions/core');
const github = require('@actions/github');
const { Anthropic } = require('@anthropic-ai/sdk');

async function run() {
  try {
    // Get inputs
    const githubToken = core.getInput('github-token', { required: true });
    const claudeApiKey = core.getInput('claude-api-key', { required: true });
    const anthropicVersion = core.getInput('anthropic-version');

    // Initialize GitHub and Claude clients
    const octokit = github.getOctokit(githubToken);
    const anthropic = new Anthropic({
      apiKey: claudeApiKey,
      apiVersion: anthropicVersion,
    });
    
    const context = github.context;
    
    // Only run on pull requests
    if (context.eventName !== 'pull_request') {
      core.info('This action only works on pull requests.');
      return;
    }
    
    // Get PR information
    const prNumber = context.payload.pull_request.number;
    const repo = context.repo;
    
    // Fetch PR files
    const { data: files } = await octokit.rest.pulls.listFiles({
      ...repo,
      pull_number: prNumber,
    });
    
    // Filter relevant files (excluding binary files, etc.)
    const relevantFiles = files.filter(file => 
      !file.filename.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp3|mp4|mov|zip|tar|gz)$/i) &&
      file.status !== 'removed'
    );
    
    if (relevantFiles.length === 0) {
      core.info('No relevant files to review.');
      return;
    }
    
    // Prepare data for Claude
    const fileContents = await Promise.all(
      relevantFiles.map(async (file) => {
        try {
          // Get file content
          const { data: fileData } = await octokit.rest.repos.getContent({
            ...repo,
            path: file.filename,
            ref: context.payload.pull_request.head.sha,
          });
          
          // Decode content if it's base64 encoded
          const content = Buffer.from(fileData.content, 'base64').toString();
          
          return {
            filename: file.filename,
            status: file.status,
            content,
            patch: file.patch || '',
          };
        } catch (error) {
          core.warning(`Failed to get content for ${file.filename}: ${error.message}`);
          return null;
        }
      })
    );

    // Filter out files we couldn't get content for
    const validFileContents = fileContents.filter(f => f !== null);
    
    // Prepare the prompt for Claude
    const prompt = `
    You are conducting a code review of changes in a pull request. Please analyze the following files and provide feedback on:
    
    1. Code quality and best practices
    2. Potential bugs or issues
    3. Security concerns
    4. Performance considerations
    5. Suggestions for improvements
    
    For each file, focus on the changed portions (indicated in the "patch").
    
    Here are the files to review:
    
    ${validFileContents.map(file => `
    ---
    Filename: ${file.filename}
    Status: ${file.status}
    
    Patch:
    ${file.patch || '(No patch data available)'}
    
    Full Content:
    \`\`\`
    ${file.content}
    \`\`\`
    `).join('\n')}
    `;
    
    // Send to Claude for analysis
    const response = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 4000,
      system: "You are an expert code reviewer analyzing pull request changes. Be concise but thorough. Focus on substantive issues in the changed code rather than style nitpicks. Include specific code references with line numbers when possible. Format your response using GitHub-flavored markdown.",
      messages: [
        { role: "user", content: prompt }
      ],
    });
    
    // Post the review as a comment on the PR
    await octokit.rest.issues.createComment({
      ...repo,
      issue_number: prNumber,
      body: `## Claude Code Review

${response.content[0].text}

---
*This review was generated automatically by [Claude Code Reviewer](https://github.com/marketplace/actions/claude-code-reviewer)*
      `
    });
    
    core.info('Code review completed and posted as a comment.');
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();