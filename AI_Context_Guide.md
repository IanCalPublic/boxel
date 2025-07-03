# Adding Code Mode Selected Text to AI Context in Boxel

## Overview

The Boxel development environment provides several mechanisms to add code and selected text to AI context for enhanced AI assistance. This guide covers the different methods and workflows available.

## Methods to Add Code to AI Context

### 1. Auto-Attachment in Code Mode

When you switch to code mode and open files, they are automatically attached to the AI context:

- **Trigger**: Navigate to code mode and open/view files
- **Automatic**: Files with `.gts`, `.json`, and other text-based extensions are auto-attached
- **Scope**: Currently viewed file content is included in AI context

**How it works:**
```json
{
  "name": "switch-submode",
  "payload": {
    "submode": "code"
  }
}
```

### 2. Manual File Attachment

You can manually attach specific files to the AI context:

- **UI Control**: Use the attach file button (`[data-test-attach-file-btn]`)
- **Multiple Files**: Can attach multiple files simultaneously
- **File Types**: Supports text files, `.gts` card definitions, JSON files

### 3. Update Code Path with Selection

Use the `UpdateCodePathWithSelectionCommand` to add specific code selections:

**Command Structure:**
```typescript
{
  codeRef: string,      // Reference to the code location
  localName: string,    // Local identifier
  fieldName?: string    // Optional field name for context
}
```

**Usage:**
```json
{
  "name": "update-code-path-with-selection",
  "payload": {
    "submode": "code",
    "codePath": "https://[realm-url]/[file-path]",
    "codeRef": "[selection-reference]",
    "localName": "[identifier]"
  }
}
```

## Code Mode Features

### Auto-Attachment Behavior

When in code mode:
- Currently viewed file is automatically attached
- File content is sent with AI messages
- Real-time updates when switching between files
- Supports card definitions (`.gts`) and configuration files (`.json`)

### Context Data Structure

The AI context includes:
```json
{
  "attachedFiles": [
    {
      "sourceUrl": "file-url",
      "name": "filename.gts", 
      "contentType": "text/plain",
      "content": "file-content"
    }
  ],
  "context": {
    "submode": "code",
    "openCardIds": ["card-urls"],
    "realmUrl": "realm-url",
    "tools": [/* available tools */]
  }
}
```

## Best Practices

### 1. Switch to Code Mode First
Always switch to code mode before working with code:
```bash
# Command to switch to code mode
switch-submode --submode=code
```

### 2. Use SEARCH/REPLACE Blocks
For code modifications, use SEARCH/REPLACE blocks:
```
╔═══ SEARCH ════╗
[original code to find]
╚═══════════════╝

╔═══ REPLACE ═══╗
[new code to replace with]
╚═══════════════╝
```

### 3. File Path Context
When editing files, include the full file URL:
```
https://[realm-url]/[workspace]/[file-path].gts
```

## Supported File Types

- **Card Definitions**: `.gts` files
- **JSON Configurations**: `.json` files  
- **TypeScript**: `.ts` files
- **Text Files**: `.txt`, `.md` files
- **Unsupported**: Binary files (images, PDFs)

## Commands Reference

### Core Commands
- `switch-submode`: Switch between interact and code modes
- `update-code-path-with-selection`: Add selected code to context
- `read-text-file`: Read file content into context
- `write-text-file`: Create new files

### File Operations
- Auto-attachment on file view
- Manual attachment via UI controls
- Context preservation across mode switches

## Troubleshooting

### Common Issues
1. **File not auto-attached**: Ensure you're in code mode and file is a supported type
2. **Context not updated**: Check that file changes are saved
3. **Selection not captured**: Verify selection is properly highlighted before running commands

### Debug Mode
Use debug mode to inspect current context:
```bash
debug
```
This will show:
- Attached files
- Workspace information
- Current mode
- Available skills
- Decision factors

## Integration with AI Skills

The system includes several AI skills that work with code context:
- **Boxel Development**: Code generation and editing
- **Source Code Editing**: File modifications using SEARCH/REPLACE
- **Boxel Environment**: Context-aware operations

## Example Workflow

1. Switch to code mode:
   ```json
   {"name": "switch-submode", "payload": {"submode": "code"}}
   ```

2. Open/navigate to file (auto-attaches to context)

3. Select specific code sections if needed

4. Use AI assistance with full context available

5. Apply changes using SEARCH/REPLACE blocks

This guide covers the main mechanisms for adding code mode selected text to AI context in the Boxel system. The auto-attachment feature in code mode is the primary method, with manual attachment and selection-specific commands providing additional control.