# Bluetext Setup Assistant

A VSCode/VSCodium extension that provides a step-by-step wizard to set up Bluetext with Polytope for MCP server integration with coding agents like Cline and Claude Code.

## Features

### Quick Start & Setup Wizard

Get up and running in under 5 minutes with the interactive setup wizard:

**Complete Setup Wizard** - Guides you through all configuration steps:
- Initialize Git repository (optional but recommended)
- Create polytope.yml configuration
- Configure Cline or Claude Code MCP settings
- Start the MCP server

**Individual Commands** - Run specific setup steps as needed:

The extension provides individual commands for each setup step:

- **Bluetext: Complete Setup Wizard** - Interactive guided setup
- **Bluetext: Create polytope.yml** - Generate the Polytope configuration file
- **Bluetext: Configure Cline MCP** - Automatically configure Cline MCP settings
- **Bluetext: Configure Claude Code MCP** - Execute Claude Code MCP configuration command
- **Bluetext: Initialize Git Repository** - Initialize git in your project
- **Bluetext: Start MCP Server** - Start the Polytope MCP server

## Requirements

Before using this extension, ensure you have:

1. **Polytope installed** - Follow the installation guide for your platform:
   - [macOS](https://polytope.dev/docs/install/macos)
   - [Windows](https://polytope.dev/docs/install/windows)
   - [Linux](https://polytope.dev/docs/install/linux)

2. **A coding agent** (one or both):
   - Cline extension for VSCode/VSCodium
   - Claude Code CLI tool

## Usage

### Quick Start

1. Open your project folder in VSCode/VSCodium
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
3. Type "Bluetext: Complete Setup Wizard"
4. Follow the interactive wizard steps

### Manual Setup

You can also run individual commands:

1. **Initialize Git** (recommended):
   ```
   Command: Bluetext: Initialize Git Repository
   ```

2. **Create polytope.yml**:
   ```
   Command: Bluetext: Create polytope.yml
   ```
   This creates a file with:
   ```yaml
   include:
     - repo: gh:bluetext-io/bluetext
   ```

3. **Configure Your Agent**:
   
   For Cline:
   ```
   Command: Bluetext: Configure Cline MCP
   ```
   
   For Claude Code:
   ```
   Command: Bluetext: Configure Claude Code MCP
   ```

4. **Start MCP Server**:
   ```
   Command: Bluetext: Start MCP Server
   ```
   This runs: `pt run --mcp`

## Configuration

The extension provides the following configuration options (accessible via Settings):

- **bluetext.mcpPort** (default: 31338) - Port for the MCP server
- **bluetext.autoStartMCP** (default: false) - Automatically start MCP server after setup
- **bluetext.preferredAgent** (default: "cline") - Preferred coding agent (cline, claude-code, or both)

## What Gets Created

### polytope.yml
The main configuration file that includes Bluetext tools:
```yaml
include:
  - repo: gh:bluetext-io/bluetext
```

### Cline MCP Settings
Located at:
- macOS: `~/Library/Application Support/VSCodium/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Windows: `%APPDATA%/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

Contains:
```json
{
  "mcpServers": {
    "polytope": {
      "type": "streamableHttp",
      "url": "http://localhost:31338/mcp",
      "alwaysAllow": [],
      "disabled": false
    }
  }
}
```

## Available Bluetext Tools

Once set up, your coding agent will have access to Bluetext tools including:

- **add-frontend** - Create a React + Shadcn frontend with hot reload
- **add-api** - Create a FastAPI backend with SQLModel and optional Postgres/Couchbase/Temporal
- **add-postgres** - Add a Postgres database service
- **add-couchbase** - Add a Couchbase service with config manager
- **add-temporal** - Add Temporal workflow engine with UI

## Troubleshooting

### polytope.yml not found
Ensure you've created the file using the extension command or manually create it in your project root.

### MCP server won't start
1. Verify Polytope is installed: `pt --version`
2. Check that polytope.yml exists in your project
3. Ensure port 31338 is not in use

### Cline not connecting
1. Verify Cline extension is installed
2. Check MCP settings file exists and is properly formatted
3. Restart VSCode/VSCodium

### Agent doesn't see tools
1. Ensure MCP server is running (`pt run --mcp`)
2. Check agent is properly configured
3. Try restarting the agent

## Links

- [Bluetext Repository](https://github.com/bluetext-io/bluetext)
- [Polytope Documentation](https://polytope.dev/docs)
- [Cline Extension](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)
- [Claude Code](https://claude.ai/code)

## License

MIT

## Contributing

Issues and pull requests are welcome at the [Bluetext repository](https://github.com/bluetext-io/bluetext).
