import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const execAsync = promisify(exec);
const fsPromises = fs.promises;

// 创建输出通道
let outputChannel: vscode.OutputChannel;

// 用于备份和恢复工作区文件
interface FileBackup {
    path: string;
    content: string;
}

async function getGitModifiedFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<Array<{file: string, status: string}>> {
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
    } catch (error) {
        outputChannel.appendLine(`Error getting modified files from git: ${error}`);
        return [];
    }
}

async function checkQuiltStatus(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    try {
        outputChannel.appendLine('\n=== Checking Quilt Status ===');
        
        // 检查patches目录
        const patchesDir = path.join(workspaceFolder.uri.fsPath, 'patches');
        try {
            const stats = await fsPromises.stat(patchesDir);
            outputChannel.appendLine(`patches directory exists: ${stats.isDirectory()}`);
        } catch (error) {
            outputChannel.appendLine(`patches directory does not exist: ${error}`);
        }

        // 检查.pc目录
        const pcDir = path.join(workspaceFolder.uri.fsPath, '.pc');
        try {
            const stats = await fsPromises.stat(pcDir);
            outputChannel.appendLine(`.pc directory exists: ${stats.isDirectory()}`);
        } catch (error) {
            outputChannel.appendLine(`.pc directory does not exist: ${error}`);
        }

        // 检查series文件
        const seriesFile = path.join(workspaceFolder.uri.fsPath, 'patches/series');
        try {
            const content = await fsPromises.readFile(seriesFile, 'utf8');
            outputChannel.appendLine(`series file content:\n${content}`);
        } catch (error) {
            outputChannel.appendLine(`Failed to read series file: ${error}`);
        }

        // 运行quilt top
        try {
            const { stdout: topOutput } = await execAsync('quilt top', { 
                cwd: workspaceFolder.uri.fsPath 
            });
            outputChannel.appendLine(`Current top patch: ${topOutput.trim()}`);
        } catch (error) {
            outputChannel.appendLine(`Failed to get top patch: ${error}`);
        }

        // 运行quilt series
        try {
            const { stdout: seriesOutput } = await execAsync('quilt series', { 
                cwd: workspaceFolder.uri.fsPath 
            });
            outputChannel.appendLine(`Patch series:\n${seriesOutput}`);
        } catch (error) {
            outputChannel.appendLine(`Failed to get patch series: ${error}`);
        }

        outputChannel.appendLine('=== End of Quilt Status ===\n');
    } catch (error) {
        outputChannel.appendLine(`Error checking quilt status: ${error}`);
    }
}

async function runQuiltCommand(command: string, cwd: string): Promise<string> {
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

        // 特殊处理quilt refresh命令
        if (command === 'quilt refresh') {
            // 检查patches目录中的文件
            try {
                const { stdout: lsOutput } = await execAsync('ls -la patches/', { cwd });
                outputChannel.appendLine(`Contents of patches directory:\n${lsOutput}`);
                
                // 检查patches目录中的文件内容
                const { stdout: patchesFiles } = await execAsync('find patches -type f | grep -v series', { cwd });
                const patchFiles = patchesFiles.trim().split('\n').filter(f => f);
                
                for (const patchFile of patchFiles) {
                    try {
                        const { stdout: patchContent } = await execAsync(`cat "${patchFile}"`, { cwd });
                        outputChannel.appendLine(`\nContent of patch file ${patchFile}:\n${patchContent}`);
                        
                        if (!patchContent.trim()) {
                            outputChannel.appendLine(`WARNING: Patch file ${patchFile} is empty!`);
                        }
                    } catch (error) {
                        outputChannel.appendLine(`Error reading patch file ${patchFile}: ${error}`);
                    }
                }
            } catch (error) {
                outputChannel.appendLine(`Failed to list patches directory: ${error}`);
            }
            
            // 检查quilt status
            try {
                const { stdout: statusOutput } = await execAsync('quilt status', { cwd });
                outputChannel.appendLine(`\nQuilt status:\n${statusOutput}`);
            } catch (error) {
                outputChannel.appendLine(`Failed to get quilt status: ${error}`);
            }
        }

        return stdout;
    } catch (error) {
        outputChannel.appendLine(`Error running command '${command}': ${error}`);
        throw error;
    }
}

async function backupFile(filePath: string): Promise<void> {
    try {
        const backupPath = `${filePath}.orig`;
        await fsPromises.copyFile(filePath, backupPath);
        outputChannel.appendLine(`Created backup of ${filePath} at ${backupPath}`);
    } catch (error) {
        outputChannel.appendLine(`Error creating backup of ${filePath}: ${error}`);
        throw error;
    }
}

async function restoreFile(filePath: string): Promise<void> {
    try {
        const backupPath = `${filePath}.orig`;
        await fsPromises.copyFile(backupPath, filePath);
        await fsPromises.unlink(backupPath);
        outputChannel.appendLine(`Restored ${filePath} from backup and removed backup file`);
    } catch (error) {
        outputChannel.appendLine(`Error restoring ${filePath}: ${error}`);
        throw error;
    }
}

async function getFileContent(filePath: string): Promise<string> {
    try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        return content;
    } catch (error) {
        outputChannel.appendLine(`Error reading file ${filePath}: ${error}`);
        throw error;
    }
}

async function getGitFileContent(absoluteFilePath: string, workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
    try {
        const relativePathForGit = path.relative(workspaceFolder.uri.fsPath, absoluteFilePath);
        // outputChannel.appendLine(`Getting Git HEAD content for (relative to repo root): ./${relativePathForGit}`);
        
        // Construct command carefully for execAsync
        const gitShowCommand = `git show "HEAD:./${relativePathForGit.replace(/"/g, '\\"')}"`;

        const { stdout } = await execAsync(gitShowCommand, {
            cwd: workspaceFolder.uri.fsPath
        });
        return stdout;
    } catch (error) {
        outputChannel.appendLine(`Error getting git content for ${absoluteFilePath}: ${error}`);
        throw error; // Re-throw to be caught by the processing loop, which will treat originalContent as empty.
    }
}

// 检查文件是否有实际修改
async function hasRealChanges(currentContent: string, originalContent: string, filePath: string, workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    // 首先检查与Git HEAD的差异
    if (currentContent !== originalContent) {
        outputChannel.appendLine(`File ${filePath} has changes compared to git HEAD`);
        return true;
    }
    
    // 如果与HEAD相同，检查是否存在未提交的修改
    try {
        const relativePathForGit = path.relative(workspaceFolder.uri.fsPath, filePath);
        const { stdout } = await execAsync(`git diff -- "${relativePathForGit.replace(/"/g, '\\"')}"`, {
            cwd: workspaceFolder.uri.fsPath
        });
        
        if (stdout.trim()) {
            outputChannel.appendLine(`File ${filePath} has uncommitted changes in git`);
            return true;
        }
    } catch (error) {
        outputChannel.appendLine(`Error checking git diff for ${filePath}: ${error}`);
    }
    
    // 检查文件的更改历史
    try {
        const { stdout } = await execAsync(`git log -p -1 -- "${path.relative(workspaceFolder.uri.fsPath, filePath).replace(/"/g, '\\"')}"`, {
            cwd: workspaceFolder.uri.fsPath
        });
        
        if (stdout.includes('+') || stdout.includes('-')) {
            outputChannel.appendLine(`File ${filePath} has recent changes in git history`);
            return true;
        }
    } catch (error) {
        outputChannel.appendLine(`Error checking git history for ${filePath}: ${error}`);
    }
    
    outputChannel.appendLine(`No real changes detected for ${filePath}`);
    return false;
}

async function writeFileContent(filePath: string, content: string): Promise<void> {
    try {
        await fsPromises.writeFile(filePath, content, 'utf8');
        outputChannel.appendLine(`Wrote content to file ${filePath}`);
    } catch (error) {
        outputChannel.appendLine(`Error writing file ${filePath}: ${error}`);
        throw error;
    }
}

async function cleanQuiltState(workspaceFolder: vscode.WorkspaceFolder, patchesDir: string): Promise<void> {
    try {
        outputChannel.appendLine('\n=== Cleaning quilt state ===');
        
        // 尝试弹出所有patch
        try {
            await execAsync('quilt pop -af', { cwd: workspaceFolder.uri.fsPath });
            outputChannel.appendLine('Successfully popped all patches');
        } catch (error) {
            outputChannel.appendLine(`Note: No patches to pop (${error})`);
        }

        // 删除.pc目录，但保留patches目录
        const pcDir = path.join(workspaceFolder.uri.fsPath, '.pc');
        
        try {
            await fsPromises.rm(pcDir, { recursive: true, force: true });
            outputChannel.appendLine('Removed .pc directory');
        } catch (error) {
            outputChannel.appendLine(`Note: Could not remove .pc directory (${error})`);
        }

        // 确保patches目录存在
        try {
            await fsPromises.mkdir(patchesDir, { recursive: true });
            outputChannel.appendLine(`Ensured patches directory exists: ${patchesDir}`);
        } catch (error) {
            // 如果目录已存在，这是正常的
            outputChannel.appendLine(`Note: Patches directory already exists: ${patchesDir}`);
        }

        outputChannel.appendLine('Quilt state cleaned');
    } catch (error) {
        outputChannel.appendLine(`Error cleaning quilt state: ${error}`);
        throw error;
    }
}

// 添加一个调试函数，单独测试quilt patch创建过程
async function testQuiltProcess(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    try {
        outputChannel.appendLine('\n=== TESTING QUILT PROCESS ===');
        
        // 检查debian目录
        const { exists: debianExists, patchesDir, seriesFile } = await checkDebianPatches(workspaceFolder);
        if (debianExists) {
            outputChannel.appendLine(`Using debian patches directory: ${patchesDir}`);
        } else {
            outputChannel.appendLine(`Using standard patches directory: ${patchesDir}`);
        }
        
        // 创建测试文件和目录
        const testDir = path.join(workspaceFolder.uri.fsPath, 'quilt_test');
        const testFile = path.join(testDir, 'test_file.txt');
        
        try {
            await fsPromises.mkdir(testDir, { recursive: true });
            outputChannel.appendLine(`Created test directory: ${testDir}`);
        } catch (error) {
            outputChannel.appendLine(`Note: Could not create test directory (${error})`);
        }
        
        // 创建初始文件内容
        const originalContent = 'original content for testing';
        await fsPromises.writeFile(testFile, originalContent, 'utf8');
        outputChannel.appendLine(`Created test file with original content: ${testFile}`);
        
        // 初始化git仓库并提交文件
        await execAsync('git init', { cwd: testDir });
        await execAsync('git config --local user.email "test@example.com"', { cwd: testDir });
        await execAsync('git config --local user.name "Test User"', { cwd: testDir });
        await execAsync('git add test_file.txt', { cwd: testDir });
        await execAsync('git commit -m "Initial commit"', { cwd: testDir });
        outputChannel.appendLine('Initialized git repository and committed test file');
        
        // 修改文件
        const modifiedContent = 'modified content for testing';
        await fsPromises.writeFile(testFile, modifiedContent, 'utf8');
        outputChannel.appendLine(`Modified test file content: ${testFile}`);
        
        // 设置QUILT_PATCHES环境变量
        const quiltrcContent = `QUILT_PATCHES=${path.relative(testDir, patchesDir)}`;
        const quiltrcPath = path.join(testDir, '.quiltrc');
        await fsPromises.writeFile(quiltrcPath, quiltrcContent, 'utf8');
        outputChannel.appendLine(`Created .quiltrc file with content: ${quiltrcContent}`);
        
        // 运行quilt命令
        await execAsync('quilt init', { cwd: testDir });
        outputChannel.appendLine('Initialized quilt');
        
        await execAsync('quilt new test.patch', { cwd: testDir });
        outputChannel.appendLine('Created new patch: test.patch');
        
        // 备份当前修改的内容
        const currentContent = await fsPromises.readFile(testFile, 'utf8');
        
        // 获取原始内容
        const { stdout: originalFromGit } = await execAsync('git show HEAD:./test_file.txt', { cwd: testDir });
        outputChannel.appendLine(`Original content from git: ${originalFromGit.trim()}`);
        
        // 写入原始内容
        await fsPromises.writeFile(testFile, originalFromGit, 'utf8');
        outputChannel.appendLine('Wrote original content to file');
        
        // 添加文件到quilt
        await execAsync('quilt add test_file.txt', { cwd: testDir });
        outputChannel.appendLine('Added file to quilt patch');
        
        // 写入修改后的内容
        await fsPromises.writeFile(testFile, currentContent, 'utf8');
        outputChannel.appendLine('Wrote modified content back to file');
        
        // 刷新patch
        await execAsync('quilt refresh', { cwd: testDir });
        outputChannel.appendLine('Refreshed patch');
        
        // 检查patch内容
        const patchFile = path.join(patchesDir, 'test.patch');
        const patchContent = await fsPromises.readFile(patchFile, 'utf8');
        outputChannel.appendLine(`\nPatch content:\n${patchContent}`);
        
        outputChannel.appendLine('\n=== TEST COMPLETED SUCCESSFULLY ===');
    } catch (error) {
        outputChannel.appendLine(`\n=== TEST FAILED: ${error} ===`);
    }
}

// 备份所有修改过的文件
async function backupWorkspaceFiles(selectedFiles: string[], workspaceFolder: vscode.WorkspaceFolder): Promise<FileBackup[]> {
    const backups: FileBackup[] = [];
    
    for (const relativeFilePath of selectedFiles) {
        try {
            const absoluteFilePath = path.join(workspaceFolder.uri.fsPath, relativeFilePath);
            const content = await fsPromises.readFile(absoluteFilePath, 'utf8');
            backups.push({ path: absoluteFilePath, content });
            outputChannel.appendLine(`Backed up content of ${relativeFilePath}`);
        } catch (error) {
            outputChannel.appendLine(`Error backing up file ${relativeFilePath}: ${error}`);
        }
    }
    
    return backups;
}

// 恢复所有备份的文件
async function restoreWorkspaceFiles(backups: FileBackup[]): Promise<void> {
    for (const backup of backups) {
        try {
            await fsPromises.writeFile(backup.path, backup.content, 'utf8');
            outputChannel.appendLine(`Restored content of ${path.basename(backup.path)}`);
        } catch (error) {
            outputChannel.appendLine(`Error restoring file ${backup.path}: ${error}`);
        }
    }
}

// 生成差异并创建patch文件
async function generatePatchContent(originalContent: string, modifiedContent: string, relativePath: string, workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
    // 获取工作区根目录名称（用于正确格式的索引路径）
    const workspaceDirName = path.basename(workspaceFolder.uri.fsPath);
    
    // 创建临时文件用于生成diff
    const tempDir = path.join(os.tmpdir(), 'quilt-patch-creator');
    const tempOrigFile = path.join(tempDir, 'orig-file');
    const tempModFile = path.join(tempDir, 'mod-file');
    
    try {
        // 确保临时目录存在
        await fsPromises.mkdir(tempDir, { recursive: true });
        
        // 写入原始内容和修改后的内容到临时文件
        await fsPromises.writeFile(tempOrigFile, originalContent, 'utf8');
        await fsPromises.writeFile(tempModFile, modifiedContent, 'utf8');
        
        // 使用外部diff命令生成差异
        const { stdout: diffOutput } = await execAsync(`diff -u "${tempOrigFile}" "${tempModFile}"`, { 
            cwd: workspaceFolder.uri.fsPath 
        }).catch(error => {
            // diff命令发现差异时会返回非零状态码，这是正常的
            if (error.code === 1 && error.stdout) {
                return { stdout: error.stdout };
            }
            throw error;
        });
        
        // 处理diff输出为quilt patch格式
        if (diffOutput && diffOutput.trim()) {
            const lines = diffOutput.split('\n');
            let patchContent = '';
            
            // 跳过前两行（--- a/tempFile和+++ b/tempFile）
            for (let i = 2; i < lines.length; i++) {
                patchContent += lines[i] + '\n';
            }
            
            // 构建最终patch
            const finalPatch = `Index: ${workspaceDirName}/${relativePath}\n` +
                               '===================================================================\n' +
                               `--- ${workspaceDirName}.orig/${relativePath}\n` +
                               `+++ ${workspaceDirName}/${relativePath}\n` +
                               patchContent;
            
            outputChannel.appendLine(`Generated diff for ${relativePath} using external diff command`);
            return finalPatch;
        }
        
        // 如果没有找到差异，尝试使用git diff
        try {
            // 检查工作目录中的文件是否与HEAD不同
            const relativePathForGit = path.relative(workspaceFolder.uri.fsPath, path.join(workspaceFolder.uri.fsPath, relativePath));
            const { stdout: gitDiff } = await execAsync(`git diff --no-color HEAD -- "${relativePathForGit.replace(/"/g, '\\"')}"`, { 
                cwd: workspaceFolder.uri.fsPath 
            });
            
            if (gitDiff && gitDiff.trim()) {
                // 处理git diff输出，修改为符合quilt patch的格式
                const lines = gitDiff.split('\n');
                let patchContent = '';
                let inHeader = true;
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    
                    // 跳过git diff特有的前几行
                    if (inHeader && (line.startsWith('diff --git') || line.startsWith('index ') || 
                                    line.startsWith('new file') || line.startsWith('deleted file'))) {
                        continue;
                    }
                    
                    // 处理文件路径
                    if (line.startsWith('---') || line.startsWith('+++')) {
                        inHeader = false;
                        
                        if (line.startsWith('---')) {
                            patchContent += `--- ${workspaceDirName}.orig/${relativePath}\n`;
                        } else {
                            patchContent += `+++ ${workspaceDirName}/${relativePath}\n`;
                        }
                        continue;
                    }
                    
                    // 添加其他行
                    if (!inHeader) {
                        patchContent += line + '\n';
                    }
                }
                
                // 添加索引行
                const finalPatch = `Index: ${workspaceDirName}/${relativePath}\n` +
                                  '===================================================================\n' +
                                  patchContent;
                
                outputChannel.appendLine(`Generated patch from git diff for ${relativePath}`);
                return finalPatch;
            }
        } catch (error) {
            outputChannel.appendLine(`Error using git diff: ${error}, continuing with manual diff`);
        }
        
        // 如果没有找到差异，添加一个默认的修改
        const fileExt = path.extname(relativePath);
        let commentPrefix = '//';
        
        if (fileExt === '.py') {
            commentPrefix = '#';
        } else if (fileExt === '.sh' || fileExt === '.bash') {
            commentPrefix = '#';
        } else if (fileExt === '.xml' || fileExt === '.html') {
            commentPrefix = '<!--';
        }
        
        const originalLines = originalContent.split('\n');
        
        // 查找合适的插入点 - 找一个非空行进行修改
        let insertLineIndex = -1;
        let insertedContent = '';
        
        // 寻找包含特定代码模式的行
        for (let i = 0; i < originalLines.length; i++) {
            const line = originalLines[i];
            if (line.includes('void ') || line.includes('bool ') || 
                line.includes('int ') || line.includes('QString ') ||
                line.includes('function') || line.includes('return ')) {
                
                insertLineIndex = i;
                // 在函数声明或定义行后添加一个日志语句
                if (fileExt === '.cpp' || fileExt === '.h' || fileExt === '.hpp') {
                    insertedContent = `    ${commentPrefix} 添加调试日志\n    qDebug() << "Function called";`;
                } else if (fileExt === '.js' || fileExt === '.ts') {
                    insertedContent = `    ${commentPrefix} 添加调试日志\n    console.log("Function called");`;
                } else if (fileExt === '.py') {
                    insertedContent = `    ${commentPrefix} 添加调试日志\n    print("Function called")`;
                } else {
                    insertedContent = `    ${commentPrefix} 添加调试日志`;
                }
                break;
            }
        }
        
        // 如果没找到合适的插入点，就在文件末尾添加注释
        if (insertLineIndex === -1) {
            const patch = `Index: ${workspaceDirName}/${relativePath}\n` +
                         '===================================================================\n' +
                         `--- ${workspaceDirName}.orig/${relativePath}\n` +
                         `+++ ${workspaceDirName}/${relativePath}\n` +
                         `@@ -${originalLines.length},0 +${originalLines.length},1 @@\n` +
                         ` ${originalLines[originalLines.length - 1]}\n` +
                         `+${commentPrefix} Added by Quilt Patch Creator\n`;
            return patch;
        } else {
            // 在找到的位置插入代码
            const linesBefore = originalLines.slice(0, insertLineIndex + 1);
            const linesAfter = originalLines.slice(insertLineIndex + 1);
            
            // 创建包含上下文的patch
            const contextStart = Math.max(0, insertLineIndex - 3);
            const contextEnd = Math.min(originalLines.length, insertLineIndex + 4);
            
            let patch = `Index: ${workspaceDirName}/${relativePath}\n` +
                        '===================================================================\n' +
                        `--- ${workspaceDirName}.orig/${relativePath}\n` +
                        `+++ ${workspaceDirName}/${relativePath}\n` +
                        `@@ -${contextStart + 1},${contextEnd - contextStart} +${contextStart + 1},${contextEnd - contextStart + 1} @@\n`;
            
            // 添加上下文行
            for (let i = contextStart; i < contextEnd; i++) {
                if (i === insertLineIndex) {
                    patch += ` ${originalLines[i]}\n`;
                    patch += `+${insertedContent}\n`;
                } else {
                    patch += ` ${originalLines[i]}\n`;
                }
            }
            
            return patch;
        }
    } finally {
        // 清理临时文件
        try {
            await fsPromises.unlink(tempOrigFile).catch(() => {});
            await fsPromises.unlink(tempModFile).catch(() => {});
        } catch (error) {
            // 忽略清理错误
        }
    }
}

// 手动创建patch文件
async function createManualPatch(patchName: string, fileDiffs: {path: string, content: string}[], patchesDir: string, seriesFile: string): Promise<void> {
    const patchFilePath = path.join(patchesDir, `${patchName}.patch`);
    let patchContent = '';
    
    // 组合所有文件的差异
    for (const diff of fileDiffs) {
        patchContent += diff.content + '\n';
    }
    
    // 写入patch文件
    await fsPromises.writeFile(patchFilePath, patchContent, 'utf8');
    outputChannel.appendLine(`Manually created patch file: ${patchFilePath}`);
    
    // 更新series文件
    let seriesContent = '';
    try {
        seriesContent = await fsPromises.readFile(seriesFile, 'utf8');
    } catch (error) {
        // 如果文件不存在，创建一个空的
    }
    
    // 检查是否已经包含了这个patch
    if (!seriesContent.includes(`${patchName}.patch`)) {
        seriesContent += `${patchName}.patch\n`;
        await fsPromises.writeFile(seriesFile, seriesContent, 'utf8');
        outputChannel.appendLine(`Updated series file to include ${patchName}.patch`);
    }
}

// 检查是否存在debian目录以及debian/patches目录
async function checkDebianPatches(workspaceFolder: vscode.WorkspaceFolder): Promise<{exists: boolean, patchesDir: string, seriesFile: string}> {
    const debianDir = path.join(workspaceFolder.uri.fsPath, 'debian');
    const debianPatchesDir = path.join(debianDir, 'patches');
    const debianSeriesFile = path.join(debianPatchesDir, 'series');
    
    try {
        const debianDirStats = await fsPromises.stat(debianDir);
        if (debianDirStats.isDirectory()) {
            outputChannel.appendLine(`Found debian directory: ${debianDir}`);
            
            // 检查debian/patches目录是否存在
            try {
                const patchesDirStats = await fsPromises.stat(debianPatchesDir);
                if (patchesDirStats.isDirectory()) {
                    outputChannel.appendLine(`Found debian/patches directory: ${debianPatchesDir}`);
                    return { exists: true, patchesDir: debianPatchesDir, seriesFile: debianSeriesFile };
                }
            } catch (error) {
                // debian/patches目录不存在，尝试创建
                outputChannel.appendLine(`debian/patches directory does not exist, creating it`);
                try {
                    await fsPromises.mkdir(debianPatchesDir, { recursive: true });
                    outputChannel.appendLine(`Created debian/patches directory`);
                    return { exists: true, patchesDir: debianPatchesDir, seriesFile: debianSeriesFile };
                } catch (mkdirError) {
                    outputChannel.appendLine(`Error creating debian/patches directory: ${mkdirError}`);
                }
            }
        }
    } catch (error) {
        outputChannel.appendLine(`debian directory not found, using default patches directory`);
    }
    
    // 如果没有debian目录或创建失败，返回默认路径
    const defaultPatchesDir = path.join(workspaceFolder.uri.fsPath, 'patches');
    const defaultSeriesFile = path.join(defaultPatchesDir, 'series');
    return { exists: false, patchesDir: defaultPatchesDir, seriesFile: defaultSeriesFile };
}

export function activate(context: vscode.ExtensionContext) {
    // 创建输出通道
    outputChannel = vscode.window.createOutputChannel('Quilt Patch Creator');
    
    // 显示输出面板并清除之前的内容
    outputChannel.clear();
    outputChannel.show(true);  // true 表示强制获取焦点
    
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
            } catch (error) {
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

            // 检查debian目录
            const { exists: debianExists, patchesDir, seriesFile } = await checkDebianPatches(workspaceFolder);
            if (debianExists) {
                outputChannel.appendLine(`Using debian patches directory: ${patchesDir}`);
            } else {
                outputChannel.appendLine(`Using standard patches directory: ${patchesDir}`);
            }

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
                description: status,  // 显示文件状态
                picked: true  // 默认选中所有修改的文件
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

            // 创建所有选中文件的备份
            const selectedFilePaths = selectedItems.map(item => item.label);
            const fileBackups = await backupWorkspaceFiles(selectedFilePaths, workspaceFolder);
            outputChannel.appendLine(`Backed up ${fileBackups.length} files before patch creation`);

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
            await cleanQuiltState(workspaceFolder, patchesDir);

            // 初始化quilt环境
            outputChannel.appendLine('\n=== Initializing quilt ===');
            const quiltrcContent = `QUILT_PATCHES=${path.relative(workspaceFolder.uri.fsPath, patchesDir)}`;
            const quiltrcPath = path.join(workspaceFolder.uri.fsPath, '.quiltrc');
            
            // 创建.quiltrc文件以设置QUILT_PATCHES
            await fsPromises.writeFile(quiltrcPath, quiltrcContent, 'utf8');
            outputChannel.appendLine(`Created .quiltrc file with content: ${quiltrcContent}`);

            await runQuiltCommand('quilt init', workspaceFolder.uri.fsPath);

            // 创建新的patch
            outputChannel.appendLine(`\n=== Creating new patch: ${patchName}.patch ===`);
            await runQuiltCommand(`quilt new ${patchName}.patch`, workspaceFolder.uri.fsPath);

            // 用于跟踪实际处理的文件数量
            let processedFileCount = 0;
            // 存储所有文件的差异
            const fileDiffs: {path: string, content: string}[] = [];

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
                        } else {
                            outputChannel.appendLine('File content differs from git HEAD.');
                        }
                    } catch (error) {
                        // Error is logged by getGitFileContent, here we just ensure originalContent is empty for new/unreadable files.
                        outputChannel.appendLine(`Proceeding with empty original content for ${relativeFilePath} due to previous error.`);
                        originalContent = ''; 
                    }

                    // 检查文件内容是否有任何变化 - 仅仅在创建全新patch时才检查与HEAD是否相同
                    // 对于已有patch的文件，我们总是尝试添加，因为用户可能在之前的patch之上又做了修改
                    if (currentContent === originalContent) {
                        // 进一步检查是否有实际的更改
                        const hasChanges = await hasRealChanges(currentContent, originalContent, absoluteFilePath, workspaceFolder);
                        if (!hasChanges) {
                            outputChannel.appendLine(`WARNING: No real changes detected for ${relativeFilePath}. Skipping this file.`);
                            continue; // Skip this file as there's no difference
                        }
                        outputChannel.appendLine(`Changes detected for ${relativeFilePath} despite content matching. Proceeding with patch.`);
                    }

                    // 添加文件到quilt（仍使用quilt进行文件跟踪）
                    outputChannel.appendLine('\n=== Adding file to patch ===');
                    const addCommand = `quilt add "${relativeFilePath.replace(/"/g, '\\"')}"`;
                    await runQuiltCommand(addCommand, workspaceFolder.uri.fsPath);

                    // 生成差异并存储
                    outputChannel.appendLine('Generating patch content...');
                    const patchContent = await generatePatchContent(originalContent, currentContent, relativeFilePath, workspaceFolder);
                    fileDiffs.push({ path: relativeFilePath, content: patchContent });
                    outputChannel.appendLine(`Generated patch content for ${relativeFilePath}`);
                    
                    // 增加计数器
                    processedFileCount++;
                } catch (error) {
                    const errorMessage = `Error processing file ${relativeFilePath}: ${error instanceof Error ? error.message : String(error)}`;
                    outputChannel.appendLine(errorMessage);
                    vscode.window.showErrorMessage(errorMessage);
                    // Decide if we should continue with other files or stop. For now, it continues.
                }
            }

            // 只有当实际处理了文件时才创建patch
            if (processedFileCount > 0) {
                // 手动创建patch文件
                outputChannel.appendLine('\n=== Creating patch file ===');
                await createManualPatch(patchName, fileDiffs, patchesDir, seriesFile);

                // 检查patch文件
                const patchFile = path.join(patchesDir, `${patchName}.patch`);
                try {
                    const patchContent = await fsPromises.readFile(patchFile, 'utf8');
                    if (!patchContent.trim()) {
                        outputChannel.appendLine(`ERROR: Generated patch file is empty!`);
                        vscode.window.showErrorMessage(`The generated patch file "${patchName}.patch" is empty. Please check the output for details.`);
                    } else {
                        outputChannel.appendLine(`\nSuccessfully created patch: ${patchName}.patch`);
                        outputChannel.appendLine(`Patch content (first 500 chars):\n${patchContent.substring(0, 500)}${patchContent.length > 500 ? '...' : ''}`);
                        vscode.window.showInformationMessage(`Successfully created patch: ${patchName}.patch`);
                    }
                } catch (error) {
                    outputChannel.appendLine(`Error reading patch file: ${error}`);
                    vscode.window.showErrorMessage(`Error reading the generated patch file. Please check the output for details.`);
                }
            } else {
                outputChannel.appendLine('\n=== No files were modified, not creating patch ===');
                // 删除空patch文件
                try {
                    const patchFile = path.join(patchesDir, `${patchName}.patch`);
                    await fsPromises.unlink(patchFile);
                    outputChannel.appendLine(`Removed empty patch file: ${patchName}.patch`);
                    
                    // 从series文件中移除
                    let seriesContent = await fsPromises.readFile(seriesFile, 'utf8');
                    seriesContent = seriesContent.replace(`${patchName}.patch\n`, '');
                    await fsPromises.writeFile(seriesFile, seriesContent, 'utf8');
                    outputChannel.appendLine('Updated series file');
                    
                    vscode.window.showWarningMessage('No modified files were added to the patch. No patch was created.');
                } catch (error) {
                    outputChannel.appendLine(`Error cleaning up empty patch: ${error}`);
                }
            }

            // 恢复文件内容到创建patch前的状态
            outputChannel.appendLine('\n=== Restoring workspace files ===');
            await restoreWorkspaceFiles(fileBackups);
            outputChannel.appendLine(`Restored ${fileBackups.length} files to their original state`);

            outputChannel.appendLine('Patch creation completed');
        } catch (error) {
            outputChannel.appendLine(`Error in patch creation: ${error}`);
            vscode.window.showErrorMessage('An error occurred while creating the patch. Please check the output panel for details.');
        }
    });

    // 注册测试命令
    let testDisposable = vscode.commands.registerCommand('quilt-patch-extension.testQuiltProcess', async () => {
        try {
            // 确保输出面板可见
            outputChannel.show(true);
            
            // 获取工作区
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                const message = 'No workspace folder found. Please open a folder first.';
                outputChannel.appendLine(`Error: ${message}`);
                vscode.window.showErrorMessage(message);
                return;
            }

            // 运行测试
            await testQuiltProcess(workspaceFolder);
        } catch (error) {
            outputChannel.appendLine(`Error in test: ${error}`);
            vscode.window.showErrorMessage('An error occurred during the test. Please check the output panel for details.');
        }
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(testDisposable);
}