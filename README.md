# 流量消耗器 (Traffic Consumer)

多线程网络拉流与流量压测工具，支持限速、定时与多端可视化监控，适用于带宽压测、CDN 拉流验证、专线稳定性巡检等场景。

## 部署与运行

### Docker 快速部署（推荐）

Docker 镜像集成了全部依赖，适合快速上线或在多环境复用配置。

#### 直接拉取镜像

```bash
docker pull baitaotao521/traffic_consumer:latest
```

#### 启动 Web 控制台

```bash
docker run -d \
  -p 5001:5001 \
  -v $HOME/.traffic_consumer_data:/root/.traffic_consumer \
  --name traffic_consumer \
  baitaotao521/traffic_consumer:latest
```

- 浏览器访问 `http://宿主机IP:5001` 即可使用控制台。
- `-v` 将配置与统计落地到宿主机，避免容器删除导致数据丢失。
- 默认以 Web 模式运行，适合图形化调度与监控。

#### 切换命令行模式

```bash
docker run -it --rm \
  -v $HOME/.traffic_consumer_data:/root/.traffic_consumer \
  baitaotao521/traffic_consumer:latest \
  python traffic_consumer.py --no-gui --limit 5 --duration 600
```

#### 常用容器管理命令

```bash
docker logs -f traffic_consumer        # 追踪日志
docker stop traffic_consumer           # 停止容器
docker start traffic_consumer          # 重新启动
docker rm traffic_consumer             # 删除容器（需先停止）
```

Windows PowerShell 可将数据目录映射为 `$HOME\.traffic_consumer_data`，CMD 则使用 `%USERPROFILE%\.traffic_consumer_data`。

### Docker 镜像本地构建

需要自定义基础镜像或调试最新代码时，可本地构建：

```bash
docker build -t traffic_consumer:local .
docker run -p 5001:5001 traffic_consumer:local
```

如需无界面模式，可覆盖默认 CMD：

```bash
docker run -it traffic_consumer:local python traffic_consumer.py --no-gui
```

### 本地环境部署

Docker 之外，仍可在本地直接运行：

```bash
git clone https://github.com/baitaotao521/traffic_consumer.git
cd traffic_consumer
python -m venv .venv
.venv\Scripts\activate  # Windows PowerShell
# source .venv/bin/activate  # Linux / macOS
pip install -U pip
pip install -r requirements.txt

# 启动 Web 控制台
python traffic_consumer.py

# 或启动命令行模式
python traffic_consumer.py --no-gui --urls https://example.com/a.bin https://example.com/b.bin
```

## 项目简介

`traffic_consumer.py` 集成多线程下载、限速、调度与统计存储；`web_ui.py` 基于 Flask + Socket.IO 提供实时可视化与配置管理。通过令牌桶限速器、线程状态跟踪与 APScheduler 调度器，帮助运维/测试团队快速模拟大流量场景并收集反馈数据。

## 核心功能

- **双运行模式**：默认启动 Web 控制台，可通过 `--no-gui` 切换纯命令行。
- **多线程拉流**：默认 8 线程，可按需调整并发、限速、次数、时长与总流量。
- **灵活 URL 策略**：支持随机/轮询两种策略，自动统计各 URL 使用比例并识别失效链接。
- **计划任务调度**：支持 Cron 与固定间隔两种调度方式，Web UI 显示下一次执行时间与倒计时。
- **实时可视化**：速度折线图、线程饼图、URL 占比、调度历史、日志流等信息一览无余。
- **配置与历史持久化**：所有配置、运行历史存储于主目录 `.traffic_consumer/`，方便跨模式复用。
- **跨平台交付**：支持 Windows、Linux、macOS，提供 PyInstaller 打包与 Docker 镜像。

## Web 控制台要点

- **核心仪表盘**：实时展示总流量、瞬时速度、下载次数及当前配置。
- **图表视图**：通过 Chart.js 呈现速度趋势、线程状态与 URL 使用占比。
- **配置编辑器**：图形化维护 URLs、线程数、限速与停止条件，支持保存、载入和复制配置。
- **调度与历史**：显示计划任务详情、下一次执行时间、倒计时与最近 50 条执行记录。
- **实时日志**：按需开启 Socket 推送日志，支持 ANSI 颜色解析、自动滚动与清空。
- **失效链接告警**：单个 URL 连续失败超限时自动推送高亮提示。

## 调度与自动化

- `--cron` 与 `--interval` 两种调度互斥，底层依赖 APScheduler。
- Web UI 提供 Cron 预览接口，保存前可先查看未来 5 次触发时间。
- 调度任务执行完毕后会写入历史记录并更新下一次触发时间；支持通过 Web UI 停止调度器。

## 配置、日志与历史数据

- 配置文件：`~/.traffic_consumer/config.json`
- 历史统计：`~/.traffic_consumer/stats.json`
- CLI 与 Web UI 共用同一套数据，可互相保存/载入。
- 历史记录包含运行时间、流量、下载次数、URL 使用次数与线程状态快照。
- `--show-stats` 可在命令行快速浏览最近执行概况。

## 命令行参数速查

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `-u, --urls` | 下载 URL 列表，可指定多个 | 内置测试 URL |
| `--url-strategy` | URL 选择策略：`random` / `round_robin` | `random` |
| `-t, --threads` | 并发下载线程数 | `8` |
| `-l, --limit` | 总体限速，单位 MB/s，`0` 为不限速 | `0` |
| `-d, --duration` | 运行时长（秒） | 无限制 |
| `-c, --count` | 下载次数 | 无限制 |
| `--traffic-limit` | 消耗流量上限（MB） | 无限制 |
| `--cron` | Cron 表达式定时执行 | 不启用 |
| `--interval` | 固定间隔执行（分钟） | 不启用 |
| `--config` | 配置名称 | `default` |
| `--save-config` | 保存当前参数到配置文件 | 关闭 |
| `--load-config` | 从配置文件加载参数 | 关闭 |
| `--list-configs` | 列出所有配置 | 关闭 |
| `--delete-config` | 删除指定配置 | 关闭 |
| `--show-stats` | 输出历史统计 | 关闭 |
| `--stats-limit` | 历史统计条目数 | `5` |
| `--no-gui` | 禁用 Web UI，进入 CLI 模式 | 关闭 |

## 架构与文件结构

- `traffic_consumer.py`：命令行入口，包含限速器、调度器、多线程逻辑与配置存储。
- `web_ui.py`：Flask + Socket.IO 服务端，负责状态推送、配置 CRUD 与任务控制。
- `static/`、`templates/`：前端静态资源与模板，包含 Chart.js 图表、日志面板与配置编辑器。
- `.github/workflows/build-simple.yml`：CI/CD 工作流，构建多平台可执行文件与 Docker 镜像。
- `build_config.py`：本地 PyInstaller 构建脚本，统一打包参数。
- `Dockerfile`：容器镜像构建配置。
- `requirements.txt`：Python 依赖清单。
- `BUILD_GUIDE.md`：自动化构建与发布指南。

## 构建与发布

- GitHub Actions 会在 push、tag 或手动触发时：
  - 构建 Linux/Windows/macOS 单文件可执行程序；
  - 构建并推送多架构 Docker 镜像；
  - 若是标签发布，自动创建 Release 并附带产物。
- 本地打包：`python build_config.py`
- 手动 PyInstaller：`pyinstaller --onefile traffic_consumer.py`
- 详细说明参考 [`BUILD_GUIDE.md`](BUILD_GUIDE.md)。

## 测试与质量

- 建议使用 `pytest` 编写单元与集成测试，测试文件放入 `tests/` 目录。
- 对限速器、调度器、配置持久化建议使用桩或模拟，避免真实网络请求开销。
- 提交前运行 `pytest` 以及 `ruff`/`black` 等静态检查工具保持代码整洁。

## 常见问题

- **启动后没有进入 CLI？** 默认会运行 Web UI，需显式添加 `--no-gui`。
- **速度显示为 0？线程全部空闲？** 检查 URL 是否有效，或是否提前触发限速 / 流量 / 次数上限。
- **Cron 表达式报错？** 使用 Web UI 的 Cron 预览功能校验语法后再保存。
- **日志过多导致浏览器卡顿？** Web UI 默认关闭日志推送，可按需开启，并提供清空按钮限制数量。

## 贡献指南

欢迎通过 Issue 与 Pull Request 贡献改进：

1. Fork 仓库并创建特性分支（`git checkout -b feat/my-feature`）。
2. 根据 Conventional Commits 准则编写提交信息。
3. 补充或更新相关测试、文档、截图。
4. 在 PR 中说明动机、验证步骤与影响范围。

## 许可证

本项目采用 MIT License 发布，欢迎在遵循协议的前提下自由使用与二次开发。

