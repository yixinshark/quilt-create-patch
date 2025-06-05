# Quilt Create Patch - VSCode Extension

这个VSCode扩展提供了类似IDEA的patch创建功能，使用quilt来管理和生成patch文件。

## 功能特点

- 使用quilt管理patch文件
- 提供友好的文件选择界面
- 支持多文件patch创建
- 不依赖git

## 前置要求

- Linux系统
- 已安装quilt (`sudo apt-get install quilt` 或对应的包管理器命令)
- VSCode 1.60.0 或更高版本

## 使用方法

1. 在VSCode中打开命令面板 (Ctrl+Shift+P)
2. 输入 "Create Patch using Quilt"
3. 选择要包含在patch中的文件
4. 输入patch名称
5. patch文件将会在工作目录的patches目录下生成

## 开发

### 安装依赖

```bash
npm install
```

### 运行和调试

1. 在VSCode中打开项目
2. 按F5启动调试会话
3. 在新的VSCode窗口中测试扩展

## 注意事项

- 确保工作目录有写入权限
- 建议在开始修改代码前初始化quilt环境
- patch文件会保存在工作目录的patches子目录中

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT 