# 自动化构建指南

本项目使用GitHub Actions自动构建Windows和Linux可执行文件。

## 🚀 自动构建

### 触发条件

构建会在以下情况自动触发：

1. **推送到主分支** (`main` 或 `master`)
2. **创建标签** (格式: `v*`, 如 `v1.0.0`)
3. **手动触发** (在GitHub Actions页面)

### 构建产物

每次构建会生成Linux可执行文件：

- **Linux版本**: `traffic_consumer_linux`

## 📦 下载构建文件

### 方式1: GitHub Actions Artifacts

1. 进入项目的 [Actions页面](../../actions)
2. 点击最新的构建任务
3. 在页面底部的 "Artifacts" 部分下载对应平台的文件

### 方式2: GitHub Releases (仅标签构建)

1. 进入项目的 [Releases页面](../../releases)
2. 下载最新版本的压缩包
3. 解压后即可使用

## 🛠️ 本地构建

如果需要在本地构建可执行文件：

### 安装依赖

```bash
pip install -r requirements.txt
pip install pyinstaller
```

### 使用构建脚本

```bash
python build_config.py
```

### 手动构建

```bash
# 构建可执行文件
pyinstaller --onefile --name traffic_consumer_local traffic_consumer.py
```

## 📋 构建配置

### GitHub Actions工作流

项目使用 `build-simple.yml` 工作流进行自动化构建，包含：
- 多平台构建支持 (Linux/Windows)
- 自动测试构建的可执行文件
- 构建产物上传和发布
- 使用最新的Actions版本 (upload-artifact@v4, download-artifact@v4)

### PyInstaller配置

- 使用 `--onefile` 参数生成单个可执行文件
- 打包时会自动包含 `templates/` 与 `static/` 目录，避免 Web UI 静态资源 404
- 自动包含所有必要的依赖项
- 针对不同平台优化文件名

## 🔧 自定义构建

### 修改构建配置

编辑 `.github/workflows/build-simple.yml` 文件来自定义构建行为：

```yaml
# 添加更多平台
strategy:
  matrix:
    include:
      - os: ubuntu-latest
        platform: linux
      - os: windows-latest  
        platform: windows
      - os: macos-latest    # 添加macOS支持
        platform: macos
```

### 添加构建选项

在 `build_config.py` 中修改PyInstaller参数：

```python
cmd = [
    "pyinstaller",
    "--onefile",
    "--clean",
    "--noconfirm",
    "--windowed",  # 添加此选项隐藏控制台窗口(仅Windows GUI)
    "--name", output_name,
    script_name
]
```

## 🐛 故障排除

### 常见问题

1. **构建失败**: 检查依赖项是否正确安装
2. **可执行文件无法运行**: 确保目标系统有必要的运行时库
3. **文件过大**: 考虑使用 `--exclude-module` 排除不需要的模块

### 调试构建

查看GitHub Actions日志：
1. 进入Actions页面
2. 点击失败的构建任务
3. 展开相关步骤查看详细日志

## 📝 版本发布

创建新版本发布：

```bash
# 创建并推送标签
git tag v1.0.0
git push origin v1.0.0
```

这将自动触发构建并创建GitHub Release。
