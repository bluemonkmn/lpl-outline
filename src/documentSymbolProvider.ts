import * as vscode from 'vscode';
import { isNumber } from 'util';

enum LPLBlock {
    ClassRoot = 0,
    PersistentFields,
    Conditions,
    DerivedFields,
    Relations,
    Actions,
    TransientFields,
    LocalFields,
    RuleBlocks,
    OtherSection,
    Action,
    Condition,
    DerivedField,
    Relation,
    Field,
    RuleBlock,
    ActionParameters,
    ActionLocalFields,
    ActionParameterRules,
    ActionLocalFieldRules,
    ActionRuleBlocks,
    ActionOtherSection,
    ActionParameter,
    ActionLocalField,
    ActionParameterRule,
    ActionLocalFieldRule,
    ActionRuleBlock
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
    
    includeActionDetail: Boolean = vscode.workspace.getConfiguration("lpl-outline").detail === "deep";

    public provideDocumentSymbols(
        document: vscode.TextDocument,    
        token: vscode.CancellationToken): vscode.SymbolInformation[]
    {
        let result: vscode.SymbolInformation[] = [];
        let classNamePattern = /^\s*(\w+)\s+is\s+a\s+BusinessClass\s*$/;
        let className: string = '';
        let headingPattern = /^(\s+)(Persistent Fields|Conditions|Derived Fields|Relations|Actions|Field Rules|Local Fields|Transient Fields|Field Groups|Rule Blocks)\s*(\/\/[^\n]*)?$/;
        let actionHeadingPattern = /^(\s+)(Queue Mapping Fields|Set Is|Parameters|Parameter Rules|Local Fields|Results|Field Rules|SubType|Accumulators|Instance Selection|Sort Order(\s+is\s+\w+)|Action Rules|Entrance Rules|Exit Rules|InitiateRequest Rules|UpdateRequest Rules|CancelRequest Rules|Rollback Rules|Rule Blocks)\s*(\/\/[^\n]*)?$/;
        let comment =  /^\s*\/\/[^\n]*$/;
        let preprocessor = /^\#[^\n]*$/;
        let actionPattern = /^\s+(\w+)\s+is\s+(a|an)\s+((\w+)\s+)?(Request)?Action\s*(\/\/[^\n]*)?$/;
        let derivedPattern = /^\s+(\w+)\s+is\s+(a|an)\s+((\w+)\s+)?(aggregation\s+of\s(\w+)|ConditionalField|ComputeField|InstanceCount|StringField|MessageField|LabelField|DerivedField|NativeField)\s*(\/\/[^\n]*)?$/;
        let relationPattern = /^\s+(\w+)(\s+(is\s+(a|an)\s+)?(\w+)\s+set)?\s*(\/\/[^\n]*)?$/;
        let fieldPattern = /^\s+(\w+)(\s+is\s+((a|an|like)\s+)?(\w+(\s+view)?|BusinessObjectReference\s+to\s+(\w+)|Unsigned\s+(Decimal|Percent)|EmailAddressField\s+with\s+multiple\s+addresses|Iteration\s+of\s+(\w+))((\s+size(\s+fixed|\s+up\s+to)?)?\s+\d+(\.\d+)?|(\s+group|\s+compute)(\s+in subject \w+)?)?)?\s*(\/\/[^\n]*)?$/;
        let simpleNamePattern = /^\s+(\w+)\s*(\/\/[^\n]*)?$/;
        let match: RegExpExecArray | null;
        let currentBlock: IndentInfo = new IndentInfo(0, LPLBlock.ClassRoot);
        let indentInfo: IndentInfo[] = [];

        // Refresh includeActionDetail from settings
        this.includeActionDetail = vscode.workspace.getConfiguration("lpl-outline").detail === "deep";

        for (let lineNum=0; lineNum < document.lineCount; lineNum++) {
            let line = document.lineAt(lineNum);
            if (comment.test(line.text) || line.isEmptyOrWhitespace || preprocessor.test(line.text)) {
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
                                } else if (match[2] === "Derived Fields") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.DerivedFields);
                                } else if (match[2] === "Relations") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.Relations);
                                } else if (match[2] === "Transient Fields") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.TransientFields);
                                } else if (match[2] === "Local Fields") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.LocalFields);
                                } else if (match[2] === "Rule Blocks") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.RuleBlocks);
                                } else {
                                    currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                                }
                                currentBlock.symbolInformation = new vscode.SymbolInformation(
                                    match[2],
                                    vscode.SymbolKind.Namespace,
                                    className,
                                    new vscode.Location(
                                        document.uri,
                                        new vscode.Position(lineNum, 0)
                                    )
                                );
                            }    
                        }
                        break;
                    case LPLBlock.PersistentFields:
                    case LPLBlock.TransientFields:
                    case LPLBlock.LocalFields:
                        match = fieldPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.Field);
                            let kind: vscode.SymbolKind;
                            switch (currentBlock.blockType) {
                                case LPLBlock.LocalFields:
                                    kind = vscode.SymbolKind.Variable;
                                    break;
                                case LPLBlock.TransientFields:
                                    kind = vscode.SymbolKind.Property;
                                    break;
                                case LPLBlock.PersistentFields:
                                default:
                                    kind = vscode.SymbolKind.Field;
                                    break;
                            }
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                kind,
                                className,
                                new vscode.Location(document.uri, new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.Conditions:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.Condition);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Boolean,
                                className,
                                new vscode.Location(document.uri, new vscode.Position(lineNum, 0)));
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
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.DerivedFields:
                        match = derivedPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.DerivedField);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.Relations:
                        match = relationPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.Relation);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Interface,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.Action:
                        match = actionHeadingPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            currentBlock.contentIndent = indent;
                            indentInfo.push(currentBlock);
                            if (match[2] === "Parameters") {
                                currentBlock = new IndentInfo(indent, LPLBlock.ActionParameters);
                            } else if (match[2] === "Parameter Rules") {
                                currentBlock = new IndentInfo(indent, LPLBlock.ActionParameterRules);
                            } else if (match[2] === "Local Fields") {
                                currentBlock = new IndentInfo(indent, LPLBlock.ActionLocalFields);
                            } else if (match[2] === "Field Rules") {
                                currentBlock = new IndentInfo(indent, LPLBlock.ActionLocalFieldRules);
                            } else if (match[2] === "Rule Blocks") {
                                currentBlock = new IndentInfo(indent, LPLBlock.ActionRuleBlocks);
                            } else {
                                currentBlock = new IndentInfo(indent, LPLBlock.ActionOtherSection);
                            }
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[2],
                                vscode.SymbolKind.Namespace,
                                className,
                                new vscode.Location(
                                    document.uri,
                                    new vscode.Position(lineNum, 0)
                                )
                            );
                        }
                        break;
                    case LPLBlock.ActionParameters:
                        match = fieldPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionParameter);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Variable,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.ActionParameterRules:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionParameterRule);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.ActionLocalFields:
                        match = fieldPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionLocalField);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Variable,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.ActionLocalFieldRules:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionLocalFieldRule);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.ActionRuleBlocks:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionRuleBlock);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.RuleBlocks:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.RuleBlock);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.Condition:
                    case LPLBlock.OtherSection:
                    case LPLBlock.ActionOtherSection:                                        
                    case LPLBlock.DerivedField:
                    case LPLBlock.Relation:
                    case LPLBlock.RuleBlock:
                    case LPLBlock.ActionLocalField:
                    case LPLBlock.ActionLocalFieldRule:
                    case LPLBlock.ActionParameter:
                    case LPLBlock.ActionParameterRule:
                    case LPLBlock.ActionRuleBlock:
                    case LPLBlock.Field:
                        if (currentBlock.contentIndent === undefined) {
                            currentBlock.contentIndent = indent;
                        }
                        break;
                    default:
                        console.log("Unhandled block type: " + currentBlock.blockType);
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

        switch(currentBlock.blockType){
            case LPLBlock.ActionLocalField:
            case LPLBlock.ActionLocalFieldRule:
            //case LPLBlock.ActionLocalFieldRules:
            //case LPLBlock.ActionLocalFields:
            //case LPLBlock.ActionOtherSection:
            case LPLBlock.ActionParameter:
            case LPLBlock.ActionParameterRule:
            //case LPLBlock.ActionParameterRules:
            //case LPLBlock.ActionParameters:
            case LPLBlock.ActionRuleBlock:
            //case LPLBlock.ActionRuleBlocks:
                if (!this.includeActionDetail) {
                    return;
                }
        }

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