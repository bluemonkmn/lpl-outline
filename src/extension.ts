// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { BusinessClassDocumentSymbolProvider, SimpleDocument } from './documentSymbolProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
		console.log('LPL Outline extension is now active.');

	let channel = vscode.window.createOutputChannel("LPL Log");

	let diagnostics = vscode.languages.createDiagnosticCollection("lpl");

	let symbolProvider = new BusinessClassDocumentSymbolProvider();
	symbolProvider.diagnostics = diagnostics;
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(
		[
			{ language: 'busclass', pattern: '**/*.busclass' },
			{ language: 'busclass', scheme: 'untitled'},
			{ language: 'keyfield', pattern: '**/*.keyfield' },
			{ language: 'keyfield', scheme: 'untitled' }
		],
		symbolProvider));

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(
		[
			{ language: 'busclass', pattern: '**/*.busclass' },
			{ language: 'busclass', scheme: 'untitled'},
			{ language: 'keyfield', pattern: '**/*.keyfield' },
			{ language: 'keyfield', scheme: 'untitled'}
		]
	, symbolProvider));

	context.subscriptions.push(vscode.languages.registerHoverProvider(
		[
			{ language: 'busclass', pattern: '**/*.busclass' },
			{ language: 'busclass', scheme: 'untitled'},
			{ language: 'keyfield', pattern: '**/*.keyfield' },
			{ language: 'keyfield', scheme: 'untitled'}
		]
	, symbolProvider));

	context.subscriptions.push(vscode.commands.registerCommand('lpl.enabledActionsReport', () => {
		let te = vscode.window.activeTextEditor;
		if (te !== undefined) {
			symbolProvider.generateEnabledActionReport(te.document, channel);
		}
	}));

	let status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	status.text = "$(tasklist) Parsing *.busclass files...";
	status.show();

	vscode.workspace.findFiles("**/*.busclass").then((files) => {
		let loader: Promise<void>[] = [];
		for(let file of files) {
			loader.push(SimpleDocument.getSimpleDocument(file).then((doc) => {
				status.text = `$(tasklist) Parsing ${file.fsPath}`;
				console.log(`Parsing ${file.fsPath}`);
				symbolProvider.cacheSymbols(doc);
			}).catch((err) => {
				status.text = `$(alert) Unable to open ${file}: ${err}`;
				console.log(err);
			}));
		}
		Promise.all(loader).then((value) => {
			status.text = `$(tasklist) Parsing *.keyfield files...`;
			console.log(`$(tasklist) Parsing *.keyfield files...`);
			vscode.workspace.findFiles("**/*.keyfield").then((files) => {
				loader = [];
				for(let file of files) {
					loader.push(SimpleDocument.getSimpleDocument(file).then((doc) => {
						status.text = `$(tasklist) Parsing ${file.fsPath}`;
						console.log(`Parsing ${file.fsPath}`);
						symbolProvider.cacheKeyField(doc);
					}));
				}
				Promise.all(loader).then((value) => {
					status.text = "Validating Import Fields...";
					symbolProvider.checkImportClasses(channel);
					status.dispose();
					console.log("Done parsing files");	
				});
			});
		});
	});
}

// this method is called when your extension is deactivated
export function deactivate() {}
