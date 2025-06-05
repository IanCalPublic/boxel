import { TemplateOnlyComponent } from '@ember/component/template-only';
import { registerDestructor } from '@ember/destroyable';
import { fn } from '@ember/helper';
import { hash } from '@ember/helper';
import { on } from '@ember/modifier';

import { service } from '@ember/service';

import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';

import { restartableTask, task, timeout } from 'ember-concurrency';
import perform from 'ember-concurrency/helpers/perform';
import Modifier from 'ember-modifier';

import { Copy as CopyIcon } from '@cardstack/boxel-ui/icons';

import { CodeData } from '@cardstack/host/lib/formatted-message/utils';
import { MonacoEditorOptions } from '@cardstack/host/modifiers/monaco';

import { MonacoSDK } from '@cardstack/host/services/monaco-service';

import OperatorModeStateService from '@cardstack/host/services/operator-mode-state-service';

import { CodePatchStatus } from 'https://cardstack.com/base/matrix-event';

import ApplyButton from '../ai-assistant/apply-button';

import type { ComponentLike } from '@glint/template';
import type * as _MonacoSDK from 'monaco-editor';
import { hasEmptySearchPortion } from '@cardstack/host/commands/patch-code';
import Owner from '@ember/owner';

function countDiffLines(
  lineChanges: LineChange[] | null | undefined,
  options: CountDiffLinesOptions = {},
): DiffStats {
  if (!lineChanges || !Array.isArray(lineChanges)) {
    return { added: 0, removed: 0 };
  }

  let added = 0;
  let removed = 0;

  options.debug = true;

  if (options.debug) {
    console.log('Total changes:', lineChanges.length);
    console.log('---');
  }

  lineChanges.forEach((change, index) => {
    const originalStart = change.originalStartLineNumber;
    const originalEnd = change.originalEndLineNumber;
    const modifiedStart = change.modifiedStartLineNumber;
    const modifiedEnd = change.modifiedEndLineNumber;

    if (originalEnd < originalStart && originalStart !== 0) {
      if (options.debug) {
        console.error(
          `❌ Invalid change #${index}: originalEnd (${originalEnd}) < originalStart (${originalStart})`,
        );
      }
      return;
    }

    let changeType: 'ADD' | 'DELETE' | 'MODIFY';
    let removedCount = 0;
    let addedCount = 0;

    if (originalStart === 0) {
      changeType = 'ADD';
      addedCount = modifiedEnd - modifiedStart + 1;
      added += addedCount;
    } else if (modifiedStart === 0) {
      changeType = 'DELETE';
      removedCount = originalEnd - originalStart + 1;
      removed += removedCount;
    } else {
      changeType = 'MODIFY';
      removedCount = originalEnd - originalStart + 1;
      addedCount = modifiedEnd - modifiedStart + 1;
      removed += removedCount;
      added += addedCount;
    }

    if (options.debug) {
      console.log(`Change #${index} [${changeType}]:`, {
        original: `${originalStart}-${originalEnd} (${removedCount} lines)`,
        modified: `${modifiedStart}-${modifiedEnd} (${addedCount} lines)`,
        impact: `+${addedCount} -${removedCount}`,
      });
    }
  });

  if (options.debug) {
    console.log('---');
    console.log(`Total: +${added} -${removed}`);
  }

  return { added, removed };
}

interface CopyCodeButtonSignature {
  Args: {
    code?: string | null;
  };
}

interface ApplyCodePatchButtonSignature {
  Args: {
    patchCodeStatus: CodePatchStatus | 'ready' | 'applying';
    performPatch?: () => void;
    codeData: CodeData;
    originalCode?: string | null;
    modifiedCode?: string | null;
  };
}

interface CodeBlockActionsSignature {
  Args: {
    code?: string | null;
    codeData?: Partial<CodeData>;
  };
  Blocks: {
    default: [
      {
        copyCode: ComponentLike<CopyCodeButtonSignature>;
        applyCodePatch: ComponentLike<ApplyCodePatchButtonSignature>;
      },
    ];
  };
  actions: [];
}

interface CodeBlockEditorSignature {
  Args: {
    code?: string | null;
    dimmed?: boolean;
  };
}

interface CodeBlockDiffEditorSignature {
  Args: {
    originalCode?: string | null;
    modifiedCode?: string | null;
    language?: string | null;
    updateDiffEditorStats?: (stats: {
      linesAdded: number;
      linesRemoved: number;
    }) => void;
  };
}

interface CodeBlockDiffEditorHeaderSignature {
  Args: {
    codeData: CodeData;
    diffEditorStats?: {
      linesRemoved: number;
      linesAdded: number;
    } | null;
  };
}

interface Signature {
  Args: {
    monacoSDK: MonacoSDK;
    codeData?: Partial<CodeData>;
    originalCode?: string | null;
    modifiedCode?: string | null;
    language?: string | null;
    code?: string | null;
    dimmed?: boolean;
    mode?: 'edit' | 'create';
    fileUrl?: string;
    diffEditorStats?: {
      linesRemoved: number;
      linesAdded: number;
    } | null;
    updateDiffEditorStats?: (stats: {
      linesAdded: number;
      linesRemoved: number;
    }) => void;
  };
  Blocks: {
    default: [
      {
        editor: ComponentLike<CodeBlockEditorSignature>;
        diffEditorHeader: ComponentLike<CodeBlockDiffEditorHeaderSignature>;
        diffEditor: ComponentLike<CodeBlockDiffEditorSignature>;
        actions: ComponentLike<CodeBlockActionsSignature>;
      },
    ];
  };
  Element: HTMLElement;
}

let CodeBlockComponent: TemplateOnlyComponent<Signature> = <template>
  {{yield
    (hash
      editor=(component CodeBlockEditor monacoSDK=@monacoSDK codeData=@codeData)
      diffEditor=(component
        CodeBlockDiffEditor
        monacoSDK=@monacoSDK
        originalCode=@originalCode
        modifiedCode=@modifiedCode
        language=@language
      )
      diffEditorHeader=(component
        CodeBlockDiffEditorHeader
        codeData=@codeData
        diffEditorStats=@diffEditorStats
      )
      actions=(component CodeBlockActionsComponent codeData=@codeData)
    )
  }}
</template>;

export default CodeBlockComponent;

interface MonacoEditorSignature {
  Args: {
    Named: {
      code?: string | null;
      codeData?: Partial<CodeData>;
      monacoSDK: MonacoSDK;
      editorDisplayOptions: MonacoEditorOptions;
    };
  };
}

interface MonacoDiffEditorSignature {
  Args: {
    Named: {
      monacoSDK: MonacoSDK;
      originalCode?: string | null;
      modifiedCode?: string | null;
      language?: string | null;
      editorDisplayOptions: MonacoEditorOptions;
      updateDiffEditorStats?: (stats: {
        linesAdded: number;
        linesRemoved: number;
      }) => void;
    };
  };
}

class MonacoDiffEditor extends Modifier<MonacoDiffEditorSignature> {
  private monacoState: {
    editor: _MonacoSDK.editor.IStandaloneDiffEditor;
    lineChangeStats: { added: number; removed: number };
  } | null = null;

  modify(
    element: HTMLElement,
    _positional: [],
    {
      monacoSDK,
      editorDisplayOptions,
      originalCode,
      modifiedCode,
      language,
      updateDiffEditorStats,
    }: MonacoDiffEditorSignature['Args']['Named'],
  ) {
    if (originalCode === undefined || modifiedCode === undefined) {
      return;
    }
    if (this.monacoState) {
      let { editor } = this.monacoState;
      let model = editor.getModel();
      let originalModel = model?.original;
      let modifiedModel = model?.modified;

      let newOriginalCode = originalCode ?? '';
      let newModifiedCode = modifiedCode ?? '';

      if (newOriginalCode !== originalModel?.getValue()) {
        originalModel?.setValue(newOriginalCode);
      }
      if (newModifiedCode !== modifiedModel?.getValue()) {
        modifiedModel?.setValue(newModifiedCode);
      }
    } else {
      let editor = monacoSDK.editor.createDiffEditor(
        element,
        editorDisplayOptions,
      );

      let originalModel = monacoSDK.editor.createModel(
        originalCode ?? '',
        language ?? '',
      );
      let modifiedModel = monacoSDK.editor.createModel(
        modifiedCode ?? '',
        language ?? '',
      );

      editor.setModel({ original: originalModel, modified: modifiedModel });

      const contentHeight = editor.getModifiedEditor().getContentHeight();
      if (contentHeight > 0) {
        element.style.height = `${contentHeight}px`;
      }

      editor.getModifiedEditor().onDidContentSizeChange(() => {
        const newHeight = editor.getModifiedEditor().getContentHeight();
        if (newHeight > 0) {
          element.style.height = `${newHeight}px`;
        }
      });

      this.monacoState = {
        editor,
        lineChangeStats: countDiffLines(editor.getLineChanges()),
      };

      let monacoStateId = 'monaco_state_' + Date.now();
      console.log('monacoStateId', monacoStateId);
      window[monacoStateId] = this.monacoState;

      editor.onDidUpdateDiff(() => {
        const stats = countDiffLines(editor.getLineChanges());

        if (updateDiffEditorStats) {
          updateDiffEditorStats({
            linesAdded: stats.added,
            linesRemoved: stats.removed,
          });
        }
      });
    }

    registerDestructor(this, () => {
      let editor = this.monacoState?.editor;
      if (editor) {
        editor.dispose();
      }
    });
  }
}

class MonacoEditor extends Modifier<MonacoEditorSignature> {
  private monacoState: {
    editor: _MonacoSDK.editor.IStandaloneCodeEditor;
  } | null = null;
  modify(
    element: HTMLElement,
    _positional: [],
    {
      code,
      codeData,
      monacoSDK,
      editorDisplayOptions,
    }: MonacoEditorSignature['Args']['Named'],
  ) {
    if (!codeData) {
      return;
    }

    let { language } = codeData;
    if (!code || !language) {
      return;
    }
    if (this.monacoState) {
      let { editor } = this.monacoState;
      let model = editor.getModel()!;

      // Here we are appending deltas when code is "streaming" in, which is
      // useful when code changes frequently in short periods of time. In this
      // case we calculate the delta of the new code and the current code, and
      // then apply that delta to the model. Compared to calling setValue()
      // for every new value, this removes the need for re-tokenizing the code
      // which is expensive and produces visual annoyances such as flickering.

      let currentCode = model.getValue();
      let newCode = code ?? '';

      if (!newCode.startsWith(currentCode)) {
        // This is a safety net for rare cases where the new code streamed in
        // does not begin with the current code. This can happen when streaming
        // in code with search/replace diff markers and the diff marker in chunk
        // is incomplete, for example "<<<<<<< SEAR" instead of
        // "<<<<<<< SEARCH". In this case the code diff parsing logic
        // in parseCodeContent will not recognize the diff marker and it will
        // display "<<<<<<< SEAR" for a brief moment in the editor, before getting
        // a chunk with a complete diff marker. In this case we need to reset
        // the data otherwise the appending delta will be incorrect and we'll
        // see mangled code in the editor (syntax errors with incomplete diff markers).
        model.setValue(newCode);
      } else {
        let codeDelta = newCode.slice(currentCode.length);

        let lineCount = model.getLineCount();
        let lastLineLength = model.getLineLength(lineCount);

        let range = {
          startLineNumber: lineCount,
          startColumn: lastLineLength + 1,
          endLineNumber: lineCount,
          endColumn: lastLineLength + 1,
        };

        let editOperation = {
          range: range,
          text: codeDelta,
          forceMoveMarkers: true,
        };

        let withDisabledReadOnly = (
          readOnlySetting: boolean,
          fn: () => void,
        ) => {
          editor.updateOptions({ readOnly: false });
          fn();
          editor.updateOptions({ readOnly: readOnlySetting });
        };

        withDisabledReadOnly(!!editorDisplayOptions.readOnly, () => {
          editor.executeEdits('append-source', [editOperation]);
        });

        editor.revealLine(lineCount + 1); // Scroll to the end as the code streams
      }
    } else {
      let monacoContainer = element;

      let editor = monacoSDK.editor.create(
        monacoContainer,
        editorDisplayOptions,
      );

      let model = editor.getModel()!;
      monacoSDK.editor.setModelLanguage(model, language);

      model.setValue(code);

      const contentHeight = editor.getContentHeight();
      if (contentHeight > 0) {
        element.style.height = `${contentHeight}px`;
      }

      editor.onDidContentSizeChange(() => {
        const newHeight = editor.getContentHeight();
        if (newHeight > 0) {
          element.style.height = `${newHeight}px`;
        }
      });

      this.monacoState = {
        editor,
      };
    }

    registerDestructor(this, () => {
      let editor = this.monacoState?.editor;
      if (editor) {
        editor.dispose();
      }
    });
  }
}

class CodeBlockEditor extends Component<Signature> {
  editorDisplayOptions: MonacoEditorOptions = {
    wordWrap: 'on',
    wrappingIndent: 'indent',
    fontWeight: 'bold',
    scrollbar: {
      alwaysConsumeMouseWheel: false,
    },
    lineNumbers: 'off',
    minimap: {
      enabled: false,
    },
    readOnly: true,
    automaticLayout: true,
    stickyScroll: {
      enabled: false,
    },
    fontSize: 10,
    scrollBeyondLastLine: false,
    padding: {
      top: 8,
      bottom: 8,
    },
    theme: 'vs-dark',
  };

  <template>
    <style scoped>
      .code-block {
        /* width: calc(100% + 2 * var(--boxel-sp));
        margin-left: calc(-1 * var(--boxel-sp)); */
        max-height: 250px;
      }

      .dimmed {
        opacity: 0.6;
      }
    </style>

    <div
      {{MonacoEditor
        code=@code
        monacoSDK=@monacoSDK
        codeData=@codeData
        editorDisplayOptions=this.editorDisplayOptions
      }}
      class='code-block {{if @dimmed "dimmed"}}'
      data-test-editor
    >
      {{! Don't put anything here in this div as monaco modifier will override this element }}
    </div>
  </template>
}

class CodeBlockDiffEditor extends Component<Signature> {
  private editorDisplayOptions = {
    originalEditable: false,
    renderSideBySide: false,
    diffAlgorithm: 'advanced',
    folding: true,
    hideUnchangedRegions: {
      enabled: true,
      revealLineCount: 10,
      minimumLineCount: 1,
      contextLineCount: 1,
    },
    readOnly: true,
    fontSize: 10,
    renderOverviewRuler: false,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: {
      bottom: 8,
      left: 8,
      right: 8,
      top: 8,
    },
    theme: 'vs-dark',
    lineNumbers: 'off' as const,
  };

  <template>
    <style scoped>
      .code-block {
        /* width: calc(100% + 2 * var(--boxel-sp));
        margin-left: calc(-1 * var(--boxel-sp)); */
        max-height: 250px;
      }

      :deep(.line-insert) {
        background-color: rgb(19 255 32 / 66%) !important;
      }

      :deep(.diff-hidden-lines) {
        margin-left: 9px;
      }

      .code-block-diff {
      }
    </style>
    <div
      {{MonacoDiffEditor
        monacoSDK=@monacoSDK
        editorDisplayOptions=this.editorDisplayOptions
        language=@language
        originalCode=@originalCode
        modifiedCode=@modifiedCode
        updateDiffEditorStats=@updateDiffEditorStats
      }}
      class='code-block code-block-diff'
      data-test-code-diff-editor
    >
      {{! Don't put anything here in this div as monaco modifier will override this element }}
    </div>
  </template>
}

class CodeBlockDiffEditorHeader extends Component<CodeBlockDiffEditorHeaderSignature> {
  @tracked isNewFile: boolean = false;
  @service private declare operatorModeStateService: OperatorModeStateService;
  get fileName() {
    let realmUrl = this.operatorModeStateService.realmURL.href;
    let fileUrl = this.args.codeData.fileUrl;

    return fileUrl?.replace(realmUrl, '');
  }

  <template>
    <style scoped>
      .code-block-diff-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background-color: #2c2c3c;
        color: #ffffff;
        padding: 8px 12px;
        border-top-left-radius: 12px;
        border-top-right-radius: 12px;
        font-family: 'Segoe UI', sans-serif;
        font-size: 14px;
        height: 45px;
      }

      .code-block-diff-header .left-section {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .code-block-diff-header .mode {
      }

      .code-block-diff-header .file-info {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .code-block-diff-header .file-info .edit-icon {
        background-color: #f44a1c;
        border-radius: 4px;
        padding: 2px 6px;
        font-weight: bold;
        color: #ffffff;
      }

      .code-block-diff-header .file-info .filename {
        font-weight: 600;
      }

      .code-block-diff-header .right-section {
        display: flex;
        align-items: center;
      }

      .code-block-diff-header .changes {
        display: flex;
        gap: 6px;
        font-weight: 600;
      }

      .code-block-diff-header .changes .removed {
        color: #ff5f5f;
      }

      .code-block-diff-header .changes .added {
        color: #66ff99;
      }
    </style>
    <div class='code-block-diff-header'>
      <div class='left-section'>
        <div class='mode'>
          {{if this.isNewFile 'Create' 'Edit'}}
        </div>
        <div class='file-info'>
          {{! <span class='edit-icon'>B</span> }}
          <span class='filename'>{{this.fileName}}</span>
        </div>
      </div>
      <div class='right-section'>
        <div class='changes'>
          <span class='removed'>-{{@diffEditorStats.linesRemoved}}</span>
          <span class='added'>+{{@diffEditorStats.linesAdded}}</span>
        </div>
      </div>
    </div>
  </template>
}

let CodeBlockActionsComponent: TemplateOnlyComponent<CodeBlockActionsSignature> =
  <template>
    <style scoped>
      .code-block-actions {
        background: black;
        height: 50px;
        padding: var(--boxel-sp-sm) 27px;
        padding-right: var(--boxel-sp);
        display: flex;
        justify-content: flex-start;
        /* width: calc(100% + 2 * var(--boxel-sp));
        margin-left: calc(-1 * var(--boxel-sp)); */
      }
    </style>
    <div class='code-block-actions'>
      {{yield
        (hash
          copyCode=(component CopyCodeButton code=@code)
          applyCodePatch=(component
            ApplyCodePatchButton
            codePatch=@codeData.searchReplaceBlock
            fileUrl=@codeData.fileUrl
            index=@codeData.codeBlockIndex
          )
        )
      }}
    </div>
  </template>;

class CopyCodeButton extends Component<CopyCodeButtonSignature> {
  @tracked copyCodeButtonText: 'Copy' | 'Copied!' = 'Copy';

  copyCode = restartableTask(async (code: string) => {
    this.copyCodeButtonText = 'Copied!';
    await navigator.clipboard.writeText(code);
    await timeout(1000);
    this.copyCodeButtonText = 'Copy';
  });

  <template>
    <style scoped>
      .code-copy-button {
        color: var(--boxel-highlight);
        background: none;
        border: none;
        font: 600 var(--boxel-font-xs);
        padding: 0;
        display: flex;
        margin: auto;
        width: 100%;
      }

      .code-copy-button svg {
        margin-right: var(--boxel-sp-xs);
      }

      .copy-icon {
        --icon-color: var(--boxel-highlight);
      }

      .copy-text {
        display: none;
      }

      .code-copy-button:hover .copy-text {
        display: block;
      }

      .code-copy-button .copy-text.shown {
        display: block;
      }
    </style>

    <button
      class='code-copy-button'
      {{on 'click' (fn (perform this.copyCode) @code)}}
      data-test-copy-code
    >
      <CopyIcon
        width='16'
        height='16'
        role='presentation'
        aria-hidden='true'
        class='copy-icon'
      />
      <span
        class='copy-text {{if this.copyCode.isRunning "shown"}}'
      >{{this.copyCodeButtonText}}</span>
    </button>
  </template>
}

class ApplyCodePatchButton extends Component<ApplyCodePatchButtonSignature> {
  @service declare operatorModeStateService: OperatorModeStateService;

  // This is for debugging purposes only
  logCodePatchAction = () => {
    console.log('fileUrl \n', this.args.codeData.fileUrl);
    console.log('searchReplaceBlock \n', this.args.codeData.searchReplaceBlock);
    console.log('originalCode \n', this.args.originalCode);
    console.log('modifiedCode \n', this.args.modifiedCode);
  };

  get debugButtonEnabled() {
    return this.operatorModeStateService.operatorModeController.debug;
  }

  private performPatch = () => {
    this.args.performPatch?.();
  };

  <template>
    {{#if this.debugButtonEnabled}}
      <button {{on 'click' this.logCodePatchAction}} class='debug-button'>
        👁️
      </button>
    {{/if}}

    <ApplyButton
      data-test-apply-code-button
      @state={{@patchCodeStatus}}
      {{on 'click' this.performPatch}}
    >
      Apply
    </ApplyButton>

    <style scoped>
      .debug-button {
        background: transparent;
        border: none;
        margin-right: 5px;
      }
    </style>
  </template>
}
