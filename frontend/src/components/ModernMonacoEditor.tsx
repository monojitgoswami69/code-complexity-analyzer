import React, { useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { StoredFile } from '../services/storageService';
import { Loader2 } from 'lucide-react';

interface ModernMonacoEditorProps {
    file: StoredFile;
    theme: 'dark' | 'light';
    fontSize: number;
    onChange: (value: string) => void;
    onCursorChange: (ln: number, col: number) => void;
    onSelectionChange: (count: number) => void;
    onAnalyze: (code: string) => void;
}

// Map common language names to Monaco language IDs
const LANGUAGE_MAP: Record<string, string> = {
    'JavaScript': 'javascript',
    'TypeScript': 'typescript',
    'Python': 'python',
    'Java': 'java',
    'C++': 'cpp',
    'C': 'c',
    'Go': 'go',
    'Rust': 'rust',
    'Ruby': 'ruby',
    'PHP': 'php',
    'HTML': 'html',
    'CSS': 'css',
    'JSON': 'json',
    'JSX': 'javascript',
    'TSX': 'typescript'
};

// Catppuccin Mocha theme (dark)
const CATPPUCCIN_MOCHA = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'cba6f7' },
        { token: 'string', foreground: 'a6e3a1' },
        { token: 'number', foreground: 'fab387' },
        { token: 'type', foreground: 'f9e2af' },
        { token: 'function', foreground: '89b4fa' },
        { token: 'variable', foreground: 'cdd6f4' },
        { token: 'operator', foreground: '94e2d5' },
    ],
    colors: {
        'editor.background': '#1e1e2e',
        'editor.foreground': '#cdd6f4',
        'editor.lineHighlightBackground': '#313244',
        'editorLineNumber.foreground': '#6c7086',
        'editorLineNumber.activeForeground': '#cdd6f4',
        'editor.selectionBackground': '#45475a',
        'editor.inactiveSelectionBackground': '#313244',
        'editorCursor.foreground': '#f5e0dc',
        'editorWhitespace.foreground': '#45475a',
        'editorIndentGuide.background': '#45475a',
        'editorIndentGuide.activeBackground': '#6c7086',
    }
};

// Catppuccin Latte theme (light)
const CATPPUCCIN_LATTE = {
    base: 'vs',
    inherit: true,
    rules: [
        { token: 'comment', foreground: '9ca0b0', fontStyle: 'italic' },
        { token: 'keyword', foreground: '8839ef' },
        { token: 'string', foreground: '40a02b' },
        { token: 'number', foreground: 'fe640b' },
        { token: 'type', foreground: 'df8e1d' },
        { token: 'function', foreground: '1e66f5' },
        { token: 'variable', foreground: '4c4f69' },
        { token: 'operator', foreground: '179299' },
    ],
    colors: {
        'editor.background': '#eff1f5',
        'editor.foreground': '#4c4f69',
        'editor.lineHighlightBackground': '#e6e9ef',
        'editorLineNumber.foreground': '#9ca0b0',
        'editorLineNumber.activeForeground': '#4c4f69',
        'editor.selectionBackground': '#ccd0da',
        'editor.inactiveSelectionBackground': '#e6e9ef',
        'editorCursor.foreground': '#dc8a78',
        'editorWhitespace.foreground': '#ccd0da',
        'editorIndentGuide.background': '#ccd0da',
        'editorIndentGuide.activeBackground': '#9ca0b0',
    }
};

export const ModernMonacoEditor: React.FC<ModernMonacoEditorProps> = ({
    file,
    theme,
    fontSize,
    onChange,
    onCursorChange,
    onSelectionChange,
    onAnalyze,
}) => {
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof Monaco | null>(null);

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Define custom themes
        monaco.editor.defineTheme('catppuccin-mocha', CATPPUCCIN_MOCHA as any);
        monaco.editor.defineTheme('catppuccin-latte', CATPPUCCIN_LATTE as any);

        // Set the theme
        monaco.editor.setTheme(theme === 'dark' ? 'catppuccin-mocha' : 'catppuccin-latte');

        // Disable TypeScript/JavaScript diagnostics to prevent errors
        try {
            const tsDefaults = monaco.languages.typescript?.typescriptDefaults;
            const jsDefaults = monaco.languages.typescript?.javascriptDefaults;
            const diagOff = {
                noSemanticValidation: true,
                noSyntaxValidation: true,
                noSuggestionDiagnostics: true,
            };
            tsDefaults?.setDiagnosticsOptions(diagOff);
            jsDefaults?.setDiagnosticsOptions(diagOff);
        } catch {
            // Silently ignore
        }

        // Cursor position tracking
        editor.onDidChangeCursorPosition((e) => {
            onCursorChange(e.position.lineNumber, e.position.column);
        });

        // Selection tracking
        editor.onDidChangeCursorSelection(() => {
            const selection = editor.getSelection();
            if (selection) {
                const model = editor.getModel();
                if (model) {
                    const selectedText = model.getValueInRange(selection);
                    onSelectionChange(selectedText.length);
                }
            }
        });

        // Add Ctrl/Cmd + Enter to analyze
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            const code = editor.getValue();
            if (code.trim()) {
                onAnalyze(code);
            }
        });
    };

    const handleEditorChange = (value: string | undefined) => {
        if (value !== undefined) {
            onChange(value);
        }
    };

    // Update theme when it changes
    React.useEffect(() => {
        if (monacoRef.current) {
            monacoRef.current.editor.setTheme(theme === 'dark' ? 'catppuccin-mocha' : 'catppuccin-latte');
        }
    }, [theme]);

    const languageId = LANGUAGE_MAP[file.language] || file.language.toLowerCase() || 'javascript';

    return (
        <div className="relative w-full h-full">
            <Editor
                height="100%"
                language={languageId}
                value={file.content}
                theme={theme === 'dark' ? 'catppuccin-mocha' : 'catppuccin-latte'}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                loading={
                    <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: theme === 'dark' ? '#1e1e2e' : '#eff1f5' }}>
                        <Loader2 className={`animate-spin ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`} size={24} />
                    </div>
                }
                options={{
                    automaticLayout: true,
                    fontSize,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    minimap: {
                        enabled: true,
                        showSlider: 'mouseover',
                        renderCharacters: true,
                    },
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    lineNumbers: 'on',
                    roundedSelection: false,
                    padding: { top: 16, bottom: 16 },
                    bracketPairColorization: { enabled: true },
                    renderLineHighlight: 'line',
                    contextmenu: true,
                    scrollbar: {
                        verticalScrollbarSize: 10,
                        horizontalScrollbarSize: 10,
                    },
                    stickyScroll: {
                        enabled: false,
                    },
                }}
            />
        </div>
    );
};
