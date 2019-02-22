import * as vscode from 'vscode';
import { isNumber } from 'util';

enum LPLBlock {
    ClassRoot = 0,
    PersistentFields,
    Conditions,
    DerivedFields,
    Relations,
    Actions,
    OtherSection,
    Action,
    Condition
}

class IndentInfo {
    headingIndent: number;
    contentIndent: number | undefined;
    blockType: LPLBlock;
    symbolInformation: vscode.SymbolInformation | undefined;

    constructor(intentLevel: number, blockType: LPLBlock){
        this.headingIndent = intentLevel;
        this.blockType = blockType;
    }
}

export class BusinessClassDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,    
        token: vscode.CancellationToken): vscode.SymbolInformation[]
    {
        let result: vscode.SymbolInformation[] = [];
        let classNamePattern = /^\s*(\w+)\s+is\s+a\s+BusinessClass\s*$/;
        let className: string = '';
        let headingPattern = /^(\s+)(Persistent Fields|Conditions|Derived Fields|Relations|Actions)\s*(\/\/[^\n]*)?$/;
        let comment =  /^\s*\/\/[^\n]*$/;
        let actionPattern = /^\s+(\w+)\s+is\s+(a|an)\s+((\w+)\s+)?(Request)?Action\s*(\/\/[^\n]*)?$/;
        let fieldPattern = /^\s+(\w+)\s+is\s+((a|an|like)\s+)?(\w+)((\s+size)?\s+\d+)?\s*(\/\/[^\n]*)?$/;
        let conditionPattern = /^\s+(\w+)\s*(\/\/[^\n]*)?$/;
        let match: RegExpExecArray | null;
        let currentBlock: IndentInfo = new IndentInfo(0, LPLBlock.ClassRoot);
        let indentInfo: IndentInfo[] = [];

        for (let lineNum=0; lineNum < document.lineCount; lineNum++) {
            let line = document.lineAt(lineNum);
            if (comment.test(line.text) || line.isEmptyOrWhitespace) {
                continue;
            }
            let indent = this.getColumn(line.text, line.firstNonWhitespaceCharacterIndex);
            while (indent <= currentBlock.headingIndent && currentBlock.symbolInformation !== undefined) {
                let pushData = this.popBlock(document, lineNum, currentBlock);
                if (pushData !== undefined) {
                    result.push(pushData);
                }
                let pop = indentInfo.pop();
                if (pop === undefined) {
                    break;
                }
                currentBlock = pop;
            }

            if (currentBlock.contentIndent === undefined || indent === currentBlock.contentIndent) {
                switch(currentBlock.blockType) {
                    case LPLBlock.ClassRoot:
                        if (currentBlock.symbolInformation === undefined) {
                            match = classNamePattern.exec(line.text);
                            if (match !== null) {
                                className = match[1];
                                currentBlock.symbolInformation = new vscode.SymbolInformation(
                                    match[1],
                                    vscode.SymbolKind.Class,
                                    '',
                                    new vscode.Location(document.uri, new vscode.Position(0,0))
                                );
                            }
                        } else {
                            match = headingPattern.exec(line.text);
                            if (match !== null) {
                                currentBlock.contentIndent = indent;
                                indentInfo.push(currentBlock);
                                if (match[2] === "Persistent Fields") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.PersistentFields);
                                } else if (match[2] === "Conditions") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.Conditions);
                                } else if (match[2] === "Actions") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.Actions);
                                } else {
                                    currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                                }
                                currentBlock.symbolInformation = new vscode.SymbolInformation(
                                    match[2],
                                    vscode.SymbolKind.Namespace,
                                    className,
                                    new vscode.Location(
                                        document.uri,
                                        new vscode.Position(lineNum, line.firstNonWhitespaceCharacterIndex)
                                    )
                                );
                            }    
                        }
                        break;
                    case LPLBlock.PersistentFields:
                        match = fieldPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            result.push(new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Field,
                                className,
                                new vscode.Location(document.uri, new vscode.Position(lineNum, line.firstNonWhitespaceCharacterIndex))));
                        }
                        break;
                    case LPLBlock.Conditions:
                        match = conditionPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.Condition);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri, new vscode.Position(lineNum, line.firstNonWhitespaceCharacterIndex)));
                        }
                        break;
                    case LPLBlock.Actions:
                        match = actionPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.Action);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Method,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, line.firstNonWhitespaceCharacterIndex)));
                        }
                        break;
                    case LPLBlock.Action:
                    case LPLBlock.Condition:
                    case LPLBlock.OtherSection:
                        if (currentBlock.contentIndent === undefined) {
                            currentBlock.contentIndent = indent;
                        }
                        break;
                }
            }
        }

        let lineNum = document.lineCount;
        while (true) {
            let pushData = this.popBlock(document, lineNum, currentBlock);
            if (pushData !== undefined) {
                result.push(pushData);
            }
            let pop = indentInfo.pop();
            if (pop === undefined) {
                break;
            }
            currentBlock = pop;
        }
        return result;
    }

    private getColumn(line: string, end: number) : number {
        let editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            return 0;
        }

        let tabSize = isNumber(editor.options.tabSize) ? editor.options.tabSize : 4;
        let width = 0;

        for (let charIndex = 0; (charIndex < end) && charIndex < line.length; charIndex++) {
            if (line.charAt(charIndex) === '\t') {
                width = (Math.floor(width / tabSize) + 1) * tabSize;
            } else {
                width++;
            }            
        }
        return width;
    }

    private popBlock(document: vscode.TextDocument, lineNum: number, currentBlock: IndentInfo): vscode.SymbolInformation | undefined {
        if (currentBlock.symbolInformation !== undefined) {
            currentBlock.symbolInformation = new vscode.SymbolInformation(
                currentBlock.symbolInformation.name,
                currentBlock.symbolInformation.kind,
                currentBlock.symbolInformation.containerName,
                new vscode.Location(
                    currentBlock.symbolInformation.location.uri,
                    new vscode.Range(
                        currentBlock.symbolInformation.location.range.start,
                        new vscode.Position(lineNum-1, document.lineAt(lineNum-1).text.length)
                    )
                )
            );
            return currentBlock.symbolInformation;
        }
    }
}