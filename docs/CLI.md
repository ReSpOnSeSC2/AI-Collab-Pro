# Omnicode CLI Reference

`omnicode` is a powerful command-line interface for the AI Collaboration Hub, allowing developers to access AI collaboration capabilities directly from their terminal.

## Installation

### Using npm

```bash
npm install -g @ai-collab/omnicode
```

### Using yarn

```bash
yarn global add @ai-collab/omnicode
```

### System Requirements

- Node.js v18.0.0 or higher
- npm v7.0.0 or higher
- Internet connection for API access

## Authentication

Before using `omnicode`, you need to authenticate with your AI Collaboration Hub account:

```bash
omnicode auth login
```

This will prompt you for your credentials or open a browser window for authentication.

To check your authentication status:

```bash
omnicode auth status
```

To logout:

```bash
omnicode auth logout
```

## Quick Reference

| Command | Description | Common Flags | Example |
|---------|-------------|--------------|---------|
| `explain` | Analyze and explain code | `--file`, `--language`, `--verbose` | `omnicode explain --file src/app.js` |
| `fix` | Find and fix code issues | `--file`, `--issue`, `--apply` | `omnicode fix --file src/app.js --apply` |
| `run` | Execute code with AI assistance | `--file`, `--interactive`, `--sandbox` | `omnicode run --file scripts/process.js` |
| `collab` | Collaborate with multiple AI models | `--mode`, `--models`, `--prompt` | `omnicode collab --mode round_table --prompt "Optimize this algorithm"` |
| `budget` | Manage API usage and costs | `--set`, `--view`, `--reset` | `omnicode budget --view` |
| `convert` | Convert code between languages | `--from`, `--to`, `--file` | `omnicode convert --from python --to javascript --file script.py` |
| `test` | Generate or run tests | `--file`, `--framework`, `--coverage` | `omnicode test --file src/utils.js --framework jest` |
| `doc` | Generate documentation | `--file`, `--format`, `--output` | `omnicode doc --file src/api.js --format markdown` |

## Common Commands

### explain

Analyzes and explains code, providing insights into its functionality, structure, and potential issues.

```bash
omnicode explain --file path/to/file.js
```

**Options:**
- `--file, -f`: Path to the file to explain (required)
- `--language, -l`: Explicitly specify the language (auto-detected by default)
- `--verbose, -v`: Include detailed explanations with examples
- `--output, -o`: Save the explanation to a file

**Examples:**

Basic explanation:
```bash
omnicode explain --file src/utils/formatter.js
```

Verbose explanation with saved output:
```bash
omnicode explain --file src/complex-algorithm.js --verbose --output docs/algorithm-explained.md
```

### fix

Identifies and fixes issues in your code, from syntax errors to logical problems.

```bash
omnicode fix --file path/to/file.js [--apply]
```

**Options:**
- `--file, -f`: Path to the file to fix (required)
- `--issue, -i`: Specific issue to focus on (optional)
- `--apply, -a`: Automatically apply suggested fixes
- `--dry-run, -d`: Show what would be fixed without making changes

**Examples:**

Review suggested fixes without applying:
```bash
omnicode fix --file src/components/button.jsx
```

Automatically apply all suggested fixes:
```bash
omnicode fix --file src/api/endpoints.js --apply
```

Fix a specific issue:
```bash
omnicode fix --file src/utils/parser.js --issue "memory leak" --apply
```

### run

Executes code with AI assistance, providing real-time feedback and suggestions.

```bash
omnicode run --file path/to/script.js
```

**Options:**
- `--file, -f`: Path to the file to run (required)
- `--interactive, -i`: Enable interactive mode with step-by-step execution
- `--sandbox, -s`: Run in a sandboxed environment for safety
- `--args, -a`: Arguments to pass to the script

**Examples:**

Run a script with arguments:
```bash
omnicode run --file scripts/data-processor.js --args "--input=data.csv --output=results.json"
```

Interactive debugging session:
```bash
omnicode run --file src/complex-algorithm.js --interactive
```

### collab

Collaborate with multiple AI models on code-related tasks.

```bash
omnicode collab --prompt "Your task description"
```

**Options:**
- `--prompt, -p`: The task or question to collaborate on (required)
- `--mode, -m`: Collaboration mode (default: "round_table")
- `--models, -M`: Specific models to include (comma-separated)
- `--file, -f`: Reference file for context
- `--style, -s`: Collaboration style (balanced, contrasting, harmonious)

**Examples:**

Basic collaboration:
```bash
omnicode collab --prompt "Optimize this sorting algorithm for large datasets"
```

Specific collaboration mode with selected models:
```bash
omnicode collab --prompt "Refactor this React component to use hooks" --mode sequential_critique_chain --models claude,gemini,chatgpt --file src/components/LegacyComponent.jsx
```

Creative problem-solving:
```bash
omnicode collab --prompt "Design a scalable architecture for a real-time chat system" --mode creative_brainstorm_swarm
```

### budget

Manage API usage and costs for the Omnicode CLI.

```bash
omnicode budget --view
```

**Options:**
- `--view, -v`: View current budget and usage
- `--set, -s`: Set budget limits (e.g., "10.00" for $10)
- `--reset, -r`: Reset usage counters
- `--period, -p`: Set budget period (daily, weekly, monthly)

**Examples:**

View current usage and limits:
```bash
omnicode budget --view
```

Set a monthly budget cap:
```bash
omnicode budget --set 25.00 --period monthly
```

Reset usage counters:
```bash
omnicode budget --reset
```

## Advanced Commands

### convert

Convert code from one language to another.

```bash
omnicode convert --from python --to javascript --file script.py
```

**Options:**
- `--from, -f`: Source language (required)
- `--to, -t`: Target language (required)
- `--file, -F`: Source file (required)
- `--output, -o`: Output file path
- `--preserve-comments, -c`: Maintain comments and documentation

### test

Generate or run tests for your code.

```bash
omnicode test --file src/utils.js
```

**Options:**
- `--file, -f`: File to test (required)
- `--framework, -F`: Testing framework (jest, mocha, etc.)
- `--coverage, -c`: Enable coverage reporting
- `--generate, -g`: Generate tests instead of running existing ones

### doc

Generate documentation for your code.

```bash
omnicode doc --file src/api.js
```

**Options:**
- `--file, -f`: File to document (required)
- `--format, -F`: Output format (markdown, html, jsdoc)
- `--output, -o`: Output file or directory
- `--template, -t`: Documentation template to use

## Common Flags

These flags work with most commands:

- `--help, -h`: Display help information
- `--quiet, -q`: Suppress non-essential output
- `--json, -j`: Output results in JSON format
- `--verbose, -v`: Provide detailed output
- `--config, -c`: Specify a custom configuration file

## Environment Variables

Configure the CLI behavior using these environment variables:

- `OMNICODE_API_URL`: Custom API endpoint URL
- `OMNICODE_CONFIG_PATH`: Custom configuration file path
- `OMNICODE_LOG_LEVEL`: Set logging level (debug, info, warn, error)
- `OMNICODE_DEFAULT_MODEL`: Default model to use when not specified
- `OMNICODE_MAX_TOKENS`: Default maximum token limit

## Code Examples

### Analyzing Complex Code

```javascript
// ES5 compatible example
var complexFunction = function(data) {
  var result = [];
  
  for (var i = 0; i < data.length; i++) {
    if (typeof data[i] === 'object' && data[i] !== null) {
      var keys = Object.keys(data[i]);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        if (data[i][key] > 100) {
          result.push({
            id: key,
            value: data[i][key]
          });
        }
      }
    }
  }
  
  return result.sort(function(a, b) {
    return b.value - a.value;
  });
};
```

Command:
```bash
omnicode explain --file complex-function.js --verbose
```

### Fixing Buggy Code

```javascript
// ES5 compatible example with bugs
function calculateTotals(items) {
  var total = 0;
  var taxRate = 0.08;
  
  for (var i = 0; i < items.length; i++) {
    var price = items[i].price;
    var quantity = items[i].quantity;
    total += price * quantity;
  }
  
  var tax = total * taxrate;  // Bug: variable name mismatch
  var grandTotal = total + tax;
  
  return {
    subtotal: total,
    tax: tax,
    total: grandTotal,
  }  // Bug: missing semicolon
}
```

Command:
```bash
omnicode fix --file calculate-totals.js --apply
```

### Collaborative Problem Solving

Problem description in a file:
```
I need an efficient algorithm to find all pairs of numbers in an array that sum to a specific target value.
The solution should handle large arrays (up to 10,000 elements) and have better time complexity than O(n²).
```

Command:
```bash
omnicode collab --prompt "$(cat problem.txt)" --mode validated_consensus --models claude,deepseek,chatgpt
```

## Configuration

Create a `.omnicoderc` file in your home directory or project root:

```json
{
  "defaultModels": ["claude", "gemini", "chatgpt"],
  "defaultCollaborationMode": "round_table",
  "theme": "dark",
  "maxTokensPerRequest": 4000,
  "budget": {
    "limit": 50.00,
    "period": "monthly",
    "alerts": [50, 75, 90]
  },
  "outputFormat": "markdown"
}
```

## Troubleshooting

### Authentication Issues

**Problem**: `Error: Authentication failed`
**Solution**: 
1. Check your internet connection
2. Re-login using `omnicode auth login --force`
3. Verify your account status in the web interface

### Rate Limiting

**Problem**: `Error: Rate limit exceeded`
**Solution**:
1. Wait and try again later
2. Reduce the frequency of requests
3. Upgrade your subscription plan
4. Use `--budget` to monitor your usage

### Command Not Found

**Problem**: `command not found: omnicode`
**Solution**:
1. Ensure global npm packages are in your PATH
2. Try reinstalling: `npm install -g @ai-collab/omnicode`
3. On Windows, run PowerShell as administrator

### Model Availability

**Problem**: `Error: Model X is currently unavailable`
**Solution**:
1. Try a different model using `--models`
2. Check the service status page
3. Retry with `--retry-count 3` for automatic retries

### Timeout Issues

**Problem**: `Error: Request timed out`
**Solution**:
1. For complex tasks, use `--timeout 120` to extend the timeout (in seconds)
2. Break down complex prompts into smaller tasks
3. Check your network connection stability

## Best Practices

1. **Start Simple**: Begin with the `explain` command to understand complex code before attempting fixes.

2. **Version Control**: Always commit your code before applying automated fixes.

3. **Use Sandboxing**: Run untrusted or experimental code with `--sandbox` flag.

4. **Budget Management**: Set reasonable budget limits to avoid unexpected costs.

5. **Workflow Integration**: Create aliases or scripts for common workflows:
   ```bash
   # Example bash alias
   alias ofix='omnicode fix --apply'
   alias otest='omnicode test --framework jest --coverage'
   ```

6. **Combine Commands**: Pipe output between commands for complex workflows:
   ```bash
   omnicode explain --file complex.js --json | jq '.issues' | omnicode fix --apply
   ```

7. **Continuous Integration**: Integrate `omnicode test` and `omnicode fix` into your CI pipeline.

## Additional Resources

- [Full API Documentation](https://docs.ai-collab-hub.com/api)
- [Video Tutorials](https://docs.ai-collab-hub.com/tutorials)
- [Community Forum](https://community.ai-collab-hub.com)
- [GitHub Repository](https://github.com/ai-collab/omnicode-cli)