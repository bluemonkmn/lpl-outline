import * as vscode from 'vscode';
import { isNumber } from 'util';
import { readFile } from 'fs';

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
    Sets,
    FieldRules,
    OtherSection,
    Action,
    Condition,
    DerivedField,
    Relation,
    Field,
    FieldRule,
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
    ActionRuleBlock,
    List,
    CardView,
    Form,
    CompositeForm,
    SummaryForm
}

class IndentInfo {
    headingIndent: number;
    contentIndent: number | undefined;
    blockType: LPLBlock;
	symbolInformation: vscode.SymbolInformation | undefined;
	cache: ClassCache | undefined;
	formInfo: FormCache | undefined;

    constructor(intentLevel: number, blockType: LPLBlock){
        this.headingIndent = intentLevel;
        this.blockType = blockType;
    }
}

export class ActionCache {
	public parameters = new Map<string, vscode.SymbolInformation>();
	public ruleblocks = new Map<string, vscode.SymbolInformation>();
	public fields = new Map<string, vscode.SymbolInformation>();
	constructor(public definition: vscode.SymbolInformation) { }
}

class RelationCache {
	constructor(public definition: vscode.SymbolInformation) { }
	public targetsRelation: boolean = false;
	public target: string | undefined;
}

class FieldCache {
	constructor(public definition: vscode.SymbolInformation, public hoverText: string) { }
}

class FormCache {
	constructor(public definition: vscode.SymbolInformation) { }
	public actionName: string | undefined;
}

export class ClassCache {
	public fields = new Map<string, FieldCache>();
	public relations = new Map<string, RelationCache>();
	public ruleblocks = new Map<string, vscode.SymbolInformation>();
	public actions = new Map<string, ActionCache>();
	public actionForms = new Map<string, FormCache>();
	constructor(public definition: vscode.SymbolInformation) { }
	public index: vscode.SymbolInformation[] = []; // sorted by location.range.start.line
	public isUI: boolean = false;
	public linkToOther: ClassCache | null = null;
	public indexSymbol(symbol: vscode.SymbolInformation) {
		if (this.index.length === 0 ||
			this.index[this.index.length-1].location.range.start.line < symbol.location.range.start.line) {
			this.index.push(symbol);
		} else {
			let location = this.findSymbolByLine(symbol.location.range.start.line);
			this.index.splice(location.indexIndex, 0, symbol);
		}
	}
	public findSymbolByLine(line: Number): {indexIndex: number; definitionContainsLine: boolean} {
		let bot = 0;
		let top = this.index.length;
		while (bot < top) {
			let mid = Math.floor((bot + top ) / 2);
			if (this.index[mid].location.range.start.line > line) {
				top = mid;
			} else if (this.index[mid].location.range.end.line < line) {
				bot = mid + 1;
			} else {
				if (this.index[mid].location.range.start.line <= line &&
					this.index[mid].location.range.end.line >= line) {
					return {indexIndex: mid, definitionContainsLine: true};
				} else {
					return {indexIndex: mid, definitionContainsLine: false};
				}
			}
		}
		if (this.index.length > bot &&
			this.index[bot].location.range.start.line <= line &&
			this.index[bot].location.range.end.line >= line) {
				return {indexIndex: bot, definitionContainsLine: true};
		} else {
			return {indexIndex: bot, definitionContainsLine: false};
		}
	}
}

class SimpleTextLine {
	private _firstNonWhitespaceCharacterIndex: number | undefined;

	constructor(public text: string) { }
	public get isEmptyOrWhitespace(): boolean {
		return this.firstNonWhitespaceCharacterIndex >= this.text.length;
	}

	public get firstNonWhitespaceCharacterIndex(): number {
		if (this._firstNonWhitespaceCharacterIndex === undefined) {
			if (this.text.length > 0) {
				let match = /\S/.exec(this.text);
				if (match !== null) {
					this._firstNonWhitespaceCharacterIndex = match.index;
				} else {
					this._firstNonWhitespaceCharacterIndex = this.text.length;
				}
			} else {
				this._firstNonWhitespaceCharacterIndex = 0;
			}
		}
		return this._firstNonWhitespaceCharacterIndex;
	}
}

export class SimpleDocument {
	lines: string[];
	private constructor(public uri: vscode.Uri, content: string) {
		this.lines = content.split(/\r?\n/);
	}

	static getSimpleDocument(uri: vscode.Uri): Promise<SimpleDocument> {
		return new Promise<SimpleDocument>((resolve, reject) => {
			readFile(uri.fsPath, "utf8", (err, data: string) => {
				if (err) {
					reject(err.message);
				}
				resolve(new SimpleDocument(uri, data));
			});
	
		});
	}

	get lineCount(): number {
		return this.lines.length;
	}

	lineAt(line: number): SimpleTextLine {
		return new SimpleTextLine(this.lines[line]);
	}

}

export class BusinessClassDocumentSymbolProvider implements vscode.DocumentSymbolProvider, vscode.HoverProvider, vscode.DefinitionProvider {
    includeActionDetail: Boolean = vscode.workspace.getConfiguration("lpl-outline").detail === "deep";

	public cacheSymbols(document: vscode.TextDocument | SimpleDocument, token?: vscode.CancellationToken | undefined): ClassCache | undefined {
		if (this.parsedCache.has(document.uri)) {
			return this.parsedCache.get(document.uri);
		}
		let result = this.parseDocument(document, token);
		if (result !== undefined) {
			this.updateCache(document, result.classcache);
			return result.classcache;
		}
	}

	public provideDocumentSymbols(
        document: vscode.TextDocument,    
        token: vscode.CancellationToken): vscode.SymbolInformation[]
    {
		let result = this.parseDocument(document, token);
		if (result !== undefined) {
			this.updateCache(document, result.classcache);
			return result.symbols;
		}
		return [];
	}

    private parseDocument(
        document: vscode.TextDocument | SimpleDocument,
        token?: vscode.CancellationToken | undefined): {symbols: vscode.SymbolInformation[]; classcache: ClassCache} | undefined
    {
		let result: vscode.SymbolInformation[] = [];
		let classInfo: ClassCache | undefined;
		let actionInfo: ActionCache | undefined;
		let relationInfo: RelationCache | undefined;
		let formInfo: FormCache | undefined;
        let classNamePattern = /^\s*(\w+)\s+is\s+a\s+BusinessClass\s*$/;
        let className: string = '';
        let headingPattern = /^(\s+)(Persistent Fields|Conditions|Derived Fields|Relations|Actions|Field Rules|Local Fields|Transient Fields|Field Groups|Rule Blocks|Sets|Apply Pending Effective Rules|Audit Entry Rules|Commit Rules|Create Exit Rules|Delete Rules|Attach Rules|Action Exit Rules|Ontology|Patterns|Context Fields|Translation Field Rules|Form Invokes)\s*(\/\/[^\n]*)?$/;
        let actionHeadingPattern = /^(\s+)(Queue Mapping Fields|Set Is|Parameters|Parameter Rules|Local Fields|Results|Field Rules|SubType|Accumulators|Instance Selection|Sort Order(\s+is\s+\w+)|Action Rules|Entrance Rules|Exit Rules|InitiateRequest Rules|UpdateRequest Rules|CancelRequest Rules|Rollback Rules|Rule Blocks)\s*(\/\/[^\n]*)?$/;
        let comment =  /^\s*\/\/[^\n]*$/;
        let preprocessor = /^\#[^\n]*$/;
        let actionPattern = /^\s+(\w+)\s+is\s+(a|an)\s+((\w+)\s+)?(Request)?Action\s*(\/\/[^\n]*)?$/;
        let derivedPattern = /^\s+(\w+)\s+is\s+(a|an)\s+((\w+)\s+)?(aggregation\s+of\s(\w+)|ConditionalField|ComputeField|InstanceCount|StringField|MessageField|LabelField|DerivedField|NativeField)\s*(\/\/[^\n]*)?$/;
		let relationPattern = /^\s+(\w+)(\s+(is\s+(a|an)\s+)?(\w+)\s+set)?\s*(\/\/[^\n]*)?$/;
		let relationTargetPattern = /^\s+one-to-(one|many)\s+relation\s+(to|using)\s+(\w+)\s*(\/\/[^\n]*)?$/;
        let fieldPattern = /^\s+(\w+)(\s+is\s+((a|an|like)\s+)?(\w+(\s+view)?|BusinessObjectReference\s+to\s+(\w+)|Unsigned\s+(Decimal|Percent)|EmailAddressField\s+with\s+multiple\s+addresses|Iteration\s+of\s+(\w+)|snapshot\s+of\s+[\w._]+)((\s+size(\s+fixed|\s+up\s+to)?)?\s+\d+(\.\d+)?|(\s+group|\s+compute)(\s+in subject \w+)?)?)?\s*(\/\/[^\n]*)?$/;
        let simpleNamePattern = /^\s+(\w+)\s*(\/\/[^\n]*)?$/;
        let fullFieldName = /^\s+([\w_.]+|bod id|(create|update) stamp(\.actor)?|relevance score|(authenticated|agent)\s*actor[\w_.]*|action comment|action type[\w_.]*|action tag|applied stamp|audit entry id|audit period[\w._]*|correction comment|effective date|effective time zone|effective through|entry stamp|initiating action|invoking action|reason code|system stamp|action request id|changed field names|changed fields|purge date|audit transaction id|server identity|remote identity|current async action request id|current action background group id|has future changes|user fields\s*(\(\w+\))?)\s*(\/\/[^\n]*)?$/;
        
        let uiHeadingPattern = /^\s+(\w+)?(Context Message Invocations|Drill List|\s+is\s+(a|an)\s+((\w+)\s+Message|Navigation|CardView|(\w+\s+)?List|AuditList|DrillList|InstanceCountChart|Form|ActionForm|CompositeForm|WizardForm|MatrixForm|SearchForm|SummaryForm))\s*(\/\/[^\n]*)?$/;
        let uiSubsectionPattern = /^\s+(Display Fields|Actions|Instance Selection|Layout|(\w+)\s+is\s+a\s+(Panel|MultiListPanel)|Detail Sections)\s*(\/\/[^\n]*)?$/;
        let cardViewSection = /^\s+(left column|main column|right column)(\s+is\s+([A-Za-z0-9_.]+|representative image))?\s*(\/\/[^\n]*)?$/;
		let summaryFormSection = /^\s+(First Page Header|Page Header|Page Footer|Layout)\s*(\/\/[^\n]*)?$/;
		let actionIsPattern = /^\s+action\s+is\s+(\w+)\s*(\/\/[^\n]*)?$/;

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
								classInfo = new ClassCache(currentBlock.symbolInformation);
                            }
                        } else {
                            match = headingPattern.exec(line.text);
                            let symbolText: string;
                            let symbolKind = vscode.SymbolKind.Namespace;
                            if (match === null) {
                                match = uiHeadingPattern.exec(line.text);
                                if (match !== null) {
                                    if (match[1]) {
                                        symbolText = match[1];
                                    } else {
                                        symbolText = match[2];
									}
									if (classInfo !== undefined) {
										classInfo.isUI = true;
									}
                                } else {
                                    symbolText = ""; // TSLint(?) apparently cannot detect that this will never apply below
                                }
                            } else {
                                symbolText = match[2];
                            }
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
                                } else if (match[2] === "Field Rules" ||
                                    match[2] === "Translation Field Rules") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.FieldRules);
                                } else if (match[2] === "Sets") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.Sets);
                                } else if (match[4] === "List" || match[6] !== undefined) {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.List);
                                } else if (match[4] === "CardView") {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.CardView);
                                } else if (match[4] === "ActionForm" ||
                                    (match[4] === "Form")) {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.Form);
                                } else if (match[4] === "CompositeForm") {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.CompositeForm);
                                } else if (match[4] === "SummaryForm") {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.SummaryForm);
                                } else if (match[4] === "Navigation" ||
                                    match[4] === "Message") {
                                    symbolKind = vscode.SymbolKind.Class;
                                    currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                                } else {
                                    currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                                }
                                currentBlock.symbolInformation = new vscode.SymbolInformation(
                                    symbolText,
                                    symbolKind,
                                    className,
                                    new vscode.Location(
                                        document.uri,
                                        new vscode.Position(lineNum, 0)
                                    )
								);
								if (currentBlock.blockType === LPLBlock.Form) {
									formInfo = new FormCache(currentBlock.symbolInformation);
									currentBlock.cache = classInfo;
									currentBlock.formInfo = formInfo;
								}
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
							if (classInfo !== undefined) {
								classInfo.fields.set(match[1], new FieldCache(currentBlock.symbolInformation, line.text.trimRight()));
							}
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
							if (classInfo !== undefined) {
								classInfo.fields.set(match[1], new FieldCache(currentBlock.symbolInformation, line.text.trimRight()));
							}
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
							if (classInfo !== undefined) {
								actionInfo = new ActionCache(currentBlock.symbolInformation);
								classInfo.actions.set(match[1], actionInfo);
								currentBlock.cache = classInfo;
							}
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
							if (classInfo !== undefined) {
								classInfo.fields.set(match[1], new FieldCache(currentBlock.symbolInformation, line.text.trimRight()));
							}
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
							if (classInfo !== undefined) {
								classInfo.relations.set(match[1], relationInfo = new RelationCache(currentBlock.symbolInformation));
							}
                        }
                        break;
                    case LPLBlock.Sets:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Key,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;                    
                    case LPLBlock.List:
                    case LPLBlock.Form:                    
                        match = uiSubsectionPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Object,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        } else {
							match = actionIsPattern.exec(line.text);
							if (match !== null && formInfo !== undefined) {
								formInfo.actionName = match[1];
							}
							currentBlock.cache = classInfo;
						}
                        break;
                    case LPLBlock.SummaryForm:
                        match = summaryFormSection.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Namespace,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.CompositeForm:
                        match = uiSubsectionPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                            let name: string;
                            let kind: vscode.SymbolKind;
                            if (match[3]) {
                                name = match[2];
                                kind = vscode.SymbolKind.Class;
                            } else {
                                name = match[1];
                                kind = vscode.SymbolKind.Namespace;
                            }
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                name,
                                kind,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.CardView:
                        match = cardViewSection.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
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
							if (actionInfo !== undefined) {
								actionInfo.parameters.set(currentBlock.symbolInformation.name, currentBlock.symbolInformation); 
							}
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
							if (actionInfo !== undefined) {
								actionInfo.fields.set(currentBlock.symbolInformation.name, currentBlock.symbolInformation); 
							}
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
							if (actionInfo !== undefined) {
								actionInfo.ruleblocks.set(currentBlock.symbolInformation.name, currentBlock.symbolInformation); 
							}
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
							if (classInfo !== undefined) {
								classInfo.ruleblocks.set(currentBlock.symbolInformation.name, currentBlock.symbolInformation);
							}
                        }
                        break;
                    case LPLBlock.FieldRules:
                        match = fullFieldName.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.FieldRule);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
					case LPLBlock.Relation:
                        if (currentBlock.contentIndent === undefined) {
                            currentBlock.contentIndent = indent;
						}
						match = relationTargetPattern.exec(line.text);
						if (match !== null && relationInfo !== undefined) {
							relationInfo.target = match[3];
							if (match[2] === "using") {
								relationInfo.targetsRelation = true;
							}
							relationInfo = undefined;
						}
						break;
                    case LPLBlock.Condition:
                    case LPLBlock.OtherSection:
                    case LPLBlock.ActionOtherSection:                                        
                    case LPLBlock.DerivedField:
                    case LPLBlock.RuleBlock:
                    case LPLBlock.ActionLocalField:
                    case LPLBlock.ActionLocalFieldRule:
                    case LPLBlock.ActionParameter:
                    case LPLBlock.ActionParameterRule:
                    case LPLBlock.ActionRuleBlock:
                    case LPLBlock.Field:
                    case LPLBlock.FieldRule:
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
		if (classInfo === undefined) {
			return undefined;
		}
        return {symbols: result, classcache: classInfo};
    }

	// Ensure that this.parsedCache always links a document uri to the ClassCache,
	// and this.symbolCache always links a class name to a BL ClassCache, which in turn links to a UI ClassCache
	// when both are available, or links directly to a UI ClassCache if that's all that's available.
	private updateCache(document: vscode.TextDocument | SimpleDocument, toCache: ClassCache) {
		this.parsedCache.set(document.uri, toCache);
		let existingClass = this.symbolCache.get(toCache.definition.name);
		if (existingClass) {
			if (existingClass.isUI) {
				// Replace old UI cache with new class cache whether the new one is UI or BL
				this.symbolCache.set(toCache.definition.name, toCache);
				if (!toCache.isUI) {
					// If the new cache is BL, keep the old UI cache as the linked other cache
					existingClass.linkToOther = toCache;
					toCache.linkToOther = existingClass;
				}
			} else {
				if (toCache.isUI) {
					// If the new cache is UI, hang it off the existing BL as the link to other, replacing any other linked cache
					existingClass.linkToOther = toCache;
					toCache.linkToOther = existingClass;
				} else {
					// If the new cache is BL, replace the existing BL cache, but keep any existing linked UI cache
					this.symbolCache.set(toCache.definition.name, toCache);
					toCache.linkToOther = existingClass.linkToOther;
					if (existingClass.linkToOther !== null) {
						// Update link on already-existing UI cache to point back to new BL cache
						existingClass.linkToOther.linkToOther = toCache;
					}
				}
			}
		} else {
			this.symbolCache.set(toCache.definition.name, toCache);
		}
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

    private popBlock(document: vscode.TextDocument | SimpleDocument, lineNum: number, currentBlock: IndentInfo): vscode.SymbolInformation | undefined {

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
			if (currentBlock.cache !== undefined) {
				currentBlock.cache.indexSymbol(currentBlock.symbolInformation);
				if (currentBlock.blockType === LPLBlock.Form && currentBlock.formInfo !== undefined) {
					currentBlock.formInfo.definition = currentBlock.symbolInformation;
					currentBlock.cache.actionForms.set(currentBlock.symbolInformation.name, currentBlock.formInfo);
				}
			}
			return currentBlock.symbolInformation;
        }
	}
	
	private parsedCache:Map<vscode.Uri, ClassCache> = new Map();
	private symbolCache:Map<string, ClassCache> = new Map();

	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.LocationLink[]> {
		let cache = this.cacheSymbols(document, token);
		let hasContext = false;
		if (cache === undefined) {
			return;
		}
		let blCache = (cache.isUI && cache.linkToOther !== null) ? cache.linkToOther : cache;

		let wordRange = document.getWordRangeAtPosition(position);
		if (wordRange === undefined) { return; }
		let wordText = document.getText(wordRange);
		let predecessor = new vscode.Range(new vscode.Position(wordRange.start.line, wordRange.start.character-1), wordRange.start);
		if (document.getText(predecessor) === ".") {
			let contextRange = document.getWordRangeAtPosition(new vscode.Position(wordRange.start.line, wordRange.start.character - 2));
			let contextWord = document.getText(contextRange);
			let relationInfo = blCache.relations.get(contextWord);
			if (relationInfo) {
				let maxDepth = 10;
				while (relationInfo && relationInfo.targetsRelation && --maxDepth > 0 && relationInfo.target !== undefined) {
					relationInfo = blCache.relations.get(relationInfo.target);
				}
				if (relationInfo !== undefined && relationInfo.target !== undefined) {
					let otherClass = this.symbolCache.get(relationInfo.target);
					if (otherClass !== undefined) {
						blCache = otherClass;
						hasContext = true;
					}
				}
			} else {
				let classContext = this.symbolCache.get(contextWord);
				if (classContext !== undefined) {
					blCache = classContext;
					hasContext = true;
				}
			}
		}

		let includePattern = /^\s*include\s+(\w+)\s*(\/\/[^\n]*)?$/;
		let invokePattern = /^\s*invoke\s+(\w+)(\s+(\w+))?\s*(\/\/[^\n]*)?$/;

		let match = includePattern.exec(document.lineAt(position.line).text);
		let symbol: vscode.SymbolInformation | undefined;
		if (!hasContext) {
			let found = cache.findSymbolByLine(position.line);
			if (found.definitionContainsLine) {
				symbol = cache.index[found.indexIndex];
				if (symbol.kind === vscode.SymbolKind.Method) {
					let action = blCache.actions.get(symbol.name);
					if (action !== undefined) {
						if (match !== null && match[1] === wordText) {
							symbol = action.ruleblocks.get(wordText);
							if (symbol !== undefined) {
								return symbol.location;
							}
						}
						symbol = action.parameters.get(wordText) || action.fields.get(wordText);
						if (symbol !== undefined) {
							return symbol.location;
						}
					}
				} else if (symbol.kind === vscode.SymbolKind.Interface) {
					let actionForm = cache.actionForms.get(symbol.name);
					if (actionForm !== undefined && actionForm.actionName !== undefined) {
						let action = blCache.actions.get(actionForm.actionName);
						if (action !== undefined) {
							symbol = action.parameters.get(wordText) || action.fields.get(wordText);
							if (symbol !== undefined) {
								return symbol.location;
							}
						}
					}
				}
			}
		}

		if (match !== null && match[1] === wordText) {
			symbol = blCache.ruleblocks.get(wordText);
			if (symbol !== undefined) {
				return symbol.location;
			}
		}

		match = invokePattern.exec(document.lineAt(position.line).text);
		if (match !== null && match[1] === wordText) {
			let action: ActionCache | undefined;
			if (match[3]) {
				let busclass = this.symbolCache.get(match[3]);
				if (busclass) {
					action = busclass.actions.get(wordText);
				}
			}
			if (action === undefined) {
				action = blCache.actions.get(wordText);
			}
			if (action !== undefined) {
				return action.definition.location;
			}
		}

		let relation = blCache.relations.get(wordText);
		if (relation !== undefined) {
			symbol = relation.definition;
		} else {
			let field = blCache.fields.get(wordText);
			if (field !== undefined) {
				symbol = field.definition;
			}
		}
		if (symbol !== undefined) {
			return symbol.location;
		}
	}

	provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
		let cache = this.cacheSymbols(document, token);
		let hasContext = false;
		if (cache === undefined) {
			return;
		}

		let wordRange = document.getWordRangeAtPosition(position);
		if (wordRange === undefined) { return; }
		let wordText = document.getText(wordRange);
		let predecessor = new vscode.Range(new vscode.Position(wordRange.start.line, wordRange.start.character-1), wordRange.start);
		if (document.getText(predecessor) === ".") {
			let contextRange = document.getWordRangeAtPosition(new vscode.Position(wordRange.start.line, wordRange.start.character - 2));
			let contextWord = document.getText(contextRange);
			let relationInfo = cache.relations.get(contextWord);
			if (relationInfo) {
				let maxDepth = 10;
				while (relationInfo && relationInfo.targetsRelation && --maxDepth > 0 && relationInfo.target !== undefined) {
					relationInfo = cache.relations.get(relationInfo.target);
				}
				if (relationInfo !== undefined && relationInfo.target !== undefined) {
					let otherClass = this.symbolCache.get(relationInfo.target);
					if (otherClass !== undefined) {
						cache = otherClass;
						hasContext = true;
					}
				}
			} else {
				let classContext = this.symbolCache.get(contextWord);
				if (classContext !== undefined) {
					cache = classContext;
					hasContext = true;
				}
			}
		}

		let symbol: vscode.SymbolInformation | undefined;
		if (!hasContext) {
			let found = cache.findSymbolByLine(position.line);
			if (found.definitionContainsLine) {
				symbol = cache.index[found.indexIndex];
				if (symbol.kind === vscode.SymbolKind.Method) {
					let action = cache.actions.get(symbol.name);
					if (action !== undefined) {
						symbol = action.parameters.get(wordText) || action.fields.get(wordText);
						if (symbol !== undefined) {
							return new vscode.Hover(document.lineAt(symbol.location.range.start.line).text.trim());
						}
					}
				}
			}
		}

		let field = cache.fields.get(wordText);
		if (field !== undefined) {
			return new vscode.Hover(field.hoverText);
		}
	}
}