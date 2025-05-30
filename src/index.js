const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    // Get inputs
    const githubToken = core.getInput('github-token', { required: true });
    const ollamaUrl = core.getInput('url', { required: true });
    const ollamaModel = core.getInput('model', { required: true });

    // Initialize repository client
    const octokit = github.getOctokit(githubToken);
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
      const message = `No relevant files to review.`

      core.info(message);

      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
        body: message,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      return;
    }

    if (relevantFiles.length > 20) {
      const message = `There are too many changed files to meaningfully review them (${relevantFiles.length} > 20)`
      core.info(message);

      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
        body: message,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      return;

    }

    console.info(`Reviewing the following files; ${relevantFiles.map(file => `${file.filename}, ` )}`)

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

    const ollamaRequest = {
        model: ollamaModel,
        prompt: prompt,
        options: {"num_ctx": 16384},
        stream: false
    }
    const requestBody = JSON.stringify(ollamaRequest)

    console.log(`Code Review Request sent to ${ollamaUrl}`);

    // Send for analysis
    const headers = {
      "Content-Type": 'text/json'
    }

    const response = await fetch(
      ollamaUrl,
      {
        method: 'POST',
        body: requestBody,
        headers: headers
      });

    if (!response.ok) {
      core.setFailed(`Request to AI Server failed: ${response.statusText}`);
      return;
    }

    const aiResponse = await response.text()
    const review = JSON.parse(aiResponse).response
    console.log(`Code Review Response: ${review}`);

    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body: review,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    core.info('Code review completed and posted as a comment.');
  } catch (error) {
    console.error("Error encountered", error)
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();