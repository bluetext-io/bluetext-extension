# Quick Start Guide

Get up and running with Bluetext in under 5 minutes!

## Prerequisites

Before you begin, ensure you have:
- ✅ VSCode or VSCodium installed
- ✅ Polytope installed ([Installation Guide](https://polytope.dev/docs/install))
- ✅ Cline extension installed (optional but recommended)

## Step 1: Install the Extension

### From Source (Current Method)

```bash
# Clone the repository
git clone https://github.com/bluetext-io/bluetext.git
cd bluetext/extension

# Install dependencies
npm install

# Compile the extension
npm run compile

# Package the extension
npm install -g @vscode/vsce
vsce package

# Install the .vsix file in VSCode/VSCodium
# File -> Install Extension from VSIX -> Select the .vsix file
```

## Step 2: Run the Setup Wizard

1. Open your project folder in VSCode/VSCodium (or create a new empty folder)

2. Open the Command Palette:
   - **Windows/Linux**: `Ctrl + Shift + P`
   - **macOS**: `Cmd + Shift + P`

3. Type: `Bluetext: Complete Setup Wizard`

4. Click through the wizard steps:
   - **Step 1**: Initialize Git (optional but recommended)
   - **Step 2**: Create `polytope.yml` 
   - **Step 3**: Configure Cline or Claude Code
   - **Step 4**: Start the MCP server

## Step 3: Start Building

Now you're ready to use Bluetext tools with your coding agent!

### Example: Create a Full-Stack App

Open Cline and prompt:

```
Create a todo app with a React frontend and FastAPI backend using Bluetext tools
```

Cline will use the Bluetext MCP tools like:
- `add-frontend` - Creates React + Shadcn UI frontend
- `add-api` - Creates FastAPI backend
- `add-postgres` - Adds database if needed

### Manual Commands

You can also use Polytope commands directly:

```bash
# Add a frontend
pt call add-frontend frontend

# Add an API
pt call add-api api

# Add a database
pt call add-postgres
```

## Common Commands

| Command | Description |
|---------|-------------|
| `Bluetext: Complete Setup Wizard` | Run the full setup wizard |
| `Bluetext: Create polytope.yml` | Create config file only |
| `Bluetext: Configure Cline` | Configure Cline MCP settings |
| `Bluetext: Start MCP Server` | Start the MCP server |

## What's Running?

When you start the MCP server (`pt run --mcp`):
- 🌐 MCP server runs on `http://localhost:31338`
- 🔧 Bluetext tools are available to your coding agent
- 📦 Polytope manages Docker containers for your services

## Next Steps

1. **Read the docs**: Check out [Polytope Documentation](https://polytope.dev/docs)
2. **Explore templates**: Look at the available Bluetext tools in your project
3. **Build something**: Start prompting your coding agent!

## Troubleshooting

### MCP Server Won't Start
```bash
# Check if Polytope is installed
pt --version

# Check if port 31338 is available
lsof -i :31338  # macOS/Linux
netstat -ano | findstr :31338  # Windows
```

### Cline Can't See Tools
1. Ensure MCP server is running
2. Check Cline MCP settings are configured
3. Restart VSCode/VSCodium

### polytope.yml Issues
Make sure the file contains:
```yaml
include:
  - repo: gh:bluetext-io/bluetext
```

## Get Help

- 📖 [Full Documentation](README.md)
- 🔧 [Installation Guide](INSTALLATION.md)
- 🐛 [Report Issues](https://github.com/bluetext-io/bluetext/issues)
- 💬 [Polytope Docs](https://polytope.dev/docs)

## Success! 🎉

You're now ready to build amazing applications with Bluetext and Polytope!

Happy coding! 🚀
