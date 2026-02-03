# LumiWallet

> Agent-powered Smart Wallet Chrome Extension for Monad Hackathon

## 🎯 项目简介

LumiWallet 是一个智能钱包 Chrome 插件，在用户进行链上交易时提供 AI 驱动的风险分析和决策支持。

**赛道：** Track 3 - 智能体驱动的应用   
**团队：** WalletLab (3人)  
**时长：** 1个月

## 🚀 核心功能

- **智能风险分析**：钓鱼地址检测、合约风险感知、DEX滑点解释
- **无缝交易体验**：支持转账、合约交互、DEX交易（1inch + Uniswap）
- **单链单币支持**：专注 Monad 测试网和 Mon 代币
- **实时决策支持**：基于交易上下文提供可解释的风险提示

## 📦 项目结构

```
LumiWallet/
├── extension/      # Chrome 钱包插件
├── agent/          # AI 风险分析服务
├── contracts/      # 测试智能合约
├── dapp/           # 测试场景 DApp
└── docs/           # 项目文档
```

## 🏃 开始开发

### 前置要求

- Node.js >= 18
- Python >= 3.9
- Chrome 浏览器

### 模块初始化

各模块负责同学请在对应目录下自行初始化项目：

- **Extension 同学**：在 `extension/` 目录初始化 React + TypeScript + Vite 项目
- **Agent 同学**：在 `agent/` 目录初始化 Python 项目
- **Contract 同学**：
  - 在 `contracts/` 目录初始化 Hardhat 项目
  - 在 `dapp/` 目录初始化 React + TypeScript 项目

## 👥 团队分工

### 队长
- 钱包路径设计
- 智能合约开发（测试用的漏洞合约等）
- DApp 场景构造
- 整体协调

### Agent 同学
- 选择并搭建 Python Web 框架
- 实现三个风险分析器：
  - 钓鱼地址检测
  - 合约风险分析
  - DEX 滑点计算
- 集成 LLM API
- SQLite 数据库管理

### 插件同学
- Chrome Extension 架构设计
- 钱包核心功能（助记词导入、签名、存储）
- UI/UX 实现（参考 MetaMask）
- 与 Agent API 集成
- 风险提示展示

## 📝 开发注意事项

1. **类型同步**：Extension 和 DApp 使用 `shared/types/`，Agent(Python) 需手动同步类型定义
2. **合约地址**：部署后更新到 `shared/constants/contracts.ts`
3. **Git 协作**：各模块在独立分支开发，定期合并到 main


## 📄 许可证

MIT License

---

**WalletLab** - Building safer blockchain experiences 🛡️
