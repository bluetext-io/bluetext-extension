# Installation Guide

This guide covers how to install, build, and use the Bluetext Setup Assistant extension.

## For Users

### Option 1: Install from VSIX (Coming Soon)
Once published, you'll be able to install the extension directly from the Visual Studio Marketplace or OpenVSX Registry.

### Option 2: Install from Source

1. **Clone the repository**:
   ```bash
   git clone https://github.com/bluetext-io/bluetext.git
   cd bluetext/extension
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Compile the extension**:
   ```bash
   npm run compile
   ```

4. **Package the extension** (optional):
   ```bash
   npm install -g @vscode/vsce
   vsce package
   ```
   This creates a `.vsix` file that you can install.

5. **Install in VSCode/VSCodium**:
   - Open VSCode/VSCodium
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
   - Type "Install from VSIX"
   - Select the generated `.vsix` file

### Option 3: Development Mode

1. **Clone and install**:
   ```bash
   git clone https://github.com/bluetext-io/bluetext.git
   cd bluetext/extension
   npm install
   ```

2. **Open in VSCode/VSCodium**:
   ```bash
   code .
   ```

3. **Run the extension**:
   - Press `F5` to open a new Extension Development Host window
   - The extension will be loaded and ready to test

## For Developers

### Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- VSCode or VSCodium

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/bluetext-io/bluetext.git
   cd bluetext/extension
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start watching for changes**:
   ```bash
   npm run watch
   ```

4. **Debug the extension**:
   - Open the project in VSCode/VSCodium
   - Press `F5` to launch the Extension Development Host
   - Set breakpoints in the TypeScript files
   - The extension will reload automatically when you make changes (with watch mode)

### Available Scripts

- `npm run compile` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and recompile automatically
- `npm run lint` - Run ESLint on the source code
- `npm run pretest` - Compile and lint before running tests

### Project Structure

```
extension/
├── src/
│   └── extension.ts       # Main extension code
├── out/                   # Compiled JavaScript (generated)
├── node_modules/          # Dependencies (generated)
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript configuration
├── .eslintrc.json         # ESLint configuration
├── .vscodeignore          # Files to exclude from package
├── .gitignore            # Git ignore rules
├── README.md             # User documentation
├── CHANGELOG.md          # Version history
└── INSTALLATION.md       # This file
```

### Building for Production

1. **Compile the TypeScript**:
   ```bash
   npm run compile
   ```

2. **Run the linter**:
   ```bash
   npm run lint
   ```

3. **Package the extension**:
   ```bash
   vsce package
   ```

This creates a `.vsix` file in the extension directory.

### Publishing

To publish to the Visual Studio Marketplace:

1. **Create a publisher** (one-time setup):
   ```bash
   vsce create-publisher <publisher-name>
   ```

2. **Login to your publisher account**:
   ```bash
   vsce login <publisher-name>
   ```

3. **Publish the extension**:
   ```bash
   vsce publish
   ```

For OpenVSX Registry (used by VSCodium):

1. **Get an access token** from https://open-vsx.org

2. **Publish**:
   ```bash
   npx ovsx publish -p <token>
   ```

## Troubleshooting

### TypeScript Errors

If you see TypeScript errors after installing:
```bash
npm install
npm run compile
```

### Extension Not Loading

1. Check the Output panel in VSCode/VSCodium (View -> Output)
2. Select "Extension Host" from the dropdown
3. Look for any error messages

### Module Not Found Errors

Ensure all dependencies are installed:
```bash
rm -rf node_modules
npm install
```

### Compilation Errors

1. Check your Node.js version: `node --version` (should be v20+)
2. Clear the output: `rm -rf out`
3. Recompile: `npm run compile`

## Testing the Extension

### Manual Testing

1. Open a test project folder in the Extension Development Host
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
3. Run "Bluetext: Complete Setup Wizard"
4. Test each functionality:
   - Git initialization
   - polytope.yml creation
   - Cline configuration
   - MCP server startup
   - Flight check

### Automated Testing (Coming Soon)

We plan to add automated tests in future versions.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Commit your changes: `git commit -am 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Create a Pull Request

## Support

- GitHub Issues: https://github.com/bluetext-io/bluetext/issues
- Documentation: https://polytope.dev/docs
- Bluetext Repository: https://github.com/bluetext-io/bluetext

## License

MIT License - see LICENSE file for details
