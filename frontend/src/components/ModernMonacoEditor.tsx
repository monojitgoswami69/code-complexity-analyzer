import React, { useEffect, useRef, useState } from 'react';
import { init } from 'modern-monaco';
import { Loader2 } from 'lucide-react';
import { StoredFile } from '../services/storageService';

interface ModernMonacoEditorProps {
    file: StoredFile;
    theme: 'dark' | 'light';
    fontSize: number;
    onChange: (value: string) => void;
    onCursorChange: (ln: number, col: number) => void;
    onSelectionChange: (count: number) => void;
    onAnalyze: (code: string) => void;
    isAnalyzing: boolean;
}

// Map common language names to Monaco/Shiki language IDs
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
    'JSON': 'json'
};

export const ModernMonacoEditor: React.FC<ModernMonacoEditorProps> = ({
    file,
    theme,
    fontSize,
    onChange,
    onCursorChange,
    onSelectionChange,
    onAnalyze,
    isAnalyzing
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<any>(null); // monaco.editor.IStandaloneCodeEditor
    const monacoRef = useRef<any>(null); // monaco instance
    const [isReady, setIsReady] = useState(false);
    const isUpdatingRef = useRef(false);

    // Initialize Monaco
    useEffect(() => {
        let mounted = true;

        const initialize = async () => {
            if (monacoRef.current) {
                setIsReady(true);
                return;
            }

            try {
                // Init with desired themes
                const monaco = await init({
                    themes: ['catppuccin-latte', 'catppuccin-mocha'],
                    // basic languages are auto-loaded by default in modern-monaco
                });

                if (!mounted || !containerRef.current) return;

                monacoRef.current = monaco;

                // Create editor if not exists
                if (!editorRef.current) {
                    const editor = monaco.editor.create(containerRef.current, {
                        automaticLayout: true,
                        fontSize,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        minimap: {
                            enabled: true,
                            showSlider: 'mouseover',
                            renderCharacters: true
                        },
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        lineNumbers: 'on',
                        roundedSelection: false,
                        padding: { top: 16, bottom: 16 },
                        model: null,
                        theme: theme === 'dark' ? 'catppuccin-mocha' : 'catppuccin-latte',
                        bracketPairColorization: { enabled: true },
                        renderLineHighlight: 'all',
                        contextmenu: true,
                    });

                    editorRef.current = editor;

                    // Event Listeners
                    editor.onDidChangeCursorPosition((e: any) => {
                        onCursorChange(e.position.lineNumber, e.position.column);
                    });

                    // Handle selection changes
                    editor.onDidChangeCursorSelection((e: any) => {
                        const selection = editor.getSelection();
                        if (selection) {
                            const model = editor.getModel();
                            if (model) {
                                const selectedText = model.getValueInRange(selection);
                                onSelectionChange(selectedText.length);
                            }
                        }
                    });

                    // Add Command for Analyze (Ctrl/Cmd + Enter)
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                        const code = editor.getValue();
                        if (code.trim()) {
                            onAnalyze(code);
                        }
                    });

                    // Handle content changes
                    editor.onDidChangeModelContent(() => {
                        // If we are programmatically updating, ignore trigger
                        if (isUpdatingRef.current) return;

                        const model = editor.getModel();
                        if (model) {
                            const value = model.getValue();
                            onChange(value);
                        }
                    });
                }

                setIsReady(true);
            } catch (error) {
                console.error("Failed to initialize modern-monaco:", error);
            }
        };

        initialize();

        return () => {
            mounted = false;
            // Cleanup: Dispose editor logic if needed
            if (editorRef.current) {
                editorRef.current.dispose();
                editorRef.current = null;
            }
        };
    }, []);

    // Update Theme
    useEffect(() => {
        if (isReady && monacoRef.current) {
            monacoRef.current.editor.setTheme(theme === 'dark' ? 'catppuccin-mocha' : 'catppuccin-latte');
        }
    }, [theme, isReady]);

    // Update Font Size
    useEffect(() => {
        if (isReady && editorRef.current) {
            editorRef.current.updateOptions({ fontSize });
        }
    }, [fontSize, isReady]);

    // Handle File Switching & Content Updates
    useEffect(() => {
        if (!isReady || !editorRef.current || !monacoRef.current) return;

        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const currentModel = editor.getModel();

        // Determine target language
        const languageId = LANGUAGE_MAP[file.language] || file.language.toLowerCase() || 'javascript';

        // Construct a unique URI for this file
        const uri = monaco.Uri.parse(`file:///${file.id}`);

        let model = monaco.editor.getModel(uri);

        // If we are switching files (current model is not the target model)
        if (!currentModel || currentModel.uri.toString() !== uri.toString()) {
            if (!model) {
                model = monaco.editor.createModel(file.content, languageId, uri);
            } else {
                // Check if content matches, update if not
                if (model.getValue() !== file.content) {
                    model.setValue(file.content);
                }
                // Ensure language is correct (in case it changed)
                monaco.editor.setModelLanguage(model, languageId);
            }
            editor.setModel(model);
        } else {
            // Same file. Check for external content updates.
            if (model.getValue() !== file.content) {
                isUpdatingRef.current = true;
                // Use executeEdits to preserve undo stack where possible
                editor.executeEdits('react-update', [{
                    range: model.getFullModelRange(),
                    text: file.content
                }]);
                isUpdatingRef.current = false;
            }

            // Check language update
            if (model.getLanguageId() !== languageId) {
                monaco.editor.setModelLanguage(model, languageId);
            }
        }

    }, [file.id, file.content, file.language, isReady]);

    return (
        <div className="relative w-full h-full" style={{ backgroundColor: theme === 'dark' ? '#232332' : '#EEF1F5' }}>
            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-transparent z-10 pointer-events-none">
                    <Loader2 className={`animate-spin ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`} size={24} />
                </div>
            )}
            <div ref={containerRef} className="absolute inset-0 w-full h-full" />
        </div>
    );
};
