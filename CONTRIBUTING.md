# 贡献指南

感谢您对Quilt Patch Creator的关注！我们欢迎各种形式的贡献，包括但不限于：

- 功能请求和建议
- 问题报告
- 代码改进和新功能实现
- 文档完善

## 如何贡献

### 报告Bug

如果您发现了Bug或问题，请通过GitHub Issues进行报告。请尽可能详细地描述问题，包括：

1. 问题描述
2. 复现步骤
3. 预期行为
4. 实际行为
5. 系统环境（操作系统、VSCode版本等）
6. 截图（如果适用）

### 提交改进

如果您想贡献代码，请按照以下流程操作：

1. Fork项目到您的GitHub账户
2. 创建一个新的分支进行开发
3. 在您的分支上进行更改
4. 确保您的代码符合项目的编码风格
5. 运行测试确保没有引入新的问题
6. 提交Pull Request到主仓库的master分支
7. 在PR描述中清楚说明您的更改内容和目的

### 开发流程

```bash
# 克隆您fork的仓库
git clone https://github.com/YOUR_USERNAME/quilt-patch-vscode.git
cd quilt-patch-vscode

# 安装依赖
npm install

# 编译代码
npm run compile

# 本地测试
code --extensionDevelopmentPath=/path/to/your/project
```

## 编码规范

- 使用TypeScript编写代码
- 遵循项目已有的代码风格
- 为所有新功能编写适当的文档
- 尽可能添加单元测试

## 开源许可

通过贡献代码，您同意您的贡献将在项目的MIT许可证下发布。 