import ollama from 'ollama'

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

	// Ensure we have the model available on the machine we're running on
	await ollama.pull({
		model: ollamaModel,
		insecure: false,	// Don't pull from insecure sources
	})

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
    const messages = [{
        role: 'system',
        content: `
            You are an expert code reviewer analyzing pull request changes. Be concise but
            thorough. Focus on substantive issues in the changed code rather than style
            nitpicks. Include specific code references with line numbers when possible.
            Format your response using GitHub-flavored markdown.

            You will be given a collection of files and then asked for your feedback.
            Please analyze the following files and provide feedback on:

            1. Potential bugs or issues
            2. Security concerns
            3. Performance considerations
            4. Suggestions for improvements

            For each file, focus on the changed portions (indicated in the "patch").
        `}]

    validFileContents.forEach(file => {
        messages.push({
            role: 'user',
            content: `
                Filename: ${file.filename}
                Status: ${file.status}

                Patch:
                ${file.patch || '(No patch data available)'}

                Full Content:
                \`\`\`
                ${file.content}
                \`\`\`
            `});
    });

    messages.push({
        role: 'user',
        content: `What is your feedback?`
    });

    console.log(`Sending code review request to ${ollamaUrl}`);

    const response = await ollama.chat({
      model: ollamaModel,
      messages: messages,
      stream: true
    });

    const reviewParts = [];
    for await (const part of response) {
      reviewParts.push(part.message.content);
    }

    const review = reviewParts.join("");
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
