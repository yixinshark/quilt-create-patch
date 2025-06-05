"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const fsPromises = fs.promises;
// 创建输出通道
let outputChannel;
async function getGitModifiedFiles(workspaceFolder) {
    try {
        outputChannel.appendLine('\n=== Getting modified files from git ===');
        const { stdout } = await execAsync('git status --porcelain', {
            cwd: workspaceFolder.uri.fsPath
        });
        // 解析git status输出
        const files = stdout
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
            const status = line.slice(0, 2).trim();
            const file = line.slice(3);
            return { status, file };
        })
            .filter(({ status }) => {
            // 只包含修改(M)、添加(A)和未跟踪(??)的文件
            return status === 'M' || status === 'A' || status === '??';
        });
        outputChannel.appendLine(`Found ${files.length} modified files:`);
        for (const { file, status } of files) {
            outputChannel.appendLine(`  ${status} ${file}`);
        }
        return files;
    }
    catch (error) {
        outputChannel.appendLine(`Error getting modified files from git: ${error}`);
        return [];
    }
}
async function checkQuiltStatus(workspaceFolder) {
    try {
        outputChannel.appendLine('\n=== Checking Quilt Status ===');
        // 检查patches目录
        const patchesDir = path.join(workspaceFolder.uri.fsPath, 'patches');
        try {
            const stats = await fsPromises.stat(patchesDir);
            outputChannel.appendLine(`patches directory exists: ${stats.isDirectory()}`);
        }
        catch (error) {
            outputChannel.appendLine(`patches directory does not exist: ${error}`);
        }
        // 检查.pc目录
        const pcDir = path.join(workspaceFolder.uri.fsPath, '.pc');
        try {
            const stats = await fsPromises.stat(pcDir);
            outputChannel.appendLine(`.pc directory exists: ${stats.isDirectory()}`);
        }
        catch (error) {
            outputChannel.appendLine(`.pc directory does not exist: ${error}`);
        }
        // 检查series文件
        const seriesFile = path.join(workspaceFolder.uri.fsPath, 'patches/series');
        try {
            const content = await fsPromises.readFile(seriesFile, 'utf8');
            outputChannel.appendLine(`series file content:\n${content}`);
        }
        catch (error) {
            outputChannel.appendLine(`Failed to read series file: ${error}`);
        }
        // 运行quilt top
        try {
            const { stdout: topOutput } = await execAsync('quilt top', {
                cwd: workspaceFolder.uri.fsPath
            });
            outputChannel.appendLine(`Current top patch: ${topOutput.trim()}`);
        }
        catch (error) {
            outputChannel.appendLine(`Failed to get top patch: ${error}`);
        }
        // 运行quilt series
        try {
            const { stdout: seriesOutput } = await execAsync('quilt series', {
                cwd: workspaceFolder.uri.fsPath
            });
            outputChannel.appendLine(`Patch series:\n${seriesOutput}`);
        }
        catch (error) {
            outputChannel.appendLine(`Failed to get patch series: ${error}`);
        }
        outputChannel.appendLine('=== End of Quilt Status ===\n');
    }
    catch (error) {
        outputChannel.appendLine(`Error checking quilt status: ${error}`);
    }
}
async function runQuiltCommand(command, cwd) {
    try {
        outputChannel.appendLine(`Running quilt command: ${command} in directory: ${cwd}`);
        const { stdout, stderr } = await execAsync(command, { cwd });
        if (stderr) {
            outputChannel.appendLine(`Command stderr: ${stderr}`);
        }
        outputChannel.appendLine(`Command stdout: ${stdout}`);
        // 检查命令是否成功执行
        const checkResult = await execAsync(`echo $?`, { cwd });
        outputChannel.appendLine(`Command exit code: ${checkResult.stdout.trim()}`);
        // 检查patches目录中的文件
        try {
            const { stdout: lsOutput } = await execAsync('ls -la patches/', { cwd });
            outputChannel.appendLine(`Contents of patches directory:\n${lsOutput}`);
        }
        catch (error) {
            outputChannel.appendLine(`Failed to list patches directory: ${error}`);
        }
        return stdout;
    }
    catch (error) {
        outputChannel.appendLine(`Error running command '${command}': ${error}`);
        throw error;
    }
}
async function backupFile(filePath) {
    try {
        const backupPath = `${filePath}.orig`;
        await fsPromises.copyFile(filePath, backupPath);
        outputChannel.appendLine(`Created backup of ${filePath} at ${backupPath}`);
    }
    catch (error) {
        outputChannel.appendLine(`Error creating backup of ${filePath}: ${error}`);
        throw error;
    }
}
async function restoreFile(filePath) {
    try {
        const backupPath = `${filePath}.orig`;
        await fsPromises.copyFile(backupPath, filePath);
        await fsPromises.unlink(backupPath);
        outputChannel.appendLine(`Restored ${filePath} from backup and removed backup file`);
    }
    catch (error) {
        outputChannel.appendLine(`Error restoring ${filePath}: ${error}`);
        throw error;
    }
}
async function getFileContent(filePath) {
    try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        return content;
    }
    catch (error) {
        outputChannel.appendLine(`Error reading file ${filePath}: ${error}`);
        throw error;
    }
}
async function getGitFileContent(absoluteFilePath, workspaceFolder) {
    try {
        const relativePathForGit = path.relative(workspaceFolder.uri.fsPath, absoluteFilePath);
        // outputChannel.appendLine(`Getting Git HEAD content for (relative to repo root): ./${relativePathForGit}`);
        // Construct command carefully for execAsync
        const gitShowCommand = `git show "HEAD:./${relativePathForGit.replace(/"/g, '\\"')}"`;
        const { stdout } = await execAsync(gitShowCommand, {
            cwd: workspaceFolder.uri.fsPath
        });
        return stdout;
    }
    catch (error) {
        outputChannel.appendLine(`Error getting git content for ${absoluteFilePath}: ${error}`);
        throw error; // Re-throw to be caught by the processing loop, which will treat originalContent as empty.
    }
}
async function writeFileContent(filePath, content) {
    try {
        await fsPromises.writeFile(filePath, content, 'utf8');
        outputChannel.appendLine(`Wrote content to file ${filePath}`);
    }
    catch (error) {
        outputChannel.appendLine(`Error writing file ${filePath}: ${error}`);
        throw error;
    }
}
async function cleanQuiltState(workspaceFolder) {
    try {
        outputChannel.appendLine('\n=== Cleaning quilt state ===');
        // 尝试弹出所有patch
        try {
            await execAsync('quilt pop -af', { cwd: workspaceFolder.uri.fsPath });
            outputChannel.appendLine('Successfully popped all patches');
        }
        catch (error) {
            outputChannel.appendLine(`Note: No patches to pop (${error})`);
        }
        // 删除现有的patches目录和.pc目录
        const patchesDir = path.join(workspaceFolder.uri.fsPath, 'patches');
        const pcDir = path.join(workspaceFolder.uri.fsPath, '.pc');
        try {
            await fsPromises.rm(patchesDir, { recursive: true, force: true });
            outputChannel.appendLine('Removed patches directory');
        }
        catch (error) {
            outputChannel.appendLine(`Note: Could not remove patches directory (${error})`);
        }
        try {
            await fsPromises.rm(pcDir, { recursive: true, force: true });
            outputChannel.appendLine('Removed .pc directory');
        }
        catch (error) {
            outputChannel.appendLine(`Note: Could not remove .pc directory (${error})`);
        }
        // 重新创建patches目录
        try {
            await fsPromises.mkdir(patchesDir, { recursive: true });
            outputChannel.appendLine('Created fresh patches directory');
        }
        catch (error) {
            outputChannel.appendLine(`Error creating patches directory: ${error}`);
            throw error;
        }
        outputChannel.appendLine('Quilt state cleaned');
    }
    catch (error) {
        outputChannel.appendLine(`Error cleaning quilt state: ${error}`);
        throw error;
    }
}
function activate(context) {
    // 创建输出通道
    outputChannel = vscode.window.createOutputChannel('Quilt Patch Creator');
    // 显示输出面板并清除之前的内容
    outputChannel.clear();
    outputChannel.show(true); // true 表示强制获取焦点
    // 添加明显的激活信息
    outputChannel.appendLine('==========================================');
    outputChannel.appendLine('   Quilt Patch Creator is now active!    ');
    outputChannel.appendLine('==========================================');
    outputChannel.appendLine('');
    outputChannel.appendLine('To use this extension:');
    outputChannel.appendLine('1. Open Command Palette (Ctrl+Shift+P)');
    outputChannel.appendLine('2. Type "Create Patch using Quilt"');
    outputChannel.appendLine('');
    // 显示一个通知
    vscode.window.showInformationMessage('Quilt Patch Creator is ready! Check the output panel for details.');
    // 注册命令
    let disposable = vscode.commands.registerCommand('quilt-patch-extension.createPatch', async () => {
        try {
            // 确保输出面板可见
            outputChannel.show(true);
            outputChannel.appendLine('==========================================');
            outputChannel.appendLine('   Starting patch creation process...    ');
            outputChannel.appendLine('==========================================');
            // 检查quilt是否安装
            try {
                const { stdout } = await execAsync('which quilt');
                outputChannel.appendLine(`Found quilt at: ${stdout.trim()}`);
                // 检查quilt版本
                const { stdout: versionOutput } = await execAsync('quilt --version');
                outputChannel.appendLine(`Quilt version: ${versionOutput.trim()}`);
            }
            catch (error) {
                const message = 'Quilt is not installed. Please install quilt first.';
                outputChannel.appendLine(`Error: ${message}`);
                outputChannel.appendLine(`Details: ${error}`);
                vscode.window.showErrorMessage(message);
                return;
            }
            // 获取工作区
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                const message = 'No workspace folder found. Please open a folder first.';
                outputChannel.appendLine(`Error: ${message}`);
                vscode.window.showErrorMessage(message);
                return;
            }
            outputChannel.appendLine(`Working in directory: ${workspaceFolder.uri.fsPath}`);
            // 获取git修改的文件
            const modifiedFiles = await getGitModifiedFiles(workspaceFolder);
            if (!modifiedFiles.length) {
                const message = 'No modified files found in git status';
                outputChannel.appendLine(message);
                vscode.window.showWarningMessage(message);
                return;
            }
            // 让用户选择要包含在patch中的文件
            const fileItems = modifiedFiles.map(({ file, status }) => ({
                label: file,
                description: status, // 显示文件状态
                picked: true // 默认选中所有修改的文件
            }));
            const selectedItems = await vscode.window.showQuickPick(fileItems, {
                canPickMany: true,
                placeHolder: 'Select files to include in the patch (modified files from git status)'
            });
            if (!selectedItems || selectedItems.length === 0) {
                const message = 'No files selected';
                outputChannel.appendLine(message);
                vscode.window.showInformationMessage(message);
                return;
            }
            outputChannel.appendLine(`Selected files: ${selectedItems.map(item => item.label).join(', ')}`);
            // 获取patch名称
            const patchName = await vscode.window.showInputBox({
                placeHolder: 'Enter patch name (without .patch extension)',
                prompt: 'Please enter a name for the patch',
                validateInput: (value) => {
                    if (!value) {
                        return 'Patch name cannot be empty';
                    }
                    if (value.includes('/') || value.includes('\\')) {
                        return 'Patch name cannot contain path separators';
                    }
                    if (value.endsWith('.patch')) {
                        return 'Do not include .patch extension';
                    }
                    return null;
                }
            });
            if (!patchName) {
                const message = 'No patch name provided';
                outputChannel.appendLine(message);
                vscode.window.showInformationMessage(message);
                return;
            }
            outputChannel.appendLine(`Patch name: ${patchName}`);
            // 清理quilt状态
            await cleanQuiltState(workspaceFolder);
            // 初始化quilt环境
            outputChannel.appendLine('\n=== Initializing quilt ===');
            await runQuiltCommand('quilt init', workspaceFolder.uri.fsPath);
            // 创建新的patch
            outputChannel.appendLine(`\n=== Creating new patch: ${patchName}.patch ===`);
            await runQuiltCommand(`quilt new ${patchName}.patch`, workspaceFolder.uri.fsPath);
            // 添加所有选中的文件到patch
            for (const item of selectedItems) {
                const relativeFilePath = item.label;
                const absoluteFilePath = path.join(workspaceFolder.uri.fsPath, relativeFilePath);
                outputChannel.appendLine(`\n=== Processing file: ${relativeFilePath} ===`);
                try {
                    const currentContentBuffer = await fsPromises.readFile(absoluteFilePath);
                    const currentContent = currentContentBuffer.toString('utf8');
                    outputChannel.appendLine('Current file content (first 200 chars):');
                    outputChannel.appendLine(currentContent.substring(0, 200) + (currentContent.length > 200 ? '...' : ''));
                    let originalContent = '';
                    try {
                        originalContent = await getGitFileContent(absoluteFilePath, workspaceFolder);
                        outputChannel.appendLine('Git HEAD content (first 200 chars):');
                        outputChannel.appendLine(originalContent.substring(0, 200) + (originalContent.length > 200 ? '...' : ''));
                        if (currentContent === originalContent) {
                            outputChannel.appendLine('INFO: File content matches git HEAD content.');
                        }
                        else {
                            outputChannel.appendLine('File content differs from git HEAD.');
                        }
                    }
                    catch (error) {
                        // Error is logged by getGitFileContent, here we just ensure originalContent is empty for new/unreadable files.
                        outputChannel.appendLine(`Proceeding with empty original content for ${relativeFilePath} due to previous error.`);
                        originalContent = '';
                    }
                    // 1. Write original content to file for quilt add
                    await writeFileContent(absoluteFilePath, originalContent);
                    // outputChannel.appendLine(`Temporarily wrote original content to ${relativeFilePath} for quilt add.`);
                    // 2. 添加文件到patch
                    outputChannel.appendLine('\n=== Adding file to patch ===');
                    const addCommand = `quilt add "${relativeFilePath.replace(/"/g, '\\"')}"`;
                    await runQuiltCommand(addCommand, workspaceFolder.uri.fsPath);
                    // 3. Restore modified content to file for quilt refresh
                    await writeFileContent(absoluteFilePath, currentContent);
                    // outputChannel.appendLine(`Restored modified content to ${relativeFilePath}.`);
                    // Informational: Check Quilt's own backup.
                    const quiltPatchSpecificBackupDir = path.join(workspaceFolder.uri.fsPath, '.pc', `${patchName}.patch`);
                    const quiltBackedUpFile = path.join(quiltPatchSpecificBackupDir, relativeFilePath);
                    try {
                        await getFileContent(quiltBackedUpFile);
                        // outputChannel.appendLine(`Confirmed Quilt's copy for patch exists: ${quiltBackedUpFile}`);
                    }
                    catch (error) {
                        // outputChannel.appendLine(`Note: Could not read Quilt's own backup copy from ${quiltBackedUpFile}. This is informational.`);
                    }
                }
                catch (error) {
                    const errorMessage = `Error processing file ${relativeFilePath}: ${error instanceof Error ? error.message : String(error)}`;
                    outputChannel.appendLine(errorMessage);
                    vscode.window.showErrorMessage(errorMessage);
                    // Decide if we should continue with other files or stop. For now, it continues.
                }
            }
            // 刷新patch
            outputChannel.appendLine('\n=== Refreshing patch ===');
            await runQuiltCommand('quilt refresh', workspaceFolder.uri.fsPath);
            outputChannel.appendLine('Patch creation completed');
        }
        catch (error) {
            outputChannel.appendLine(`Error in patch creation: ${error}`);
            vscode.window.showErrorMessage('An error occurred while creating the patch. Please check the output panel for details.');
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=extension.js.map