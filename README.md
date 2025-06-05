# Quilt Create Patch - VSCode Extension

这个VSCode扩展提供了类似IDEA的patch创建功能，使用quilt来管理和生成patch文件。

## 功能特点

- 使用quilt管理patch文件
- 提供友好的文件选择界面
- 支持多文件patch创建
- 智能检测git修改的文件
- 支持debian/patches目录
- 保留工作区文件修改状态
- 智能生成有意义的差异

## 安装方法

### 方法一：直接安装VSIX文件（推荐）

1. 下载最新的[VSIX安装包](https://github.com/yixinshark/quilt-create-patch/releases/download/v0.1.0/quilt-patch-extension-0.1.0.vsix)
2. 在VSCode中，点击左侧的扩展图标（或按`Ctrl+Shift+P`并输入"Extensions: Install from VSIX..."）
3. 选择"从VSIX安装..."
4. 浏览并选择下载的.vsix文件
5. 安装完成后重启VSCode

### 方法二：从源码构建

```bash
git clone https://github.com/yixinshark/quilt-create-patch.git
cd quilt-create-patch
npm install
npm run compile
npm run package  # 生成VSIX文件
```

## 前置要求

- Linux系统
- 已安装quilt (`sudo apt-get install quilt` 或对应的包管理器命令)
- 已安装git (用于检测修改的文件)
- VSCode 1.60.0 或更高版本

## 使用方法

1. 在VSCode中打开命令面板 (Ctrl+Shift+P)
2. 输入 "Create Patch using Quilt"
3. 扩展会自动检测git修改的文件并显示选择界面
4. 选择要包含在patch中的文件
5. 输入patch名称
6. 扩展会自动生成patch文件

### Patch文件存放位置

扩展会智能检测项目结构并决定patch文件的存放位置：

- 如果项目包含`debian`目录，patch文件会保存在`debian/patches`目录下
- 如果没有`debian`目录，patch文件会保存在项目根目录的`patches`子目录中

## 特殊功能

### 智能差异生成

即使文件内容看起来相同，扩展也能智能检测实际的代码更改：

- 使用外部diff命令确保准确的差异检测
- 当找不到明显差异时，会根据文件类型添加有意义的调试代码
- 支持各种编程语言的调试语句生成

### 工作区文件保护

扩展会在整个过程中保护您的工作区文件：

- 在创建patch前备份所有文件内容
- 完成后恢复所有文件的原始修改状态
- 不会丢失您的未提交更改

## 开发

### 安装依赖

```bash
npm install
```

### 运行和调试

1. 在VSCode中打开项目
2. 按F5启动调试会话
3. 在新的VSCode窗口中测试扩展

### 测试功能

扩展还包含一个测试命令用于调试：

1. 在VSCode中打开命令面板 (Ctrl+Shift+P)
2. 输入 "Test Quilt Process (Debug)"
3. 查看输出面板了解详细执行过程

## 注意事项

- 确保工作目录有写入权限
- 确保git和quilt已正确安装
- 在使用前最好有一些未提交的修改

## 问题反馈

如果您在使用过程中遇到任何问题，请[提交issue](https://github.com/yixinshark/quilt-create-patch/issues)。

## 贡献

欢迎提交Issue和Pull Request！请参阅[贡献指南](CONTRIBUTING.md)了解更多信息。

## 许可证

[MIT](LICENSE) 